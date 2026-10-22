// いくつかの画面で使う文（screens の「API の応答と画面の動き」「知らせ」のとおり。文を自分で考えない：.claude/rules/web.md）

// 表にない失敗、やり直せる失敗
export const SAVE_FAILED = "保存できませんでした。もう一度お試しください";
// 400 bad_name（画面の側で長さが外れたときも、同じ文を入力欄の下に出す）
export const BAD_NAME = "1〜10文字（グループ名は20文字）で入れてください。見えない文字や一部の記号は使えません";

// 保存のところ（web/src/data/store.ts）の失敗の値を、画面の文にする。bad_name は入力欄の下、それ以外は「保存できませんでした」
export function errorText(e: unknown): string {
  return e instanceof Error && e.message === "bad_name" ? BAD_NAME : SAVE_FAILED;
}
