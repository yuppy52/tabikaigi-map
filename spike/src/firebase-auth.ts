// Firebase の ID トークン（ログインした人の「証明書」）を Worker の中で確かめる。
//
// 考え方：証明書は Google の秘密鍵で署名されている。Google が公開している「公開鍵」で署名を確かめれば、
// 改ざんされていないこと・Google が出したものであることが分かる。そのうえで、
// 「このアプリのプロジェクト向けか（aud・iss）」「期限内か（exp）」を見る。
// 確かめ方の決まりは Firebase の公式の手順（サードパーティの JWT ライブラリで確かめる）に合わせる。

import { decodeProtectedHeader, errors, jwtVerify } from "jose";

/** 鍵の ID（kid）から公開鍵を返す関数。本番は Google から取り、テストではテスト用の鍵に差し替える */
export type KeyProvider = (kid: string) => Promise<CryptoKey | undefined>;

export type VerifiedUser = {
  uid: string;
  emailVerified: boolean;
  /** 最後にログインした時刻（秒）。退会のときに「最近ログインし直したか」を見るのに使う */
  authTime: number;
};

/** 証明書が正しくない（ログインし直してもらう：401） */
export class InvalidTokenError extends Error {}
/** 公開鍵が取れない（こちらの都合で使えない：503） */
export class KeyUnavailableError extends Error {}

export async function verifyFirebaseIdToken(
  token: string,
  projectId: string,
  getKey: KeyProvider,
): Promise<VerifiedUser> {
  let kid: string | undefined;
  try {
    const header = decodeProtectedHeader(token);
    if (header.alg !== "RS256") throw new InvalidTokenError("alg が RS256 ではない");
    kid = header.kid;
  } catch (e) {
    if (e instanceof InvalidTokenError) throw e;
    throw new InvalidTokenError("証明書の形が正しくない");
  }
  if (!kid) throw new InvalidTokenError("kid がない");

  const key = await getKey(kid); // ここで KeyUnavailableError が出たら、そのまま上へ
  if (!key) throw new InvalidTokenError("知らない kid");

  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ["RS256"],
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      clockTolerance: 5, // 端末と時計が数秒ずれていても通す
    });
    const now = Math.floor(Date.now() / 1000);
    const sub = payload.sub;
    if (typeof sub !== "string" || sub.length === 0 || sub.length > 128) {
      throw new InvalidTokenError("sub（利用者ID）が正しくない");
    }
    if (typeof payload.iat !== "number" || payload.iat > now + 5) {
      throw new InvalidTokenError("iat が未来");
    }
    const authTime = payload.auth_time;
    if (typeof authTime !== "number" || authTime > now + 5) {
      throw new InvalidTokenError("auth_time が正しくない");
    }
    return { uid: sub, emailVerified: payload.email_verified === true, authTime };
  } catch (e) {
    if (e instanceof InvalidTokenError) throw e;
    if (e instanceof errors.JOSEError) throw new InvalidTokenError(e.code);
    throw e;
  }
}

// ---- 本番用：Google の公開鍵を取って、決められた時間だけ取っておく ----

const GOOGLE_JWK_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

type KeyCache = { keys: Map<string, CryptoKey>; expiresAt: number };
// Worker のメモリに置く（同じ Worker が動いている間だけ残る。KV の書き込みの枠を使わない）
let cache: KeyCache | undefined;

export const googleKeyProvider: KeyProvider = async (kid) => {
  const now = Date.now();
  if (!cache || cache.expiresAt <= now) {
    cache = await fetchGoogleKeys(now);
  }
  return cache.keys.get(kid);
};

async function fetchGoogleKeys(now: number): Promise<KeyCache> {
  let res: Response;
  try {
    res = await fetch(GOOGLE_JWK_URL);
  } catch {
    throw new KeyUnavailableError("公開鍵を取りに行けなかった");
  }
  if (!res.ok) throw new KeyUnavailableError(`公開鍵の取得に失敗：${res.status}`);
  const body = (await res.json()) as { keys?: (JsonWebKey & { kid?: string })[] };
  const keys = new Map<string, CryptoKey>();
  for (const jwk of body.keys ?? []) {
    if (!jwk.kid) continue;
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    keys.set(jwk.kid, key);
  }
  // Cache-Control の max-age（秒）に従う。書いていなければ1時間
  const maxAge = /max-age=(\d+)/.exec(res.headers.get("Cache-Control") ?? "")?.[1];
  const ttlMs = (maxAge ? Number(maxAge) : 3600) * 1000;
  return { keys, expiresAt: now + ttlMs };
}
