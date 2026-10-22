// 名前とグループ名の入力の確かめ（画面の側。REQ-009・REQ-010）。
// 正本は API（api/src/names.ts）。ここは入力の手助けなので、前後の空白を取り除いた後の見た目の文字数だけを見る。
// 見えない文字や記号の重ねすぎは API が断る（400 bad_name）

export const MEMBER_NAME_MAX = 10;
export const GROUP_NAME_MAX = 20;

// 見た目の1文字（書記素）ごとに分ける。絵文字の 👨‍👩‍👧 も1文字
const segmenter = new Intl.Segmenter("ja", { granularity: "grapheme" });

// 前後の空白（全角の空白も）を取り除く
export function trimName(input: string): string {
  return input.replace(/^[\s\u3000]+|[\s\u3000]+$/g, "");
}

// 見た目の文字数
export function visibleLength(s: string): number {
  return [...segmenter.segment(s)].length;
}

// 前後の空白を取り除いて 1〜max 文字なら、取り除いた後の名前を返す。外れたら null
export function checkName(input: string, max: number): string | null {
  const name = trimName(input);
  return name.length > 0 && visibleLength(name) <= max ? name : null;
}

// 仮の保存（API につなぐまで）で「同じ名前」かを比べる形。前後の空白を取り、NFKC と小文字にそろえるだけ。
// 本当の比べ方（REQ-011：絵文字の部品や続いた空白も見る）は API の nameKey が正本。API につないだら使わない
export function demoNameKey(name: string): string {
  return trimName(name).normalize("NFKC").toLowerCase();
}
