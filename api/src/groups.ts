// グループ・メンバー・「行った」の SQL（形の正本は docs/design/data-model.md の「設計のポイント」）。
// 「読んで、判断して、書く」を1つの SQL か batch に収める。D1 には途中で他の人を待たせるトランザクションがないので、
// 判断は書き込む SQL の WHERE の中でする。batch はエラーのときだけ全部取り消される（0行では取り消されない）

import { newGroupId, roomKey, jstToday } from "./ids";
import { nameKey } from "./names";

export const MAX_MEMBERS = 20;

/** D1 の制約のエラーを見分ける（どの制約かはエラーの文で分かる） */
export function constraintError(e: unknown): "name_taken" | "group_full" | null {
  const msg = e instanceof Error ? e.message : "";
  if (/UNIQUE constraint failed: members\.group_id, members\.name_key/.test(msg)) return "name_taken";
  if (/group_full/.test(msg)) return "group_full";
  return null;
}

/**
 * 色を決める SQL の部品（REQ-021）。0〜9 のうち、そのグループで使っている人が少ない順、同じなら番号の小さい順。
 * 使われていない色（0人）が先に来るので、「使われていない色から順に、足りなければ一番少ない色」になる
 */
const PICK_COLOR = `(SELECT column1 FROM (VALUES (0),(1),(2),(3),(4),(5),(6),(7),(8),(9))
  ORDER BY (SELECT count(*) FROM members WHERE group_id = ?1 AND color = column1), column1 LIMIT 1)`;

export type CreateResult = { groupId: string; memberId: number };

/**
 * グループを作り、作った人を最初のメンバー（色 0）にする（REQ-001）。
 * 作成者として特別な扱いはしない（ADR 0013）。グループとメンバーを1つの batch で入れる
 */
export async function createGroup(db: D1Database, groupName: string, name: string): Promise<CreateResult> {
  const groupId = newGroupId();
  const results = await db.batch([
    db
      .prepare("INSERT INTO groups (id, name, last_opened_on, room_key) VALUES (?, ?, ?, ?)")
      .bind(groupId, groupName, jstToday(), await roomKey(groupId)),
    db.prepare("INSERT INTO members (group_id, name, name_key, color) VALUES (?, ?, ?, 0) RETURNING id").bind(groupId, name, nameKey(name)),
  ]);
  const memberId = (results[1].results[0] as { id: number }).id;
  return { groupId, memberId };
}

export type JoinResult =
  | { ok: true; memberId: number }
  | { ok: false; reason: "group_not_found" | "group_full" }
  | { ok: false; reason: "name_taken"; memberId: number };

/** 同じ名前の人の番号を引く（UNIQUE の索引を使う） */
function sameNameStmt(db: D1Database, groupId: string, key: string) {
  return db.prepare("SELECT id FROM members WHERE group_id = ? AND name_key = ?").bind(groupId, key);
}

/**
 * 新しいメンバーとして参加する（REQ-004・REQ-005・REQ-008）。グループがあること・20人未満であることを1つの SQL で確かめて入れる。
 * 同じ名前の人がいれば name_taken と、その人の番号を返す（画面が「（名前）さんとして入る」を出す：REQ-012）
 */
