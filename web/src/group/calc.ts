// グループの画面の計算（部品の外に切り出してテストする：.claude/rules/web.md）。
// 数え方はモック（tools/template.html）の renderSummary・renderList・openPrefSheet と同じ
import { PREF_IDS } from "../map/colors";
import type { GroupMember, Visit } from "../data/types";

// グループIDの形（英数字22文字：data-model の groups.id、api/src/ids.ts と同じ）。違えば API を呼ばずにエラーにする
export function isGroupId(s: string): boolean {
  return /^[A-Za-z0-9]{22}$/.test(s);
}

// 一覧で使う短い県名（モックの short）。北海道はそのまま、ほかは末尾の「都・府・県」を取る
export function shortPrefName(name: string): string {
  return name === "北海道" ? name : name.replace(/[都府県]$/, "");
}

// 地方ごとの一覧の並び（モックの REGIONS。REQ-055）
export const REGIONS: readonly { name: string; prefs: readonly number[] }[] = [
  { name: "北海道・東北", prefs: [1, 2, 3, 4, 5, 6, 7] },
  { name: "関東", prefs: [8, 9, 10, 11, 12, 13, 14] },
  { name: "中部", prefs: [15, 16, 17, 18, 19, 20, 21, 22, 23] },
  { name: "近畿", prefs: [24, 25, 26, 27, 28, 29, 30] },
  { name: "中国", prefs: [31, 32, 33, 34, 35] },
  { name: "四国", prefs: [36, 37, 38, 39] },
  { name: "九州・沖縄", prefs: [40, 41, 42, 43, 44, 45, 46, 47] },
];

// 自分のメンバーの番号。ログイン済みで紐づいたメンバー（isMe）を先に見て、なければ端末が覚えている番号。
// 覚えている番号がグループにいなければ「自分はいない」（null）
export function findMeId(members: readonly GroupMember[], rememberedId: number | null): number | null {
  const linked = members.find((m) => m.isMe);
  if (linked) return linked.id;
  return rememberedId !== null && members.some((m) => m.id === rememberedId) ? rememberedId : null;
}

// 端末が覚えていたメンバーが、グループにいないか（削除された、など：REQ-025）。覚えていなければ false（初めて開いたのと同じ）
export function rememberedIsMissing(members: readonly GroupMember[], rememberedId: number | null): boolean {
  return rememberedId !== null && !members.some((m) => m.id === rememberedId);
}

// 招待URL（REQ-002）。LINE のアプリ内ブラウザで開いても外部ブラウザに移るように ?openExternalBrowser=1 を付ける（auth-flow の「LINE のアプリ内ブラウザ」）
export function inviteUrl(origin: string, groupId: string): string {
  return `${origin}/g/${groupId}?openExternalBrowser=1`;
}

// そのメンバーの行った県（番号の小さい順、重なりなし）
export function prefsOf(visits: readonly Visit[], memberId: number): number[] {
  return [...new Set(visits.filter((v) => v.memberId === memberId).map((v) => v.pref))].sort((a, b) => a - b);
}

// メンバーごとの行った県（メンバーの並びのまま）。colors.ts の everyoneFills・gapPrefIds に渡す形
export function visitedByMember(members: readonly GroupMember[], visits: readonly Visit[]): number[][] {
  return members.map((m) => prefsOf(visits, m.id));
}

// 誰かが行った県の数（グループにいないメンバーの分は数えない）
export function countVisitedByAnyone(members: readonly GroupMember[], visits: readonly Visit[]): number {
  const ids = new Set(members.map((m) => m.id));
  return new Set(visits.filter((v) => ids.has(v.memberId)).map((v) => v.pref)).size;
}

// メンバーごとの行った県の数を、多い順に並べる（同じ数なら元の並びのまま）
export function membersByCount(members: readonly GroupMember[], visits: readonly Visit[]): { member: GroupMember; count: number }[] {
  return members.map((member) => ({ member, count: prefsOf(visits, member.id).length })).sort((a, b) => b.count - a.count);
}

// 県の詳細のシートに出す、メンバーと行ったかどうか。行った人が先（同じ側の中は元の並びのまま）
export function prefVisitors(
  members: readonly GroupMember[],
  visits: readonly Visit[],
  pref: number,
): { rows: { member: GroupMember; visited: boolean }[]; count: number } {
  const rows = members
    .map((member) => ({ member, visited: visits.some((v) => v.memberId === member.id && v.pref === pref) }))
    .sort((a, b) => Number(b.visited) - Number(a.visited));
  return { rows, count: rows.filter((r) => r.visited).length };
}

// 送っている途中の付け外し（県 → 付けるか）を、保存できた「行った」に重ねて、画面に出す「行った」を作る
export function withPending(visits: readonly Visit[], memberId: number | null, pending: ReadonlyMap<number, boolean>): Visit[] {
  if (memberId === null || pending.size === 0) return [...visits];
  let shown = visits.filter((v) => !(v.memberId === memberId && pending.has(v.pref)));
  for (const [pref, visited] of pending) if (visited) shown = [...shown, { memberId, pref }];
  return shown;
}

// メンバー別のタブで最初に選ぶ人（モックと同じ：自分以外の最初の人。いなければ自分、それもいなければ null）
export function defaultFocusMember(members: readonly GroupMember[], meId: number | null): number | null {
  return (members.find((m) => m.id !== meId) ?? members.find((m) => m.id === meId))?.id ?? null;
}

// わたし・メンバー別のときの地図の塗り：その人の行った県だけを、その人の色で塗る（ほかは塗らない＝--land）
export function memberFills(prefs: readonly number[], color: string): Record<number, string> {
  const fills: Record<number, string> = {};
  for (const id of prefs) if (PREF_IDS.includes(id)) fills[id] = color;
  return fills;
}

// 丸いアイコンに出す、名前の最初の1文字（絵文字などの2つで1文字のものも割らない）
export function initialOf(name: string): string {
  return Array.from(name)[0] ?? "";
}
