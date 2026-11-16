// 参加のシートの計算（部品の外に切り出してテストする：.claude/rules/web.md）。
// 決まりは screens の「参加の画面」と「API の応答と画面の動き」の 409 name_taken・409 group_full の行
import type { GroupMember } from "../data/types";

// グループに入れる人数の上限（REQ-005。正本は API と D1 の制約：NFR-006 (8)。画面は案内のためだけに使う）
export const MEMBER_LIMIT = 20;

// 満員か。満員なら「＋ 新しく参加する」の代わりに「20人いるので、新しくは参加できません」を出す（名前の一覧はそのまま押せる）
export function isGroupFull(members: readonly GroupMember[]): boolean {
  return members.length >= MEMBER_LIMIT;
}

// 409 name_taken で返った番号の人を、一覧から引く。文と端末に覚える名前は、入れた文字ではなく一覧の表示名を使う
// （全角・半角などが違っても同じ名前とみなすため：REQ-011）。一覧にいなければ null（ほぼ同時に入った人なので、グループを読み直す）
export function takenMemberOf(members: readonly GroupMember[], memberId: number): GroupMember | null {
  return members.find((m) => m.id === memberId) ?? null;
}
