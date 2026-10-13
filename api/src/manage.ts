// 紐づけ・名前の変更・退出・管理の操作の SQL（形の正本は docs/design/data-model.md の「紐づけ」「退出・削除・退会」「管理できる人の操作」）。
// groups.ts と同じく、誰が通るかの判断は書き込む SQL の WHERE に入れ、0行なら読み直して理由を返す

import { constraintError } from "./groups";
import { nameKey } from "./names";

/** 断った理由（画面は error の値で知らせを読み分ける） */
export type Refused = "group_not_found" | "member_not_found" | "member_linked" | "not_allowed";

/**
 * 管理できる人か（REQ-044・REQ-051・NFR-006 (5)）。?2 がグループ、?3 がログイン済みの人の uid（ログインなしは NULL）。
 * 「誰でも」か、作成者のメンバーがいない（いなくなった）か、作成者のメンバーに紐づいた本人なら通す。
 * 「作成者のみ」の間、作成者のメンバーは必ず紐づいているので、紐づいていない作成者として通す分岐は作らない（data-model.md）
 */
const CAN_MANAGE = `(NOT EXISTS (SELECT 1 FROM groups WHERE id = ?2 AND manage_by = 'owner')
  OR NOT EXISTS (SELECT 1 FROM members WHERE group_id = ?2 AND is_owner = 1)
  OR EXISTS (SELECT 1 FROM members WHERE group_id = ?2 AND is_owner = 1 AND uid = ?3))`;

/** 管理できる人かだけを読む（0行だったときの理由を分けるため。判断そのものは書き込む SQL の WHERE でしている） */
async function canManage(db: D1Database, groupId: string, uid: string | null): Promise<boolean> {
  // ?1 は使わない（CAN_MANAGE はグループを ?2、uid を ?3 で受け取る形にそろえている）
  const row = await db.prepare(`SELECT ${CAN_MANAGE} AS ok`).bind(null, groupId, uid).first<{ ok: number }>();
  return row?.ok === 1;
}

/** 0行だったときに、グループとメンバーを読み直す（自分のものかは uid を返さずに比べる：NFR-007） */
async function readMember(db: D1Database, groupId: string, memberId: number, uid: string | null) {
  const [g, m] = await db.batch([
    db.prepare("SELECT 1 FROM groups WHERE id = ?").bind(groupId),
    db
      .prepare("SELECT uid IS NOT NULL AS linked, coalesce(uid = ?3, 0) AS mine FROM members WHERE id = ?1 AND group_id = ?2")
      .bind(memberId, groupId, uid),
  ]);
  const member = m.results[0] as { linked: number; mine: number } | undefined;
  return {
    group: g.results.length > 0,
    member: member && { linked: member.linked === 1, mine: member.mine === 1 },
  };
}

export type LinkResult = { ok: true } | { ok: false; reason: Refused | "already_member" | "group_limit" };

/**
 * 紐づいていないメンバーを、自分のアカウントに紐づける（REQ-037〜REQ-040・REQ-043）。
 * 紐づける文を先に置き、「行った」を移す文と消す文は「自分に紐づいていること」を EXISTS で確かめる
 * （紐づける文が0行でもエラーにならず batch の残りが動くため。ほかの人が先に紐づけたら、何もしない）。
 * merge：メンバーの「行った」をアカウントに足す。false：捨てる（REQ-038 の「アカウントのデータを使う」）
 */
