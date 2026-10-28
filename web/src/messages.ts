// いくつかの画面で使う文と、API の失敗から文と行き先を選ぶ計算（screens の「API の応答と画面の動き」「知らせ」のとおり。
// 文を自分で考えない：.claude/rules/web.md）。表にない値は「保存できませんでした。もう一度お試しください」にする
import { BAD_RESPONSE, type Failure } from "./data/api";

// 表にない失敗、やり直せる失敗（書き込みの通信エラー、一時的な 503）
export const SAVE_FAILED = "保存できませんでした。もう一度お試しください";
// 400 bad_name（画面の側で長さが外れたときも、同じ文を入力欄の下に出す）
export const BAD_NAME = "1〜10文字（グループ名は20文字）で入れてください。見えない文字や一部の記号は使えません";
// 403 turnstile_failed（ボット対策のスクリプトが読み込めない・ウィジェットがエラーになったときも同じ文：2026-10-23）
export const TURNSTILE_FAILED = "確認に失敗しました。もう一度お試しください";
// グループを開くときの通信エラー・一時的な 503（2026-10-23 にユーザーと決めた仮の文）と、その場で読み直すボタン
export const LOAD_FAILED = "読み込めませんでした。もう一度お試しください";
export const RELOAD = "もう一度読み込む";
// 503 の枠切れと JSON でない応答（screens の「知らせ」の「いまは使えない」）
export const UNAVAILABLE = "いまは混み合っていて使えません。遅くとも翌朝9時ごろには戻ります";
// 429（WAF のレート制限）
export const RATE_LIMITED = "少し待ってから、もう一度お試しください";
// 404 group_not_found（REQ-006）
export const GROUP_DELETED = "このグループは削除されました";
// 409 group_full（REQ-005）
export const GROUP_FULL = "このグループは満員（20人）です";
// 覚えていたメンバーがグループにいなかった（REQ-025）
export const LOST_MEMBER = "前回の名前が見つかりませんでした";
// 参加で、紐づいたメンバーと同じ名前を入れた（ログインなし：screens の「参加の画面」、REQ-013）
export const NAME_NEEDS_LOGIN = "この名前で入るにはログインが必要です";
// 403 member_linked（ログインなしの「行った」の付け外し：ほかの端末で本人が紐づけた）
export const memberLinkedText = (name: string) => `${name}さんはアカウントに紐づきました。ログインして入ってください`;
// 404 member_not_found（自分のメンバーが削除されていた：REQ-048）
export const memberRemovedText = (name: string) => `${name}さんはグループから削除されました`;

const isRefused = (f: Failure, status: number, error: string) => f.kind === "refused" && f.status === status && f.error === error;

// 書き込み（作成・参加・付け外し）の失敗のうち、どの書き込みでも同じ文になるもの。
// 通信エラーと一時的な 503 は「やり直せる失敗」、枠切れは「いまは使えない」、429 は「少し待って」、ほかは表にない値
export function writeFailureText(f: Failure): string {
  if (f.kind === "unavailable" && f.reason === "quota") return UNAVAILABLE;
  if (f.kind === "rate_limited") return RATE_LIMITED;
  return SAVE_FAILED;
}

// グループを開けなかったときのエラーの画面。text：出す文、retry：「もう一度読み込む」を出すか、forget：端末の覚えを忘れるか
export type LoadError = { text: string; retry: boolean; forget: boolean };

// グループを開く（読み直すときも）の失敗 → エラーの画面。
// 削除された（404 group_not_found）なら忘れる。通信エラー・一時的な 503 はその場で読み直せる。枠切れと 429 はボタンを出さない（すぐには送り直さない）。
// 表にない値（400 bad_request など、画面の不具合）は「保存できませんでした」と、読み直すボタン
export function loadErrorOf(f: Failure): LoadError {
  if (isRefused(f, 404, "group_not_found")) return { text: GROUP_DELETED, retry: false, forget: true };
  if (f.kind === "network" || (f.kind === "unavailable" && f.reason === "temporary"))
    return { text: LOAD_FAILED, retry: true, forget: false };
  if (f.kind === "unavailable") return { text: UNAVAILABLE, retry: false, forget: false };
  if (f.kind === "rate_limited") return { text: RATE_LIMITED, retry: false, forget: false };
  return { text: SAVE_FAILED, retry: true, forget: false };
}

