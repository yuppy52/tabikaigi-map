// グループの画面の計算（部品の外に切り出してテストする：.claude/rules/web.md）。
// 数え方はモック（tools/template.html）の renderSummary・renderList・openPrefSheet と同じ
import { PREF_IDS } from "../map/colors";
import { applyVisit } from "../data/store";
import type { GroupMember, GroupView, Visit } from "../data/types";

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

// グループを開いたときの自分のメンバー。meId：自分の番号（いなければ null で参加のシート）、lostMember：覚えを忘れて REQ-025 の文を出すか。
// 1. ログイン済みで紐づいたメンバー（isMe）がいれば、その人
// 2. 端末が覚えている番号がいなければ、忘れて「前回の名前が見つかりませんでした」（REQ-025）
// 3. 覚えている番号のメンバーが紐づいていれば、覚えを消さずに参加のシート（2026-10-23 にメインが決めた仮の動き。
//    ログインがない Phase 2 では起きない。REQ-025・REQ-035 の文は Phase 3 で作る）
// 4. 覚えていなければ、グループ作成から渡された番号（端末に書けなかったときの代わり）。グループにいて紐づいていないときだけ使う
export function resolveMe(
  members: readonly GroupMember[],
  rememberedId: number | null,
  createdId: number | null,
): { meId: number | null; lostMember: boolean } {
  const linked = members.find((m) => m.isMe);
  if (linked) return { meId: linked.id, lostMember: false };
  if (rememberedId !== null) {
    const m = members.find((x) => x.id === rememberedId);
    if (!m) return { meId: null, lostMember: true };
    return { meId: m.linked ? null : m.id, lostMember: false };
  }
  const created = members.find((x) => x.id === createdId);
  return { meId: created && !created.linked ? created.id : null, lostMember: false };
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

// 部屋から「行った」の付け外しが届いたとき：画面の知っているメンバーなら反映（apply）、知らないメンバーならグループを読み直す（refetch。
// architecture の「部屋が配るもの」：参加は配られないので、新しく入った人の変更はこうして気づく）
export function roomVisitAction(members: readonly GroupMember[], memberId: number): "apply" | "refetch" {
  return members.some((m) => m.id === memberId) ? "apply" : "refetch";
}

// 裏で読み直したグループに、自分のメンバーがもういないか（screens の「自分のメンバーが削除されていた」）。自分がいない（参加の前）なら false
export function meRemoved(members: readonly GroupMember[], meId: number | null): boolean {
  return meId !== null && !members.some((m) => m.id === meId);
}

// 部屋から届いた「行った」の付け外し1件
export type RoomVisit = { memberId: number; pref: number; visited: boolean };

// 裏の読み直しの結果に、読み直しを始めてから結果が戻るまでに部屋から届いた付け外しを、届いた順に入れ直す
// （読み直しの中身は、その付け外しより前に D1 を読んだものかもしれないので、そのまま使うと届いた変更が消える）。
// 結果のグループにいないメンバーの分は入れない（削除された人。知らないメンバーの分は、別の読み直しで入る）
export function withRoomVisits(view: GroupView, visits: readonly RoomVisit[]): GroupView {
  let next = view.visits;
  for (const v of visits) {
    if (view.members.some((m) => m.id === v.memberId)) next = applyVisit(next, v.memberId, v.pref, v.visited);
  }
  return next === view.visits ? view : { ...view, visits: next };
}

// 読み直しが飛んでいる間に部屋から届いた付け外しを、届いた順に覚えるところ（withRoomVisits に渡す分を作る）。
// start で読み直しを始めた印（通し番号）を受け取り、finish でその印から後に届いた分を受け取る。
// 読み直しが重なっても、それぞれ自分が始めた後の分だけを受け取る。飛んでいる読み直しがなくなったら覚えを捨てる（溜め続けない）
export class RoomVisitLog {
  private log: RoomVisit[] = [];
  // log[0] の通し番号
  private base = 0;
  private inFlight = 0;

  // 読み直しを始めた。返す印を finish に渡す
  start(): number {
    this.inFlight++;
    return this.base + this.log.length;
  }

  // 部屋から付け外しが届いた。飛んでいる読み直しがなければ覚えない
  record(v: RoomVisit): void {
    if (this.inFlight > 0) this.log.push(v);
  }

  // 読み直しが戻った（成功でも失敗でも、1回の start に1回呼ぶ）。始めた後に届いた分を返す
  finish(mark: number): RoomVisit[] {
    const since = this.log.slice(Math.max(0, mark - this.base));
    this.inFlight = Math.max(0, this.inFlight - 1);
    if (this.inFlight === 0) {
      this.base += this.log.length;
      this.log = [];
    }
    return since;
  }
}