export async function linkMember(db: D1Database, groupId: string, memberId: number, uid: string, merge: boolean): Promise<LinkResult> {
  const mine = "EXISTS (SELECT 1 FROM members WHERE id = ?1 AND group_id = ?2 AND uid = ?3)";
  const stmts = [
    db.prepare("INSERT INTO accounts (uid) VALUES (?) ON CONFLICT (uid) DO NOTHING").bind(uid),
    db.prepare("UPDATE members SET uid = ?3 WHERE id = ?1 AND group_id = ?2 AND uid IS NULL").bind(memberId, groupId, uid),
  ];
  if (merge) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO account_visits (uid, pref) SELECT ?3, pref FROM member_visits WHERE member_id = ?1 AND ${mine}
           ON CONFLICT (uid, pref) DO NOTHING`,
        )
        .bind(memberId, groupId, uid),
    );
  }
  // 紐づいたメンバーは member_visits に行を持たない（data-model.md の「member_visits」）
  stmts.push(db.prepare(`DELETE FROM member_visits WHERE member_id = ?1 AND ${mine}`).bind(memberId, groupId, uid));
  try {
    await db.batch(stmts);
  } catch (e) {
    // 同じグループに自分のメンバーがすでにいる（REQ-039）か、10グループに達している（REQ-060）。batch ごと取り消される
    const reason = constraintError(e);
    if (reason === "already_member" || reason === "group_limit") return { ok: false, reason };
    throw e;
  }
  // 紐づいたか（前から自分に紐づいていたときも成功）、ほかの人のものだったかを読み直す
  const r = await readMember(db, groupId, memberId, uid);
  if (!r.group) return { ok: false, reason: "group_not_found" };
  if (!r.member) return { ok: false, reason: "member_not_found" };
  return r.member.mine ? { ok: true } : { ok: false, reason: "member_linked" };
}

export type RenameResult = { ok: true } | { ok: false; reason: Refused | "name_taken" };

/**
 * 自分に紐づいたメンバーの名前を変える（REQ-014・REQ-015・NFR-006 (1)）。
 * ログインなしのメンバーの名前は誰も変えられない（WHERE の uid = 自分 に当たらない）
 */
export async function renameMember(db: D1Database, groupId: string, memberId: number, uid: string, name: string): Promise<RenameResult> {
  try {
    const res = await db
      // 同じ名前なら書かない（同じ値を繰り返し送られても、D1 の書き込みの枠を使わない）
      .prepare("UPDATE members SET name = ?4, name_key = ?5 WHERE id = ?1 AND group_id = ?2 AND uid = ?3 AND name IS NOT ?4")
      .bind(memberId, groupId, uid, name, nameKey(name))
      .run();
    if (res.meta.changes > 0) return { ok: true };
  } catch (e) {
    if (constraintError(e) === "name_taken") return { ok: false, reason: "name_taken" };
    throw e;
  }
  const r = await readMember(db, groupId, memberId, uid);
  if (!r.group) return { ok: false, reason: "group_not_found" };
  if (!r.member) return { ok: false, reason: "member_not_found" };
  // 自分のメンバーなのに0行なのは、同じ名前だったとき（変えずに成功）
  return r.member.mine ? { ok: true } : { ok: false, reason: "not_allowed" };
}

export type RemoveResult = { ok: true; groupDeleted: boolean } | { ok: false; reason: Refused };

/**
 * メンバーを消し、0人になったらグループも消す（同じ batch：REQ-050）。
 * 2つ目の文は1つ目の結果を見ずに「メンバーがいないグループ」だけを消す。0人のグループは残らない（作る・参加・退出・削除・退会の
 * どれでも0人で残さない）ので、消えるのはこの退出・削除で0人になったグループだけ。もし0人のグループが残っていても、消して困るものはない
 */
async function removeMember(
  db: D1Database,
  groupId: string,
  memberId: number,
  uid: string | null,
  allowed: string,
  refused: "member_linked" | "not_allowed",
): Promise<RemoveResult> {
  const [del, delGroup] = await db.batch([
    db.prepare(`DELETE FROM members WHERE id = ?1 AND group_id = ?2 AND ${allowed}`).bind(memberId, groupId, uid),
    db.prepare("DELETE FROM groups WHERE id = ? AND NOT EXISTS (SELECT 1 FROM members WHERE group_id = groups.id)").bind(groupId),
  ]);
  if (del.meta.changes > 0) return { ok: true, groupDeleted: delGroup.meta.changes > 0 };
  const r = await readMember(db, groupId, memberId, uid);
  if (!r.group) return { ok: false, reason: "group_not_found" };
  // もういない（2回押した、ほかの人が先に消した）ときは成功とする（data-model.md の「退出・削除・退会」）。
  // ただし削除は、管理できる人でなければ断る（「作成者のみ」のグループで、権限のない人に成功を返さない）
  if (!r.member) {
    if (refused === "not_allowed" && !(await canManage(db, groupId, uid))) return { ok: false, reason: "not_allowed" };
    return { ok: true, groupDeleted: false };
  }
  return { ok: false, reason: refused };
}

/**
 * 自分で退出する（REQ-049・REQ-050）。紐づいたメンバーは本人だけ（NFR-006 (12)）。
 * ログインなしのときは ?3 が NULL で `uid = NULL` は当たらないので、紐づいていないメンバーだけが退出できる
 */
export function leaveMember(db: D1Database, groupId: string, memberId: number, uid: string | null) {
  return removeMember(db, groupId, memberId, uid, "(uid IS NULL OR uid = ?3)", "member_linked");
}

/** 管理できる人がメンバーを削除する（REQ-048。紐づいたメンバーも消せる） */
export function deleteMember(db: D1Database, groupId: string, memberId: number, uid: string | null) {
  return removeMember(db, groupId, memberId, uid, CAN_MANAGE, "not_allowed");
}

export type GroupWriteResult = { ok: true } | { ok: false; reason: "group_not_found" | "not_allowed" };

/** 0行だったときに、グループがないのか、権限がないのかを分ける */
async function groupRefused(db: D1Database, groupId: string): Promise<GroupWriteResult> {
  const g = await db.prepare("SELECT 1 FROM groups WHERE id = ?").bind(groupId).first();
  return { ok: false, reason: g ? "not_allowed" : "group_not_found" };
}

/** グループ名を変える（REQ-046）。同じ名前なら書かない（同じ値を繰り返し送られても、D1 の書き込みの枠を使わない） */
export async function renameGroup(db: D1Database, groupId: string, uid: string | null, name: string): Promise<GroupWriteResult> {
  const res = await db.prepare(`UPDATE groups SET name = ?1 WHERE id = ?2 AND name IS NOT ?1 AND ${CAN_MANAGE}`).bind(name, groupId, uid).run();
  if (res.meta.changes > 0) return { ok: true };
  // 0行：ない・権限がない・同じ名前だった、を分ける
  const g = await db.prepare("SELECT 1 FROM groups WHERE id = ?").bind(groupId).first();
  if (!g) return { ok: false, reason: "group_not_found" };
  return (await canManage(db, groupId, uid)) ? { ok: true } : { ok: false, reason: "not_allowed" };
}

/** グループを削除する（REQ-047）。メンバーと member_visits は外部キーで消え、account_visits は残る */
export async function deleteGroup(db: D1Database, groupId: string, uid: string | null): Promise<GroupWriteResult> {
  // ?1 は使わない（CAN_MANAGE に合わせて、グループを ?2、uid を ?3 にする）
  const res = await db.prepare(`DELETE FROM groups WHERE id = ?2 AND ${CAN_MANAGE}`).bind(null, groupId, uid).run();
  return res.meta.changes > 0 ? { ok: true } : groupRefused(db, groupId);
}

/**
 * 管理できる人を変える（REQ-045・NFR-006 (4)）。作成者のメンバーに紐づいた本人だけ。
 * 作成者がいないグループでは誰も変えられない（EXISTS に当たらない）
 */
export async function setManageBy(db: D1Database, groupId: string, uid: string, manageBy: "everyone" | "owner"): Promise<GroupWriteResult> {
  const res = await db
    .prepare(
      `UPDATE groups SET manage_by = ?1 WHERE id = ?2
       AND EXISTS (SELECT 1 FROM members WHERE group_id = ?2 AND is_owner = 1 AND uid = ?3)`,
    )
    .bind(manageBy, groupId, uid)
    .run();
  return res.meta.changes > 0 ? { ok: true } : groupRefused(db, groupId);
}
