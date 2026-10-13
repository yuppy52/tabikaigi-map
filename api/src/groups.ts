// グループ・メンバー・「行った」の SQL（形の正本は docs/design/data-model.md の「設計のポイント」）。
// 「読んで、判断して、書く」を1つの SQL か batch に収める。D1 には途中で他の人を待たせるトランザクションがないので、
// 判断は書き込む SQL の WHERE の中でする。batch はエラーのときだけ全部取り消される（0行では取り消されない）

import { newGroupId, roomKey, jstToday } from "./ids";
import { nameKey } from "./names";

export const MAX_MEMBERS = 20;

/** D1 の制約のエラーを見分ける（どの制約かはエラーの文で分かる） */
export function constraintError(e: unknown): "name_taken" | "already_member" | "group_limit" | "group_full" | null {
  const msg = e instanceof Error ? e.message : "";
  if (/UNIQUE constraint failed: members\.group_id, members\.name_key/.test(msg)) return "name_taken";
  if (/UNIQUE constraint failed: members\.group_id, members\.uid/.test(msg)) return "already_member";
  if (/group_limit/.test(msg)) return "group_limit";
  if (/group_full/.test(msg)) return "group_full";
  return null;
}

/**
 * 色を決める SQL の部品（REQ-021）。0〜9 のうち、そのグループで使っている人が少ない順、同じなら番号の小さい順。
 * 使われていない色（0人）が先に来るので、「使われていない色から順に、足りなければ一番少ない色」になる
 */
const PICK_COLOR = `(SELECT column1 FROM (VALUES (0),(1),(2),(3),(4),(5),(6),(7),(8),(9))
  ORDER BY (SELECT count(*) FROM members WHERE group_id = ?1 AND color = column1), column1 LIMIT 1)`;

export type CreateResult =
  | { ok: true; groupId: string; memberId: number }
  | { ok: false; reason: "group_limit" };

/**
 * グループを作り、作った人を最初のメンバー（作成者）にする（REQ-001）。
 * ログイン済みなら、そのメンバーは最初から紐づく。10グループに達していれば、トリガーで batch ごと取り消される（REQ-060）
 */
export async function createGroup(db: D1Database, groupName: string, name: string, uid: string | null): Promise<CreateResult> {
  const groupId = newGroupId();
  const stmts: D1PreparedStatement[] = [];
  if (uid) stmts.push(db.prepare("INSERT INTO accounts (uid) VALUES (?) ON CONFLICT (uid) DO NOTHING").bind(uid));
  stmts.push(
    db.prepare("INSERT INTO groups (id, name, last_opened_on, room_key) VALUES (?, ?, ?, ?)").bind(groupId, groupName, jstToday(), await roomKey(groupId)),
    db
      .prepare("INSERT INTO members (group_id, name, name_key, color, is_owner, uid) VALUES (?, ?, ?, 0, 1, ?) RETURNING id")
      .bind(groupId, name, nameKey(name), uid),
  );
  try {
    const results = await db.batch(stmts);
    const memberId = (results[results.length - 1].results[0] as { id: number }).id;
    return { ok: true, groupId, memberId };
  } catch (e) {
    if (constraintError(e) === "group_limit") return { ok: false, reason: "group_limit" };
    throw e;
  }
}

export type JoinResult =
  | { ok: true; memberId: number }
  | { ok: false; reason: "group_not_found" | "group_full" | "already_member" | "group_limit" }
  | { ok: false; reason: "name_taken"; memberId: number; linked: boolean };

/**
 * 新しいメンバーとして参加する（REQ-004・REQ-005・REQ-008）。グループがあること・20人未満であることを1つの SQL で確かめて入れる。
 * 同じ名前の人がいれば name_taken と、その人が紐づいているかを返す（画面が REQ-012・REQ-013・REQ-043 を出し分ける）
 */
