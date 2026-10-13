// テストの道具：テスト用の鍵で署名した ID トークン、Turnstile の差し替え、API の呼び出し
import { applyD1Migrations, createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { generateKeyPair, SignJWT, type JWTPayload } from "jose";
import { createApp, type Deps } from "../src/app";
import type { KeyProvider } from "../src/firebase-auth";

const KID = "test-kid";
let keys: { privateKey: CryptoKey; publicKey: CryptoKey } | undefined;
let migrated = false;

/** テーブルを作る（ファイルごとに1回） */
export async function setup() {
  if (!migrated) {
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
    migrated = true;
  }
  keys ??= await generateKeyPair("RS256");
}

/** テスト用の鍵の公開鍵を返す（本番の Google の公開鍵の代わり） */
export const testKeyProvider: KeyProvider = async (kid) => (kid === KID ? keys!.publicKey : undefined);

/** テスト用の Turnstile：合言葉が "ok" なら通す */
export const testTurnstile: Deps["verifyTurnstile"] = async (token) => token === "ok";

/** ID トークンを作る（「ログインの確認を緩める」設定は作らず、自分で署名する：ADR 0003） */
export async function token(uid: string, overrides: JWTPayload = {}, signWith?: CryptoKey, kid = KID): Promise<string> {
  const t = Math.floor(Date.now() / 1000);
  const project = env.FIREBASE_PROJECT_ID;
  return new SignJWT({
    iss: `https://securetoken.google.com/${project}`,
    aud: project,
    sub: uid,
    iat: t - 10,
    exp: t + 3600,
    auth_time: t - 10,
    email_verified: true,
    ...overrides,
  })
    .setProtectedHeader({ alg: "RS256", kid })
    .sign(signWith ?? keys!.privateKey);
}

export type CallOptions = {
  token?: string;
  body?: unknown;
  rawBody?: string;
  deps?: Partial<Deps>;
  headers?: Record<string, string>;
  env?: Partial<Env>;
};

/** API を呼ぶ。応答の後に流す処理（waitUntil）も終わるまで待つ */
export async function call(method: string, path: string, opts: CallOptions = {}) {
  const app = createApp({ getKey: testKeyProvider, verifyTurnstile: testTurnstile, ...opts.deps });
  const headers: Record<string, string> = { "X-Tabikaigi": "1", ...opts.headers };
  if (opts.token !== undefined) headers.Authorization = `Bearer ${opts.token}`;
  let body: string | undefined = opts.rawBody;
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  const ctx = createExecutionContext();
  const res = await app.fetch(new Request(`https://example.com${path}`, { method, headers, body }), { ...env, ...opts.env }, ctx);
  await waitOnExecutionContext(ctx);
  const json = (await res.json().catch(() => null)) as any;
  return { status: res.status, json };
}

/** グループを作る（ログインなし、またはトークン付き） */
export async function create(name = "ゆう", opts: { token?: string; groupName?: string } = {}) {
  const r = await call("POST", "/api/groups", {
    token: opts.token,
    body: { groupName: opts.groupName ?? "旅行部", name, turnstileToken: "ok" },
  });
  if (r.status !== 201) throw new Error(`create failed: ${r.status} ${JSON.stringify(r.json)}`);
  return r.json as { groupId: string; memberId: number };
}

/** 参加する */
export function join(groupId: string, name: string, tokenValue?: string) {
  return call("POST", `/api/groups/${groupId}/members`, { token: tokenValue, body: { name, turnstileToken: "ok" } });
}

/** 新しい鍵（なりすまし役：Google のものではない鍵） */
export async function otherKey() {
  return (await generateKeyPair("RS256")).privateKey;
}

export { env };
