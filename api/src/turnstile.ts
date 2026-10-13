// Turnstile（ボット対策）の確かめ（Q-031）。グループの作成と参加で使う。
// 画面が受け取った合言葉（トークン）を、Cloudflare に「本物か」を聞いて確かめる

/** 確かめる関数。本番は Cloudflare に聞き、テストでは差し替える */
export type TurnstileVerifier = (token: string, env: Env) => Promise<boolean>;

/** Cloudflare に聞けなかった（こちらの都合で使えない：503） */
export class TurnstileUnavailableError extends Error {}

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export const cloudflareTurnstile: TurnstileVerifier = async (token, env) => {
  // 秘密の鍵が入っていなければ、通さずに止める（確かめずに通すと、ボット対策が黙って外れる）
  if (!env.TURNSTILE_SECRET) throw new TurnstileUnavailableError("TURNSTILE_SECRET がない");
  // 利用者の IP は送らない（任意の項目で、送らなくても確かめられる）
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET);
  form.append("response", token);
  let res: Response;
  try {
    res = await fetch(SITEVERIFY_URL, { method: "POST", body: form });
  } catch {
    throw new TurnstileUnavailableError("Cloudflare に聞けなかった");
  }
  if (!res.ok) throw new TurnstileUnavailableError(`siteverify：${res.status}`);
  const body = (await res.json()) as { success?: boolean };
  return body.success === true;
};
