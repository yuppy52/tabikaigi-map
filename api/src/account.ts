// ログイン済みの人の、グループの外の操作（グループ一覧、マイページの「行った」、退会）の SQL。
// どれも ID トークンの uid の行だけを読み書きする（NFR-006 (2)(6)(7)）

export type MyGroup = { groupId: string; name: string; memberId: number };

/**
 * 自分に紐づいたメンバーがいるグループの一覧（REQ-032）。members (uid) の索引で引く。
 * 最近開かれた順（同じ日なら作った順の新しいほう）
 */
export async function listMyGroups(db: D1Database, uid: string): Promise<MyGroup[]> {
  const { results } = await db
    .prepare(
      `SELECT g.id AS group_id, g.name, m.id AS member_id FROM members m JOIN groups g ON g.id = m.group_id
       WHERE m.uid = ? ORDER BY g.last_opened_on DESC, g.created_at DESC, g.id`,
    )
    .bind(uid)
    .all<{ group_id: string; name: string; member_id: number }>();
  return results.map((r) => ({ groupId: r.group_id, name: r.name, memberId: r.member_id }));
}

/** アカウントの「行った」（マイページ：REQ-033） */
export async function listMyVisits(db: D1Database, uid: string): Promise<number[]> {
  const { results } = await db.prepare("SELECT pref FROM account_visits WHERE uid = ? ORDER BY pref").bind(uid).all<{ pref: number }>();
  return results.map((r) => r.pref);
}

/**
 * 退会する（REQ-036）。1つの batch で、(1) 自分のメンバーしかいないグループを消し（REQ-050）、
 * (2) アカウントの行を消す。(2) で、アカウントの「行った」と、紐づいたメンバー（と作成者の印）が外部キーで消える。
 * 消すものがなくても成功（Firebase のアカウントの削除に失敗したときのやり直し：auth-flow.md の 5.）
 */
export async function withdraw(db: D1Database, uid: string): Promise<void> {
  await db.batch([
    db
      .prepare(
        `DELETE FROM groups WHERE id IN (SELECT group_id FROM members WHERE uid = ?1)
         AND NOT EXISTS (SELECT 1 FROM members m WHERE m.group_id = groups.id AND (m.uid IS NULL OR m.uid <> ?1))`,
      )
      .bind(uid),
    db.prepare("DELETE FROM accounts WHERE uid = ?").bind(uid),
  ]);
}
