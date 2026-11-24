// Turnstile（ボット対策）の確かめ（Q-031）。グループの作成と参加で使う。
// 画面が受け取った合言葉（トークン）を、Cloudflare に「本物か」「このサイトで解いたか」を聞いて確かめる

/** 確かめる関数。本番は Cloudflare に聞き、テストでは差し替える */
export type TurnstileVerifier = (token: string, env: Env) => Promise<boolean>;

/** Cloudflare に聞けなかった・確かめる設定がない（こちらの都合で使えない：503） */
export class TurnstileUnavailableError extends Error {}

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Cloudflare に聞くのを切るまでの時間（api の「Turnstile」：5秒で切って 503） */
const SITEVERIFY_TIMEOUT_MS = 5000;

/**
 * success:false でも、利用者の券ではなく運営者の側（秘密の鍵）・Cloudflare の側の失敗を表す error-codes。
 * これらは 403 にせず 503 にする（利用者に「確認に失敗」と出しても直せないため）
 */
const UNAVAILABLE_ERROR_CODES = ["invalid-input-secret", "missing-input-secret", "internal-error"];

/**
 * 503 にする。ログには理由の短い固定の文だけを残す（券・hostname の値・グループID・秘密の鍵は入れない）。
 * app.ts の checkTurnstile はログを出さないので、ここで1回だけ出す
 */
function unavailable(reason: string): TurnstileUnavailableError {
  console.error(`turnstile: unavailable (${reason})`);
  return new TurnstileUnavailableError(reason);
}

export const cloudflareTurnstile: TurnstileVerifier = async (token, env) => {
  // 秘密の鍵や、突き合わせるサイトの名前が入っていなければ、通さずに止める（確かめずに通すと、ボット対策が黙って外れる）
  if (!env.TURNSTILE_SECRET) throw unavailable("no secret");
  if (!env.TURNSTILE_HOSTNAME) throw unavailable("no hostname");
  // 利用者の IP は送らない（任意の項目で、送らなくても確かめられる）
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET);
  form.append("response", token);
  // 聞けない（通信の失敗・5秒で切れた）・Cloudflare の側の失敗・読めない応答は、どれも 503 にする
  let res: Response;
  try {
    res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS),
    });
  } catch {
    throw unavailable("fetch failed");
  }
  if (!res.ok) throw unavailable(`status ${res.status}`);
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw unavailable("bad json");
  }
  if (typeof data !== "object" || data === null) throw unavailable("bad json");
  const body = data as { success?: unknown; hostname?: unknown; "error-codes"?: unknown };

  if (body.success !== true) {
    // 運営者の側・Cloudflare の側の失敗なら 503。error-codes が配列でない・ないときは、利用者の券の失敗として断る
    const codes = Array.isArray(body["error-codes"]) ? body["error-codes"] : [];
    const code = UNAVAILABLE_ERROR_CODES.find((c) => codes.includes(c));
    if (code) throw unavailable(code);
    return false;
  }
  // 本物でも、このサイトで解いた券でなければ断る（action は試験用の鍵が返さないので見ない）。
  // 試験用の秘密の鍵の入れ間違いの目印になるので、固定の文だけ残す
  if (body.hostname !== env.TURNSTILE_HOSTNAME) {
    console.error("turnstile: hostname mismatch");
    return false;
  }
  return true;
};
