// 退出・メンバーの削除・グループ名の変更・グループの削除の SQL
// （形の正本は docs/design/data-model.md の「退出・削除」「グループ名の変更・グループの削除」）。
// groups.ts と同じく、判断は書き込む SQL の WHERE に入れ、0行なら読み直して理由を返す。
// ログインがないので、メンバーの番号を知っている人なら誰でも通る（信頼ベース：ADR 0013）

/** removed：この操作で本当に1人消えたか（いない番号・ほかのグループの番号・2回目は false。部屋に知らせるかを決める） */
export type RemoveResult = { ok: true; removed: boolean; groupDeleted: boolean } | { ok: false; reason: "group_not_found" };

/**
 * メンバーを消し、0人になったらグループも消す（同じ batch：REQ-050）。退出（REQ-049）とメンバーの削除（REQ-048）で同じ形。
 * 1つ目の文は id と group_id の両方で確かめる（ほかのグループの番号では何もしない：NFR-006 (14)）。
 * 2つ目の文は1つ目の結果を見ずに「メンバーがいないグループ」だけを消す。0人のグループは残らない（作る・参加・退出・削除の
 * どれでも0人で残さない）ので、消えるのはこの退出・削除で0人になったグループだけ。もし0人のグループが残っていても、消して困るものはない
 */
async function removeMember(db: D1Database, groupId: string, memberId: number): Promise<RemoveResult> {
  const [del, delGroup] = await db.batch([
    db.prepare("DELETE FROM members WHERE id = ? AND group_id = ?").bind(memberId, groupId),
    db.prepare("DELETE FROM groups WHERE id = ? AND NOT EXISTS (SELECT 1 FROM members WHERE group_id = groups.id)").bind(groupId),
  ]);
  if (del.meta.changes > 0) return { ok: true, removed: true, groupDeleted: delGroup.meta.changes > 0 };
  // 0行：グループがないか、メンバーがもういない（2回押した、ほかの人が先に消した、ほかのグループの番号）か。
  // メンバーがいないときは成功とする（data-model.md の「退出・削除」）
  const g = await db.prepare("SELECT 1 FROM groups WHERE id = ?").bind(groupId).first();
  return g ? { ok: true, removed: false, groupDeleted: false } : { ok: false, reason: "group_not_found" };
}

/** 退出する（REQ-049・REQ-050） */
export function leaveMember(db: D1Database, groupId: string, memberId: number) {
  return removeMember(db, groupId, memberId);
}

/** メンバーを削除する（REQ-048・REQ-050） */
export function deleteMember(db: D1Database, groupId: string, memberId: number) {
  return removeMember(db, groupId, memberId);
}

export type GroupWriteResult = { ok: true } | { ok: false; reason: "group_not_found" };

/**
 * グループ名を変える（REQ-046）。メンバーの番号は受け取らず、グループIDだけで書く。
 * 同じ名前なら書かない（同じ値を繰り返し送られても、D1 の書き込みの枠を使わない）
 */
export async function renameGroup(db: D1Database, groupId: string, name: string): Promise<GroupWriteResult> {
  const res = await db.prepare("UPDATE groups SET name = ?1 WHERE id = ?2 AND name IS NOT ?1").bind(name, groupId).run();
  if (res.meta.changes > 0) return { ok: true };
  // 0行：グループがないか、同じ名前だったか（同じ名前なら書かずに成功）
  const g = await db.prepare("SELECT 1 FROM groups WHERE id = ?").bind(groupId).first();
  return g ? { ok: true } : { ok: false, reason: "group_not_found" };
}

/**
 * グループを削除する（REQ-047）。メンバーの番号は受け取らず、グループIDだけで消す。
 * メンバーと member_visits は外部キーで一緒に消える。0行ならグループがない（2回押した・ほかの人が先に消したときも）
 */
export async function deleteGroup(db: D1Database, groupId: string): Promise<GroupWriteResult> {
  const res = await db.prepare("DELETE FROM groups WHERE id = ?").bind(groupId).run();
  return res.meta.changes > 0 ? { ok: true } : { ok: false, reason: "group_not_found" };
}
