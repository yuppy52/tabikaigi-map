// 地図の塗りの計算（部品の外に切り出してテストする：.claude/rules/web.md）。
// 色は CSS の変数（styles.css）で返す。ライトとダークの切り替えは CSS の側で効く

// 県の番号（1〜47）。並べるときはこの順にする
export const PREF_IDS: readonly number[] = Array.from({ length: 47 }, (_, i) => i + 1);

// 行った人数と全員の人数から濃さを決める（モックの heat と同じ式）。
// 0人は塗らない。全員なら一番濃い h4。それ以外は割合で、1/3 以下 h1、2/3 以下 h2、それより上 h3
export function heatFill(visitors: number, total: number): string {
  if (visitors <= 0 || total <= 0) return "var(--land)";
  if (visitors >= total) return "var(--h4)";
  const ratio = visitors / total;
  if (ratio <= 1 / 3) return "var(--h1)";
  if (ratio <= 2 / 3) return "var(--h2)";
  return "var(--h3)";
}

// 県ごとに、行った人の数を数える。同じ人の同じ県が2回入っていても1人と数える
function countVisitors(visitedByMember: readonly (readonly number[])[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const visited of visitedByMember) {
    for (const id of new Set(visited)) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

// 「みんな」のときの県ごとの塗り（モックの fillFor の「みんな」の部分）。
// visitedByMember はメンバーごとの「行った」県の番号。全員の人数はその長さ。
// 誰も行っていない県は、強調するときは --gap-fill、しないときは --land
export function everyoneFills(visitedByMember: readonly (readonly number[])[], highlightGap: boolean): Record<number, string> {
  const counts = countVisitors(visitedByMember);
  const total = visitedByMember.length;
  const fills: Record<number, string> = {};
  for (const id of PREF_IDS) {
    const n = counts.get(id) ?? 0;
    fills[id] = n === 0 && highlightGap ? "var(--gap-fill)" : heatFill(n, total);
  }
  return fills;
}

// 全員まだ行っていない県の番号（1〜47 の順）
export function gapPrefIds(visitedByMember: readonly (readonly number[])[]): number[] {
  const counts = countVisitors(visitedByMember);
  return PREF_IDS.filter((id) => (counts.get(id) ?? 0) === 0);
}