// 「行った」の付け外しが失敗したときの動き（どれも、付け外しは最後に保存できた状態に戻す）。
// - toast：知らせを出す。reload なら、グループを読み直す（画面の不具合：400・413・404 not_found）
// - rejoin：覚えを忘れて、参加のシートに text を出す（紐づいた、削除された）
// - deleted：覚えを忘れて、エラーの画面（グループが削除された）
export type VisitErrorAction = { kind: "toast"; text: string; reload: boolean } | { kind: "rejoin"; text: string } | { kind: "deleted" };

// 付け外しの失敗 → 動き。name は自分のメンバーの名前（文に入れる）
export function visitErrorOf(f: Failure, name: string): VisitErrorAction {
  if (isRefused(f, 403, "member_linked")) return { kind: "rejoin", text: memberLinkedText(name) };
  if (isRefused(f, 404, "member_not_found")) return { kind: "rejoin", text: memberRemovedText(name) };
  if (isRefused(f, 404, "group_not_found")) return { kind: "deleted" };
  if (f.kind === "refused" && (f.status === 400 || f.status === 413 || isRefused(f, 404, "not_found"))) {
    return { kind: "toast", text: SAVE_FAILED, reload: true };
  }
  return { kind: "toast", text: writeFailureText(f), reload: false };
}

// グループ作成の失敗 → ボタンの上に出す文（bad_name も、どちらの欄か分からないのでボタンの上）
export function createErrorText(f: Failure): string {
  if (isRefused(f, 400, "bad_name")) return BAD_NAME;
  if (isRefused(f, 403, "turnstile_failed")) return TURNSTILE_FAILED;
  return writeFailureText(f);
}

// 参加の失敗のときの動き。field：入力欄の下に文、form：ボタンの上に文、deleted：忘れてエラーの画面（削除された）、full：エラーの画面（満員）
export type JoinErrorAction = { kind: "field"; text: string } | { kind: "form"; text: string } | { kind: "deleted" } | { kind: "full" };

// 参加の失敗 → 動き（同じ名前の 409 name_taken は失敗ではなく、store の joinGroup が結果として返す）。
// 409 already_member・group_limit はログイン済みでだけ起きるので、いまは表にない値として扱う
export function joinErrorOf(f: Failure): JoinErrorAction {
  if (isRefused(f, 400, "bad_name")) return { kind: "field", text: BAD_NAME };
  if (isRefused(f, 403, "turnstile_failed")) return { kind: "form", text: TURNSTILE_FAILED };
  if (isRefused(f, 404, "group_not_found")) return { kind: "deleted" };
  if (isRefused(f, 409, "group_full")) return { kind: "full" };
  return { kind: "form", text: writeFailureText(f) };
}

// グループ設定（screens の「グループ設定の中身」の「形と文」：2026-10-28 にユーザーと決めた）
// 「作成者のみ」が効いていて管理の操作を出さないときの一言と、403 not_allowed の文（screens の「知らせ」の「やり直しても通らない失敗」）
export const OWNER_ONLY = "作成者だけが変えられます";
// グループ名の変更が成功したときの知らせ
export const GROUP_RENAMED = "グループ名を変更しました";
// 「ほかのメンバーに切り替える」に添える一言（REQ-056）
export const switchMemberNote = (name: string) => `${name}さんのデータは消えません。名前の入力に戻ります`;

// グループ名の変更が失敗したときの動き。
// - field：入力欄の下に text（400 bad_name。その場で入れ直す）
// - toast：知らせを出す。reload なら、グループを読み直す（403 not_allowed：設定が途中で変わっていることがある。画面の不具合：400・413・404 not_found）
// - deleted：覚えを忘れて、エラーの画面（グループが削除された）
export type RenameErrorAction = { kind: "field"; text: string } | { kind: "toast"; text: string; reload: boolean } | { kind: "deleted" };

// グループ名の変更（PUT /api/groups/{groupId}/name）の失敗 → 動き。通信エラー・503・429 は、ほかの書き込みと同じ文で、その場のまま
export function renameErrorOf(f: Failure): RenameErrorAction {
  if (isRefused(f, 400, "bad_name")) return { kind: "field", text: BAD_NAME };
  if (isRefused(f, 403, "not_allowed")) return { kind: "toast", text: OWNER_ONLY, reload: true };
  if (isRefused(f, 404, "group_not_found")) return { kind: "deleted" };
  if (isScreenBug(f)) return { kind: "toast", text: SAVE_FAILED, reload: true };
  return { kind: "toast", text: writeFailureText(f), reload: false };
}

