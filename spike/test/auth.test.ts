// ログインの確認のテスト。テスト用の鍵で自分で署名した証明書を使う（公開鍵を差し替える）。
// 「ログインの確認を緩める」設定は作らない（ADR 0003 の「ローカルでの認証のテスト」）
import { env } from "cloudflare:test";
import { generateKeyPair, SignJWT, type JWTPayload } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { KeyUnavailableError, type KeyProvider } from "../src/firebase-auth";

const PROJECT = env.FIREBASE_PROJECT_ID;
const KID = "test-kid";
let privateKey: CryptoKey;
let otherPrivateKey: CryptoKey; // Google のものではない鍵（なりすまし役）
let provider: KeyProvider;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  otherPrivateKey = (await generateKeyPair("RS256")).privateKey;
  provider = async (kid) => (kid === KID ? pair.publicKey : undefined);
});

const now = () => Math.floor(Date.now() / 1000);

async function sign(
  overrides: JWTPayload = {},
  opts: { key?: CryptoKey; kid?: string } = {},
): Promise<string> {
  const t = now();
  const payload: JWTPayload = {
    iss: `https://securetoken.google.com/${PROJECT}`,
    aud: PROJECT,
    sub: "user-123",
    iat: t - 10,
    exp: t + 3600,
    auth_time: t - 10,
    email_verified: true,
    ...overrides,
  };
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "RS256", kid: opts.kid ?? KID })
    .sign(opts.key ?? privateKey);
}

async function callMe(token?: string, getKey: KeyProvider = provider) {
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  return createApp(getKey).request("/api/me", { headers }, env);
}

describe("GET /api/me（ログインの確認）", () => {
  it("正しい証明書なら uid を返す", async () => {
    const res = await callMe(await sign());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ uid: "user-123", emailVerified: true });
  });

  it("確認メールが済んでいない人は emailVerified: false", async () => {
    const res = await callMe(await sign({ email_verified: false }));
    expect(await res.json()).toMatchObject({ emailVerified: false });
  });

  it("証明書がなければ 401", async () => {
    expect((await callMe()).status).toBe(401);
  });

  const rejected: [string, () => Promise<string>][] = [
    ["別のプロジェクト向け（aud が違う）", () => sign({ aud: "other-project" })],
    ["発行元が違う（iss が違う）", () => sign({ iss: "https://securetoken.google.com/other" })],
    ["期限切れ", () => sign({ exp: now() - 60, iat: now() - 4000 })],
    ["発行時刻が未来", () => sign({ iat: now() + 600 })],
    ["auth_time がない", () => sign({ auth_time: undefined })],
    ["sub が空", () => sign({ sub: "" })],
    ["別の鍵で署名（なりすまし）", () => sign({}, { key: otherPrivateKey })],
    ["知らない kid", () => sign({}, { kid: "unknown" })],
    ["形が壊れている", async () => "not-a-jwt"],
  ];
  for (const [name, make] of rejected) {
    it(`${name} → 401`, async () => {
      expect((await callMe(await make())).status).toBe(401);
    });
  }

  it("中身を書き換えたら 401（署名が合わなくなる）", async () => {
    const [h, , s] = (await sign()).split(".");
    const forged = btoa(JSON.stringify({ sub: "someone-else" })).replace(/=+$/, "");
    expect((await callMe(`${h}.${forged}.${s}`)).status).toBe(401);
  });

  it("alg: none の証明書は 401", async () => {
    const enc = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, "");
    const t = now();
    const token = `${enc({ alg: "none", kid: KID })}.${enc({ sub: "x", aud: PROJECT, iss: `https://securetoken.google.com/${PROJECT}`, iat: t, exp: t + 60, auth_time: t })}.`;
    expect((await callMe(token)).status).toBe(401);
  });

  it("公開鍵が取れないときは 503（ログインし直しではなく「いまは使えない」）", async () => {
    const broken: KeyProvider = async () => {
      throw new KeyUnavailableError("down");
    };
    expect((await callMe(await sign(), broken)).status).toBe(503);
  });
});

describe("そのほかの API", () => {
  it("知らない API は JSON の 404", async () => {
    const res = await createApp(provider).request("/api/nope", {}, env);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });
});
