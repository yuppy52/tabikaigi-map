// グループ設定のシートの出し分けの計算（screens の「グループ設定の中身」）。部品の外に置いて、テストはここに書く
import type { GroupMember } from "../data/types";

// グループ設定に出すもの。グループ名の変更・メンバーの削除・グループの削除は誰でもできるので、いつも出す（permissions、REQ-046〜REQ-048）。
// - others：自分以外のメンバー（自分は一覧に出さない。自分は「退出」を使う）
export type SettingsView = { others: GroupMember[] };

export function settingsView(members: readonly GroupMember[], meId: number | null): SettingsView {
  return { others: members.filter((m) => m.id !== meId) };
}

// 確認ダイアログの文（screens の「確認ダイアログ」の表のとおり）。
// - title：見出し（表の文の最初の一文）
// - body：本文の段落。退出では、この後に［招待URLをコピー］を置く
// - warnings：注意の段落（最後の1人）
// 表の中では『行った』と書いてあるが、画面では「行った」と出す（表の文が「」で囲まれているための書き分け。ワイヤーフレームの 9 も「行った」）
export type ConfirmText = { title: string; body: string[]; warnings: string[] };

// 退出の確認。自分以外にメンバーがいなければ最後の1人（グループも削除される）の注意を足す
export function leaveConfirm(members: readonly GroupMember[], meId: number): ConfirmText {
  const me = members.find((m) => m.id === meId);
  const last = members.every((m) => m.id === meId);
  return {
    title: `${me?.name ?? ""}として退出します`,
    body: ["このグループでの「行った」は消えます。もう一度入るには招待URLが要ります。"],
    warnings: last ? ["あなたが最後のメンバーです。グループも削除されます。"] : [],
  };
}

// メンバーの削除の確認。その人の「行った」が消えることと、招待URLでまた参加できること
export function deleteMemberConfirm(member: GroupMember): ConfirmText {
  return {
    title: `${member.name}さんを削除します`,
    body: ["その人のこのグループでの「行った」は消えます。招待URLを知っていれば、また参加できます。"],
    warnings: [],
  };
}

// グループの削除の確認。人数は自分を含めた全員
export function deleteGroupConfirm(groupName: string, memberCount: number): ConfirmText {
  return {
    title: `${groupName}を削除します`,
    body: [`全員（${memberCount}人）のこのグループでの「行った」が消え、戻せません。`],
    warnings: [],
  };
}
