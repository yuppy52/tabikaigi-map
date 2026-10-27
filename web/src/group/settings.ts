// グループ設定のシートの出し分けの計算（screens の「グループ設定の中身」）。部品の外に置いて、テストはここに書く
import type { GroupMember } from "../data/types";

// グループ設定に出すもの。
// - canManage：グループ名の変更（6-2 でメンバーの削除・グループの削除も）を出すか。出さないときは「作成者だけが変えられます」
// - manageByLabel：「管理できる人：」の後に出す文（API の ownerOnly で決める。manageBy を使うと、作成者がいなくなった後も
//   「作成者のみ」と見えてしまうため：REQ-051）
// - others：自分以外のメンバー（自分は一覧に出さない。自分は「退出」を使う）
export type SettingsView = { canManage: boolean; manageByLabel: "誰でも" | "作成者のみ"; others: GroupMember[] };

// 「作成者のみ」が効いていれば、作成者のメンバーに紐づいた本人（ログイン済みで isOwner と isMe）だけが管理できる。
// 効いていなければ（「誰でも」、または作成者がいない）誰でも。ログインのない Phase 2 では isMe はいつも false なので、
// 「作成者のみ」が効いていれば誰も出さない（ログインなしの人は作成者として紐づけないため）
export function settingsView(ownerOnly: boolean, members: readonly GroupMember[], meId: number | null): SettingsView {
  const me = members.find((m) => m.id === meId);
  const canManage = !ownerOnly || (me !== undefined && me.isOwner && me.isMe);
  return {
    canManage,
    manageByLabel: ownerOnly ? "作成者のみ" : "誰でも",
    others: members.filter((m) => m.id !== meId),
  };
}
