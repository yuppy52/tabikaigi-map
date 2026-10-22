// メンバーの10色。番号（D1 の members.color、0〜9）と色の対応は、ここ1か所にだけ置く。
// 値は docs/design/data-model.md の「色」の表のとおり（2026-10-22 にユーザーと決めた）
export const MEMBER_COLORS: readonly string[] = [
  "#2F7FD1", // 0 青
  "#E0692F", // 1 オレンジ
  "#2A9D6E", // 2 緑
  "#9B5BD0", // 3 紫
  "#D2497A", // 4 ピンク
  "#7B8A1E", // 5 オリーブ
  "#C93C3C", // 6 赤
  "#1A9BB0", // 7 青緑
  "#8C5A3C", // 8 茶
  "#4A5D8A", // 9 紺
];

// 番号から色を引く。D1 の制約で 0〜9 の整数しか来ないはずだが、
// 範囲の外や整数でない値が来ても画面を止めないように、0番の色にする
export function memberColor(index: number): string {
  return Number.isInteger(index) && index >= 0 && index < MEMBER_COLORS.length ? MEMBER_COLORS[index] : MEMBER_COLORS[0];
}