// 画面の不具合（400・413・404 not_found）。成功の状態コードなのに形が違う応答（bad_response）も同じに扱う（screens の表の 400 bad_request の行）
function isScreenBug(f: Failure): boolean {
  return f.kind === "refused" && (f.status === 400 || f.status === 413 || isRefused(f, 404, "not_found") || f.error === BAD_RESPONSE);
}

// メンバーの削除が成功したときの知らせ
export const memberDeletedText = (name: string) => `${name}さんを削除しました`;

// 退出・メンバーの削除・グループの削除（確認ダイアログの確定）が失敗したときの動き。
// - toast：知らせを出す。reload なら、ダイアログを閉じてグループを読み直す（設定が途中で変わっていることがある、画面の不具合）。
//   reload でなければ（通信エラー・503・429）、ダイアログを開いたままにして、もう一度押せるようにする
// - deleted：覚えを忘れて、エラーの画面（グループが削除された）
// - rejoin：覚えを忘れて、参加のシートに text を出す（退出で、自分のメンバーがほかの端末で紐づいた）
// - done：成功したときと同じに扱う（退出・グループの削除で、グループがもうなかった。1回目が届いて応答だけ失われ、やり直したときなど。仮の動き 2026-10-28）
export type RemoveErrorAction =
  { kind: "toast"; text: string; reload: boolean } | { kind: "deleted" } | { kind: "rejoin"; text: string } | { kind: "done" };

// 3つの操作で同じになるもの：グループが削除されていた、画面の不具合、通信エラー・503・429・表にない値
function removeErrorOf(f: Failure): RemoveErrorAction {
  if (isRefused(f, 404, "group_not_found")) return { kind: "deleted" };
  if (isScreenBug(f)) return { kind: "toast", text: SAVE_FAILED, reload: true };
  return { kind: "toast", text: writeFailureText(f), reload: false };
}

// 退出（POST …/members/{memberId}/leave）の失敗 → 動き。name は自分のメンバーの名前。
// 403 member_linked は紐づいた文で参加のシート。404 group_not_found は、退出できたときと同じにトップへ（最後の1人の退出が届いて
// 応答だけ失われ、やり直したとき。どちらにしても抜けたかった結果と同じため：仮の動き 2026-10-28）。
// 「もういない自分」の退出は API が 200 で返すので、404 member_not_found は来ない（来たら表にない値）。
// 退出は管理の操作ではないので、403 not_allowed は表にない値として扱う
export function leaveErrorOf(f: Failure, name: string): RemoveErrorAction {
  if (isRefused(f, 403, "member_linked")) return { kind: "rejoin", text: memberLinkedText(name) };
  if (isRefused(f, 404, "group_not_found")) return { kind: "done" };
  return removeErrorOf(f);
}

// メンバーの削除（DELETE …/members/{memberId}）の失敗 → 動き。403 not_allowed は「作成者だけが変えられます」と読み直し。
// 「もういない相手」の削除は API が 200 で返すので、404 member_not_found は来ない（来たら表にない値）
export function deleteMemberErrorOf(f: Failure): RemoveErrorAction {
  if (isRefused(f, 403, "not_allowed")) return { kind: "toast", text: OWNER_ONLY, reload: true };
  return removeErrorOf(f);
}

// グループの削除（DELETE /api/groups/{groupId}）の失敗 → 動き。403 not_allowed は「作成者だけが変えられます」と読み直し。
// 404 group_not_found は、削除できたときと同じにトップへ（1回目が届いて応答だけ失われ、やり直したとき：仮の動き 2026-10-28）
export function deleteGroupErrorOf(f: Failure): RemoveErrorAction {
  if (isRefused(f, 403, "not_allowed")) return { kind: "toast", text: OWNER_ONLY, reload: true };
  if (isRefused(f, 404, "group_not_found")) return { kind: "done" };
  return removeErrorOf(f);
}

// リアルタイムの帯（screens の「知らせ」の「リアルタイムの知らせが数秒以上つながらない」）
export const REALTIME_DOWN = "自動で更新されていません";
export const REALTIME_RELOAD = "読み直す";

// 裏でグループを読み直したとき（「取り直して」、知らないメンバーの変更、つなぎ直し、画面に戻った、帯の「読み直す」）の失敗 → 動き。
// グループが削除されていたら、覚えを忘れてエラーの画面（deleted）。それ以外（通信エラー、いまは使えない、429 など）は、
// いまの画面のまま（quiet。screens の「リアルタイムで読み直したときの失敗」：2026-10-26 の仮の動き）
export function backgroundLoadErrorOf(f: Failure): "deleted" | "quiet" {
  return isRefused(f, 404, "group_not_found") ? "deleted" : "quiet";
}
