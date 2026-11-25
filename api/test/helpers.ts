// テストの道具：Turnstile の差し替え、API の呼び出し、グループの作成と参加
import { applyD1Migrations, createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { createApp, type Deps } from "../src/app";

let migrated = false;

/** テーブルを作る（ファイルごとに1回） */
export async function setup() {
  if (!migrated) {
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
    migrated = true;
  }
}

/** テスト用の Turnstile：合言葉が "ok" なら通す */
export const testTurnstile: Deps["verifyTurnstile"] = async (token) => token === "ok";

export type CallOptions = {
  body?: unknown;
  /** そのまま送る本文。ReadableStream なら Content-Length の付かない、少しずつ届く本文になる */
  rawBody?: string | ReadableStream<Uint8Array>;
  deps?: Partial<Deps>;
  headers?: Record<string, string>;
  env?: Partial<Env>;
};

/**
 * API を呼び、応答をそのまま返す（ヘッダーを見たいとき用）。応答の後に流す処理（waitUntil）も終わるまで待つ。
 * omitMark：目印のヘッダー（X-Tabikaigi）を付けない（よそのサイトからの書き込みをまねる）
 */
export async function callRaw(method: string, path: string, opts: CallOptions & { omitMark?: boolean } = {}) {
  const app = createApp({ verifyTurnstile: testTurnstile, ...opts.deps });
  const headers: Record<string, string> = { ...(opts.omitMark ? {} : { "X-Tabikaigi": "1" }), ...opts.headers };
  let body: string | ReadableStream<Uint8Array> | undefined = opts.rawBody;
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  const ctx = createExecutionContext();
  const res = await app.fetch(new Request(`https://example.com${path}`, { method, headers, body }), { ...env, ...opts.env }, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

/** API を呼ぶ。状態コードと JSON だけを返す */
export async function call(method: string, path: string, opts: CallOptions & { omitMark?: boolean } = {}) {
  const res = await callRaw(method, path, opts);
  const json = (await res.json().catch(() => null)) as any;
  return { status: res.status, json };
}

/** グループを作る */
export async function create(name = "ゆう", opts: { groupName?: string } = {}) {
  const r = await call("POST", "/api/groups", {
    body: { groupName: opts.groupName ?? "旅行部", name, turnstileToken: "ok" },
  });
  if (r.status !== 201) throw new Error(`create failed: ${r.status} ${JSON.stringify(r.json)}`);
  return r.json as { groupId: string; memberId: number };
}

/** 参加する */
export function join(groupId: string, name: string) {
  return call("POST", `/api/groups/${groupId}/members`, { body: { name, turnstileToken: "ok" } });
}

export { env };
