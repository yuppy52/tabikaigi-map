// 止まったときの応答の形のテスト（ADR 0003 の決定の基準の3、NFR-009・NFR-012）
// 本物の枠切れは本番でしか起きないので、D1 が例外を投げる環境を作って、応答の形だけを確かめる。
// （Workers の枠切れは Worker の前で起きて、Cloudflare の画面が返る。それは JSON ではないので、画面側で「いまは使えない」として扱う）
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { KeyUnavailableError } from "../src/firebase-auth";

/** 何を呼んでも例外になる D1 の代わり（枠切れの再現） */
const brokenDb = {
  prepare() {
    throw new Error("D1_ERROR: exceeded daily limit");
  },
  batch() {
    throw new Error("D1_ERROR: exceeded daily limit");
  },
} as unknown as D1Database;

const app = createApp(async () => {
  throw new KeyUnavailableError("test");
});

const json = { "Content-Type": "application/json" };

// 公開鍵を取りに行く前までの形（ヘッダーに kid がある）の証明書。中身の署名は見ないので空でよい
const headerOnlyToken = `${Buffer.from(JSON.stringify({ alg: "RS256", kid: "k1" })).toString("base64url")}.e30.sig`;

describe("止まったときの応答（NFR-009・NFR-012）", () => {
  it("D1 が使えないとき、グループの取得は 503 の JSON（unavailable）を返す", async () => {
    const res = await app.request(
      "/api/groups/state",
      { method: "POST", headers: json, body: JSON.stringify({ groupId: "x" }) },
      { ...env, DB: brokenDb },
    );
    expect(res.status).toBe(503);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect(await res.json()).toEqual({ error: "unavailable" });
  });

  it("「行った」の付け外しも、D1 が使えないなら 503 unavailable（画面は変えずに「保存できなかった」と出す）", async () => {
    const res = await app.request(
      "/api/visits",
      { method: "POST", headers: json, body: JSON.stringify({ groupId: "x", memberId: 1, pref: 1, visited: true }) },
      { ...env, DB: brokenDb },
    );
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "unavailable" });
  });

  it("証明書の公開鍵が取れないときは 503 unavailable（ログインしている人だけに影響する）", async () => {
    const res = await app.request("/api/me", { headers: { Authorization: `Bearer ${headerOnlyToken}` } }, env);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "unavailable" });
  });

  it("知らない API は 404 の JSON（止まったのとは区別できる）", async () => {
    const res = await app.request("/api/nothing", { method: "POST" }, env);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });
});