export async function joinGroup(db: D1Database, groupId: string, name: string, uid: string | null): Promise<JoinResult> {
  const key = nameKey(name);
  const insert = db
    .prepare(
      `INSERT INTO members (group_id, name, name_key, color, uid)
       SELECT ?1, ?2, ?3, ${PICK_COLOR}, ?4
       WHERE EXISTS (SELECT 1 FROM groups WHERE id = ?1)
         AND (SELECT count(*) FROM members WHERE group_id = ?1) < ${MAX_MEMBERS}
       RETURNING id`,
    )
    .bind(groupId, name, key, uid);
  try {
    let row: { id: number } | undefined;
    if (uid) {
      // アカウントの行が先に要る（members.uid の外部キーの先）
      const results = await db.batch([db.prepare("INSERT INTO accounts (uid) VALUES (?) ON CONFLICT (uid) DO NOTHING").bind(uid), insert]);
      row = results[1].results[0] as { id: number } | undefined;
    } else {
      row = (await insert.first<{ id: number }>()) ?? undefined;
    }
    if (row) return { ok: true, memberId: row.id };
  } catch (e) {
    const reason = constraintError(e);
    if (reason === "name_taken") {
      const same = await db
        .prepare("SELECT id, uid IS NOT NULL AS linked FROM members WHERE group_id = ? AND name_key = ?")
        .bind(groupId, key)
        .first<{ id: number; linked: number }>();
      // 読み直す間に、その人が退出していることもある。そのときは「もう一度」で入れる
      if (same) return { ok: false, reason, memberId: same.id, linked: same.linked === 1 };
      throw e;
    }
    if (reason === "already_member" || reason === "group_limit" || reason === "group_full") return { ok: false, reason };
    throw e;
  }
  // 0行：グループがないか、満員か（判断は済んでいるので、ここは理由を返すためだけに読む）
  const g = await db.prepare("SELECT 1 FROM groups WHERE id = ?").bind(groupId).first();
  return { ok: false, reason: g ? "group_full" : "group_not_found" };
}

export type GroupView = {
  group: { name: string; manageBy: "everyone" | "owner"; ownerOnly: boolean };
  members: { id: number; name: string; color: number; isOwner: boolean; linked: boolean; isMe: boolean }[];
  visits: { memberId: number; pref: number }[];
};

/**
 * グループを開く（地図に要るものを1回の batch で読む）。
 * ほかのメンバーの uid は返さない。「紐づいているか」「自分か」だけを返す（NFR-007）。
 * 紐づいたメンバーの「行った」は、アカウントの「行った」から読む（REQ-030）
 */
export async function readGroup(db: D1Database, groupId: string, uid: string | null): Promise<GroupView | null> {
  const [group, members, memberVisits, accountVisits] = await db.batch([
    db.prepare("SELECT name, manage_by FROM groups WHERE id = ?").bind(groupId),
    db
      .prepare(
        `SELECT id, name, color, is_owner, uid IS NOT NULL AS linked, coalesce(uid = ?2, 0) AS is_me
         FROM members WHERE group_id = ?1 ORDER BY id`,
      )
      .bind(groupId, uid),
    db
      .prepare(
        `SELECT v.member_id, v.pref FROM member_visits v JOIN members m ON m.id = v.member_id
         WHERE m.group_id = ? AND m.uid IS NULL ORDER BY v.member_id, v.pref`,
      )
      .bind(groupId),
    db
      .prepare(
        `SELECT m.id AS member_id, v.pref FROM account_visits v JOIN members m ON m.uid = v.uid
         WHERE m.group_id = ? ORDER BY m.id, v.pref`,
      )
      .bind(groupId),
  ]);
  const g = group.results[0] as { name: string; manage_by: "everyone" | "owner" } | undefined;
  if (!g) return null;
  type Row = { id: number; name: string; color: number; is_owner: number; linked: number; is_me: number };
  const rows = members.results as Row[];
  const owner = rows.find((m) => m.is_owner === 1);
  type VisitRow = { member_id: number; pref: number };
  return {
    group: {
      name: g.name,
      manageBy: g.manage_by,
      // 「作成者のみ」が効くのは、作成者のメンバーがいるときだけ（REQ-051）
      ownerOnly: g.manage_by === "owner" && owner !== undefined,
    },
    members: rows.map((m) => ({
      id: m.id,
      name: m.name,
      color: m.color,
      isOwner: m.is_owner === 1,
      linked: m.linked === 1,
      isMe: m.is_me === 1,
    })),
    visits: [...(memberVisits.results as VisitRow[]), ...(accountVisits.results as VisitRow[])].map((v) => ({
      memberId: v.member_id,
      pref: v.pref,
    })),
  };
}