export async function joinGroup(db: D1Database, groupId: string, name: string): Promise<JoinResult> {
  const key = nameKey(name);
  try {
    const row = await db
      .prepare(
        `INSERT INTO members (group_id, name, name_key, color)
         SELECT ?1, ?2, ?3, ${PICK_COLOR}
         WHERE EXISTS (SELECT 1 FROM groups WHERE id = ?1)
           AND (SELECT count(*) FROM members WHERE group_id = ?1) < ${MAX_MEMBERS}
         RETURNING id`,
      )
      .bind(groupId, name, key)
      .first<{ id: number }>();
    if (row) return { ok: true, memberId: row.id };
  } catch (e) {
    const reason = constraintError(e);
    if (reason === "name_taken") {
      const same = await sameNameStmt(db, groupId, key).first<{ id: number }>();
      // 読み直す間に、その人が退出していることもある。そのときは 503 で「もう一度」（送り直せば新しいメンバーとして入れる）
      if (same) return { ok: false, reason, memberId: same.id };
      throw e;
    }
    if (reason === "group_full") return { ok: false, reason };
    throw e;
  }
  // 0行：グループがないか、満員か（判断は済んでいるので、ここは理由を返すためだけに読む）。
  // 満員のときは、人数の確かめで止まり、同じ名前の確かめ（UNIQUE）まで進まない。
  // すでにいる人が戻ってくる場面（REQ-012）を「満員」で断らないよう、先にそれを見る（人数は増えないので REQ-005 に反しない）
  const [g, same] = await db.batch([db.prepare("SELECT 1 FROM groups WHERE id = ?").bind(groupId), sameNameStmt(db, groupId, key)]);
  if (g.results.length === 0) return { ok: false, reason: "group_not_found" };
  const s = same.results[0] as { id: number } | undefined;
  if (s) return { ok: false, reason: "name_taken", memberId: s.id };
  return { ok: false, reason: "group_full" };
}

export type GroupView = {
  group: { name: string };
  members: { id: number; name: string; color: number }[];
  visits: { memberId: number; pref: number }[];
};

/**
 * グループを開く（地図に要るものを1回の batch で読む）。
 * members は参加した順（id の順）。「行った」は members と結合して、そのグループの分だけを読む
 */
export async function readGroup(db: D1Database, groupId: string): Promise<GroupView | null> {
  const [group, members, visits] = await db.batch([
    db.prepare("SELECT name FROM groups WHERE id = ?").bind(groupId),
    db.prepare("SELECT id, name, color FROM members WHERE group_id = ? ORDER BY id").bind(groupId),
    db
      .prepare(
        `SELECT v.member_id, v.pref FROM member_visits v JOIN members m ON m.id = v.member_id
         WHERE m.group_id = ? ORDER BY v.member_id, v.pref`,
      )
      .bind(groupId),
  ]);
  const g = group.results[0] as { name: string } | undefined;
  if (!g) return null;
  type MemberRow = { id: number; name: string; color: number };
  type VisitRow = { member_id: number; pref: number };
  return {
    group: { name: g.name },
    members: (members.results as MemberRow[]).map((m) => ({ id: m.id, name: m.name, color: m.color })),
    visits: (visits.results as VisitRow[]).map((v) => ({ memberId: v.member_id, pref: v.pref })),
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

export type WriteResult = { ok: true } | { ok: false; reason: "group_not_found" | "member_not_found" };

/**
 * メンバーの「行った」を付ける・外す（REQ-016・REQ-023）。
 * そのグループのメンバーであることを、同じ SQL の中で確かめて書く（ほかのグループの番号は通さない：NFR-006 (14)）
 */
export async function setMemberVisit(
  db: D1Database,
  groupId: string,
  memberId: number,
  pref: number,
  visited: boolean,
): Promise<WriteResult> {
  const inGroup = "EXISTS (SELECT 1 FROM members WHERE id = ?1 AND group_id = ?3)";
  const sql = visited
    ? `INSERT INTO member_visits (member_id, pref) SELECT ?1, ?2 WHERE ${inGroup} ON CONFLICT (member_id, pref) DO NOTHING`
    : `DELETE FROM member_visits WHERE member_id = ?1 AND pref = ?2 AND ${inGroup}`;
  const res = await db.prepare(sql).bind(memberId, pref, groupId).run();
  if (res.meta.changes > 0) return { ok: true };
  // 0行：もともと付いていた（外していた）のか、書けなかったのかを読み直して分ける
  const [g, m] = await db.batch([
    db.prepare("SELECT 1 FROM groups WHERE id = ?").bind(groupId),
    db.prepare("SELECT 1 FROM members WHERE id = ? AND group_id = ?").bind(memberId, groupId),
  ]);
  if (g.results.length === 0) return { ok: false, reason: "group_not_found" };
  if (m.results.length === 0) return { ok: false, reason: "member_not_found" };
  return { ok: true };
}
