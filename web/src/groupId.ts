// グループIDの形（英数字22文字：data-model の groups.id、api/src/ids.ts と同じ）。違えば API を呼ばずにエラーにする。
// トップ（素の HTML）からも使うので、ほかの部品を読み込まない小さなファイルに置く（group/calc.ts から読むと地図やデータの部品まで束ねられるため）
export function isGroupId(s: string): boolean {
  return /^[A-Za-z0-9]{22}$/.test(s);
}