/**
 * 最後に開かれた日を今日にする（NFR-010・Q-025）。読み取りとは別に、応答を返した後で流す。
 * 同じ日の2回目からは0行（書き込みはグループごとに1日1回まで）
 */
export async function touchGroup(db: D1Database, groupId: string): Promise<void> {
  const today = jstToday();
  await db.prepare("UPDATE groups SET last_opened_on = ?1 WHERE id = ?2 AND last_opened_on < ?1").bind(today, groupId).run();
}

export type WriteResult = { ok: true } | { ok: false; reason: "group_not_found" | "member_not_found" | "member_linked" };

/**
 * ログインなしのメンバーの「行った」を付ける・外す（REQ-016・REQ-023）。
 * 紐づいていないことを、同じ SQL の中で確かめて書く（紐づいたメンバーの「行った」はアカウントにある：NFR-006 (1)）
 */
export async function setMemberVisit(
  db: D1Database,
  groupId: string,
  memberId: number,
  pref: number,
  visited: boolean,
): Promise<WriteResult> {
  const unlinked = "EXISTS (SELECT 1 FROM members WHERE id = ?1 AND group_id = ?3 AND uid IS NULL)";
  const sql = visited
    ? `INSERT INTO member_visits (member_id, pref) SELECT ?1, ?2 WHERE ${unlinked} ON CONFLICT (member_id, pref) DO NOTHING`
    : `DELETE FROM member_visits WHERE member_id = ?1 AND pref = ?2 AND ${unlinked}`;
  const res = await db.prepare(sql).bind(memberId, pref, groupId).run();
  if (res.meta.changes > 0) return { ok: true };
  // 0行：もともと付いていた（外していた）のか、書けなかったのかを読み直して分ける
  const [g, m] = await db.batch([
    db.prepare("SELECT 1 FROM groups WHERE id = ?").bind(groupId),
    db.prepare("SELECT uid IS NOT NULL AS linked FROM members WHERE id = ? AND group_id = ?").bind(memberId, groupId),
  ]);
  if (g.results.length === 0) return { ok: false, reason: "group_not_found" };
  const member = m.results[0] as { linked: number } | undefined;
  if (!member) return { ok: false, reason: "member_not_found" };
  if (member.linked === 1) return { ok: false, reason: "member_linked" };
  return { ok: true };
}

/**
 * ログイン済みの人の「行った」を付ける・外す（REQ-030）。アカウントに書き、全グループで共有する。
 * 開いているグループに自分のメンバーがいるときだけ書く（いなければ 404 にして、画面に「削除された」を知らせる）
 */
export async function setAccountVisit(
  db: D1Database,
  groupId: string,
  uid: string,
  pref: number,
  visited: boolean,
): Promise<WriteResult> {
  const mine = "EXISTS (SELECT 1 FROM members WHERE group_id = ?3 AND uid = ?1)";
  const sql = visited
    ? `INSERT INTO account_visits (uid, pref) SELECT ?1, ?2 WHERE ${mine} ON CONFLICT (uid, pref) DO NOTHING`
    : `DELETE FROM account_visits WHERE uid = ?1 AND pref = ?2 AND ${mine}`;
  const res = await db.prepare(sql).bind(uid, pref, groupId).run();
  if (res.meta.changes > 0) return { ok: true };
  const [g, m] = await db.batch([
    db.prepare("SELECT 1 FROM groups WHERE id = ?").bind(groupId),
    db.prepare("SELECT 1 FROM members WHERE group_id = ? AND uid = ?").bind(groupId, uid),
  ]);
  if (g.results.length === 0) return { ok: false, reason: "group_not_found" };
  if (m.results.length === 0) return { ok: false, reason: "member_not_found" };
  return { ok: true };
}
