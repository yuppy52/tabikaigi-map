// グループ設定のシートの出し分けの計算（screens の「グループ設定の中身」）。部品の外に置いて、テストはここに書く
import type { GroupMember } from "../data/types";

// グループ設定に出すもの。
// - canManage：グループ名の変更・メンバーの削除・グループの削除を出すか。出さないときは「作成者だけが変えられます」
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

// 確認ダイアログの文（screens の「確認ダイアログ」の表のとおり。ログインなしの人の文だけ：ログイン済みの文は Phase 3）。
// - title：見出し（表の文の最初の一文）
// - body：本文の段落。退出では、この後に［招待URLをコピー］を置く
// - warnings：注意の段落（最後の1人、作成者がいなくなる）
// 表の中では『行った』と書いてあるが、画面では「行った」と出す（表の文が「」で囲まれているための書き分け。ワイヤーフレームの 9 も「行った」）
export type ConfirmText = { title: string; body: string[]; warnings: string[] };

// 作成者がいなくなるときの注意（退出・メンバーの削除で同じ文）
const OWNER_GONE = "このグループの作成者はいなくなり、戻せません。";

// 退出の確認。自分以外にメンバーがいなければ最後の1人（グループも削除される。このときは作成者の注意を出さない）。
// 最後の1人でなく、自分が作成者のメンバーなら、作成者の注意（「作成者のみ」が効いていれば、管理できる人が変わることも）を足す
export function leaveConfirm(ownerOnly: boolean, members: readonly GroupMember[], meId: number): ConfirmText {
  const me = members.find((m) => m.id === meId);
  const last = members.every((m) => m.id === meId);
  const warnings: string[] = [];
  if (last) warnings.push("あなたが最後のメンバーです。グループも削除されます。");
  else if (me?.isOwner) warnings.push(ownerOnly ? `${OWNER_GONE}管理できる人は「誰でも」に変わります。` : OWNER_GONE);
  return {
    title: `${me?.name ?? ""}として退出します`,
    body: ["このグループでの「行った」は消えます。もう一度入るには招待URLが要ります。"],
    warnings,
  };
}

// メンバーの削除の確認。紐づいていない人は「行った」が消え、紐づいた人はアカウントの「行った」が残る。
// どちらも、招待URLでまた参加できることを足す。作成者のメンバーなら、作成者の注意を足す
export function deleteMemberConfirm(member: GroupMember): ConfirmText {
  const kept = member.linked ? "その人のアカウントの「行った」は残ります。" : "その人のこのグループでの「行った」は消えます。";
  return {
    title: `${member.name}さんを削除します`,
    body: [`${kept}招待URLを知っていれば、また参加できます。`],
    warnings: member.isOwner ? [OWNER_GONE] : [],
  };
}

// グループの削除の確認。人数は自分を含めた全員
export function deleteGroupConfirm(groupName: string, memberCount: number): ConfirmText {
  return {
    title: `${groupName}を削除します`,
    body: [
      `全員（${memberCount}人）のこのグループでの「行った」が消え、戻せません。ログインしているメンバーのアカウントの「行った」は残ります。`,
    ],
    warnings: [],
  };
}
