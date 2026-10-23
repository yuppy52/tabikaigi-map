// API（/api/…）を呼ぶところ。画面からは直接使わず、store.ts の関数を通す（.claude/rules/web.md）。
// 応答は「成功（本文）」か「失敗の種類」にそろえて返す。失敗の種類で、画面が screens の「API の応答と画面の動き」の文と行き先を選ぶ。
// 応答を読む計算（interpretResponse）は fetch と切り離し、テストでは fetch を差し替えて確かめる

// 失敗の種類。
// - network：通信エラー（fetch の失敗、本文を読み切れない）
// - unavailable：いまは使えない。quota は無料枠を超えた（503 の reason: "quota"、または JSON でない応答＝Cloudflare のエラー画面）、
//   temporary は一時的な失敗（503 のそれ以外）
// - rate_limited：429（WAF のレート制限。JSON でないことがある）
// - refused：API が理由を付けて断った（状態コードと error の値。本文の残り（name_taken の memberId など）は body に入れる）
export type Failure =
  | { kind: "network" }
  | { kind: "unavailable"; reason: "quota" | "temporary" }
  | { kind: "rate_limited" }
  | { kind: "refused"; status: number; error: string; body: Record<string, unknown> };

export type ApiResult = { ok: true; status: number; body: unknown } | { ok: false; failure: Failure };

// 失敗を Promise の失敗として返すときの形。message には error の値（または失敗の種類）を入れておく（読みやすさのため。画面は failure を見る）
export class ApiError extends Error {
  readonly failure: Failure;
  constructor(failure: Failure) {
    super(failure.kind === "refused" ? failure.error : failure.kind);
    this.name = "ApiError";
    this.failure = failure;
  }
}

// 画面の側で作る「API が断った」形（API を呼ぶ前に分かったとき、成功の応答の形が違ったとき）
export function refused(status: number, error: string, body: Record<string, unknown> = {}): Failure {
  return { kind: "refused", status, error, body };
}

// 成功の状態コードなのに本文の形が違う（API と画面の取り決めが食い違った）ときの error の値。表にない値として扱われる
export const BAD_RESPONSE = "bad_response";

// 受けた失敗（Promise の失敗の値）を、失敗の種類にする。ApiError でないもの（プログラムの間違い）は表にない値として扱う
export function failureOf(e: unknown): Failure {
  return e instanceof ApiError ? e.failure : refused(0, "");
}

export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

// 状態コードと本文の文字列を、成功か失敗の種類にする。
// 429 は本文によらず先に見る。エラーの状態コードで JSON として読めない本文は、枠切れ（Cloudflare のエラー画面）とみなす（screens の「知らせ」）
export function interpretResponse(status: number, text: string): ApiResult {
  if (status === 429) return { ok: false, failure: { kind: "rate_limited" } };
  let body: unknown;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    // 成功の状態コードなのに JSON でないのは、配信の設定の誤り（/api/* が app.html に落ちた、など）。枠切れと出すと気づけないので、表にない値にする
    if (status >= 200 && status < 300) return { ok: false, failure: refused(status, BAD_RESPONSE) };
    return { ok: false, failure: { kind: "unavailable", reason: "quota" } };
  }
  if (status === 503) {
    const reason = isRecord(body) && body.reason === "quota" ? "quota" : "temporary";
    return { ok: false, failure: { kind: "unavailable", reason } };
  }
  if (status >= 200 && status < 300) return { ok: true, status, body };
  const rest = isRecord(body) ? body : {};
  return { ok: false, failure: refused(status, typeof rest.error === "string" ? rest.error : "", rest) };
}

// fetch と同じ形の関数。テストでは差し替える
export type Fetch = (input: string, init: RequestInit) => Promise<Response>;

// ブラウザの fetch（呼ぶときに決める。テストで差し替えたものを使えるように）
const browserFetch: Fetch = (input, init) => fetch(input, init);

// 応答を待つ長さ。電波が止まったまま返ってこないと、ボタンが「送っている途中」のまま戻らないので、ここで切って通信エラーにする
// （仮の値 2026-10-23。API はふだん1秒もかからない）
const TIMEOUT_MS = 20_000;

// API を1回呼ぶ。目印のヘッダー X-Tabikaigi: 1 をいつも付け、本文があれば JSON で送る（api の「共通の決まり」）。
// ログインはまだないので Authorization は付けない。fetch が失敗したとき・本文を読み切れないとき・20秒たっても返ってこないときは通信エラー
export async function callApi(method: string, path: string, body?: unknown, fetchFn: Fetch = browserFetch): Promise<ApiResult> {
  const headers: Record<string, string> = { "X-Tabikaigi": "1" };
  const init: RequestInit = { method, headers, signal: AbortSignal.timeout(TIMEOUT_MS) };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  let status: number;
  let text: string;
  try {
    const res = await fetchFn(path, init);
    status = res.status;
    text = await res.text();
  } catch {
    return { ok: false, failure: { kind: "network" } };
  }
  return interpretResponse(status, text);
}
