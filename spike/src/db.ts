// グループとメンバーの操作。「読んで、判断して、書く」を1つの SQL か batch に収める。
// D1 には途中で他の人を待たせるトランザクションがないので、判断は SQL の中（WHERE）でする。
// batch は1つのまとまりとして実行され、途中で失敗したら全部取り消される。

import { nameKey } from "./names";

export const MAX_MEMBERS = 20;

/** 推測できないグループID（NFR-005）。英数字22文字 ≒ 128ビット */
export function newGroupId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(22));
  return [...bytes].map((b) => chars[b % chars.length]).join(""); // 62で割る偏りは試作では気にしない
}

function isUniqueError(e: unknown): boolean {
  return e instanceof Error && /UNIQUE constraint failed/.test(e.message);
}

/** グループを作り、作った人を最初のメンバー・作成者にする */
export async function createGroup(
  db: D1Database,
  groupName: string,
  creatorName: string,
  uid: string | null = null,
): Promise<{ groupId: string; memberId: number }> {
  const groupId = newGroupId();
  const results = await db.batch([
    db.prepare("INSERT INTO groups (id, name) VALUES (?, ?)").bind(groupId, groupName),
    db
      .prepare("INSERT INTO members (group_id, name, name_key, uid) VALUES (?, ?, ?, ?) RETURNING id")
      .bind(groupId, creatorName, nameKey(creatorName), uid),
    // 直前に入れたメンバーを作成者にする（同じ batch の中なので、ほかの操作は割り込まない）
    db.prepare("UPDATE groups SET owner_member_id = last_insert_rowid() WHERE id = ?").bind(groupId),
  ]);
  const memberId = (results[1].results[0] as { id: number }).id;
  return { groupId, memberId };
}

export type JoinResult =
  | { ok: true; memberId: number }
  | { ok: false; reason: "full" | "no_group" | "name_taken" | "already_linked" };

/**
 * 新しいメンバーとして参加する。満員・グループがない・名前が重複、を1つの SQL で判断する。
 * （同じ名前の既存メンバーとして入る REQ-012 は、この前に API で読んで分ける）
 */
export async function joinGroup(
  db: D1Database,
  groupId: string,
  name: string,
  uid: string | null = null,
): Promise<JoinResult> {
  try {
    const row = await db
      .prepare(
        `INSERT INTO members (group_id, name, name_key, uid)
         SELECT ?1, ?2, ?3, ?4
         WHERE EXISTS (SELECT 1 FROM groups WHERE id = ?1)
           AND (SELECT count(*) FROM members WHERE group_id = ?1) < ?5
         RETURNING id`,
      )
      .bind(groupId, name, nameKey(name), uid, MAX_MEMBERS)
      .first<{ id: number }>();
    if (row) return { ok: true, memberId: row.id };
  } catch (e) {
    if (isUniqueError(e)) {
      const byUid = e instanceof Error && /members\.uid/.test(e.message);
      return { ok: false, reason: byUid ? "already_linked" : "name_taken" };
    }
    throw e;
  }
  // 入らなかった理由を読み分ける（判断は済んでいるので、ここは説明のためだけ）
  const g = await db.prepare("SELECT 1 FROM groups WHERE id = ?").bind(groupId).first();
  return { ok: false, reason: g ? "full" : "no_group" };
}

/** 退出する。最後の1人ならグループも消す（同じ batch で） */
export async function leaveGroup(db: D1Database, groupId: string, memberId: number): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM members WHERE id = ? AND group_id = ?").bind(memberId, groupId),
    db
      .prepare(
        "DELETE FROM groups WHERE id = ?1 AND NOT EXISTS (SELECT 1 FROM members WHERE group_id = ?1)",
      )
      .bind(groupId),
  ]);
}

/** 「行った」を付ける・外す（押し直しても結果が変わらない） */
export async function setVisited(db: D1Database, memberId: number, pref: number, visited: boolean) {
  // INSERT OR IGNORE は使わない：重複だけでなく CHECK の違反（県の番号48など）まで黙って無視してしまう。
  // ON CONFLICT … DO NOTHING は、重複のときだけ何もしない
  const sql = visited
    ? "INSERT INTO visits (member_id, pref) VALUES (?, ?) ON CONFLICT (member_id, pref) DO NOTHING"
    : "DELETE FROM visits WHERE member_id = ? AND pref = ?";
  await db.prepare(sql).bind(memberId, pref).run();
}
