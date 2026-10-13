// API の本体（Hono）。URL と応答の一覧は docs/design/api.md。
// 外の仕組み（Google の公開鍵、Turnstile）は引数で受け取り、テストで差し替えられるようにしている
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
  InvalidTokenError,
  KeyUnavailableError,
  verifyFirebaseIdToken,
  type KeyProvider,
  type VerifiedUser,
} from "./firebase-auth";
import { createGroup, joinGroup, readGroup, setAccountVisit, setMemberVisit, touchGroup, type WriteResult } from "./groups";
import { isGroupId } from "./ids";
import { checkName, GROUP_NAME, MEMBER_NAME } from "./names";
import { TurnstileUnavailableError, type TurnstileVerifier } from "./turnstile";

export type Deps = { getKey: KeyProvider; verifyTurnstile: TurnstileVerifier };

/** ログイン済み（メールアドレスの確認が済んだ）人。それ以外は null（ログインなしとして扱う） */
type Vars = { user: VerifiedUser | null };
type C = Context<{ Bindings: Env; Variables: Vars }>;

/** 決まった形のエラー（画面は error の値で知らせを読み分ける：docs/design/screens.md の「知らせ」） */
function fail(c: C, status: ContentfulStatusCode, error: string, extra: Record<string, unknown> = {}) {
  return c.json({ error, ...extra }, status);
}

/** ログインが要る API で使う。ログイン済みの人がいなければ（ログインなし・確認待ち）401 の応答を返す */
function requireUser(c: C): { user: VerifiedUser; error?: undefined } | { user?: undefined; error: Response } {
  const user = c.get("user");
  return user ? { user } : { error: fail(c, 401, "login_required") };
}

/** 書き込みの結果を応答にする（0行だったときの理由は、groups.ts で読み直して分けてある） */
function writeResponse(c: C, r: WriteResult) {
  if (r.ok) return c.json({ ok: true });
  return fail(c, r.reason === "member_linked" ? 403 : 404, r.reason);
}

/** URL の県の番号（1〜47 の整数だけ） */
function parsePref(s: string): number | null {
  if (!/^[1-9][0-9]?$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 && n <= 47 ? n : null;
}

/** URL のメンバーの番号（正の整数だけ） */
function parseMemberId(s: string): number | null {
  if (!/^[1-9][0-9]{0,9}$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

export function createApp(deps: Deps) {
  const app = new Hono<{ Bindings: Env; Variables: Vars }>().basePath("/api");

  // 本文は小さいものしか送らない。大きな本文を送りつけられても読まずに断る
  app.use(bodyLimit({ maxSize: 4 * 1024, onError: (c) => c.json({ error: "bad_request" }, 413) }));

  // 画面が必ず付ける目印のヘッダー。よそのサイトに <img src="…/api/groups/…"> を置かれても、
  // ブラウザはこのヘッダーを勝手に付けないので、D1 を読まずに断れる（読み取りの無料枠を使い切らせない。/api/health は除く）
  app.use(async (c, next) => {
    if (c.req.path !== "/api/health" && c.req.header("X-Tabikaigi") !== "1") return fail(c, 400, "bad_request");
    return next();
  });

  // 設定の入れ忘れ（Firebase のプロジェクトID）は、全部 401 にせず 503 で止めて気づけるようにする
  app.use(async (c, next) => {
    if (!c.env.FIREBASE_PROJECT_ID) return fail(c, 503, "unavailable", { reason: "temporary" });
    return next();
  });

  // ID トークンの確かめ。付いていなければログインなし。付いているのに確かめられなければ、ログインなしに落とさず止める（NFR-006 (10)）
  app.use(async (c, next) => {
    const auth = c.req.header("Authorization");
    if (auth === undefined) {
      c.set("user", null);
      return next();
    }
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return fail(c, 401, "invalid_token");
    try {
      const user = await verifyFirebaseIdToken(token, c.env.FIREBASE_PROJECT_ID, deps.getKey);
      // 確認待ち（email_verified が false）の人は、ログインなしとして扱う（REQ-057）
      c.set("user", user.emailVerified ? user : null);
    } catch (e) {
      if (e instanceof InvalidTokenError) return fail(c, 401, "invalid_token");
      if (e instanceof KeyUnavailableError) return fail(c, 503, "unavailable", { reason: "temporary" });
      throw e;
    }
    return next();
  });

  app.get("/health", (c) => c.json({ ok: true }));

  /** Turnstile を確かめる。通らなければ応答を返し、通れば null */
  async function checkTurnstile(c: C, token: unknown) {
    if (typeof token !== "string" || token.length === 0 || token.length > 2048) return fail(c, 403, "turnstile_failed");
    try {
      if (!(await deps.verifyTurnstile(token, c.env))) return fail(c, 403, "turnstile_failed");
    } catch (e) {
      if (e instanceof TurnstileUnavailableError) return fail(c, 503, "unavailable", { reason: "temporary" });
      throw e;
    }
    return null;
  }

  async function readBody(c: C): Promise<Record<string, unknown>> {
    const body = await c.req.json().catch(() => null);
    return body !== null && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  }

  // グループを作る（REQ-001）
  app.post("/groups", async (c) => {
    const body = await readBody(c);
    const groupName = checkName(body.groupName, GROUP_NAME);
    const name = checkName(body.name, MEMBER_NAME);
    if (!groupName.ok || !name.ok) return fail(c, 400, "bad_name");
    const blocked = await checkTurnstile(c, body.turnstileToken);
    if (blocked) return blocked;
    const r = await createGroup(c.env.DB, groupName.name, name.name, c.get("user")?.uid ?? null);
    if (!r.ok) return fail(c, 409, r.reason);
    return c.json({ groupId: r.groupId, memberId: r.memberId }, 201);
  });

  // グループIDの形が違えば、データベースを引かずに「ない」と返す
  app.use("/groups/:groupId/*", async (c, next) => {
    if (!isGroupId(c.req.param("groupId"))) return fail(c, 404, "group_not_found");
    return next();
  });
  app.use("/groups/:groupId", async (c, next) => {
    if (!isGroupId(c.req.param("groupId"))) return fail(c, 404, "group_not_found");
    return next();
  });

  // 新しいメンバーとして参加する（REQ-004・REQ-005・REQ-008）
  app.post("/groups/:groupId/members", async (c) => {
    const body = await readBody(c);
    const name = checkName(body.name, MEMBER_NAME);
    if (!name.ok) return fail(c, 400, "bad_name");
    const blocked = await checkTurnstile(c, body.turnstileToken);
    if (blocked) return blocked;
    const r = await joinGroup(c.env.DB, c.req.param("groupId"), name.name, c.get("user")?.uid ?? null);
    if (r.ok) return c.json({ memberId: r.memberId }, 201);
    if (r.reason === "group_not_found") return fail(c, 404, r.reason);
    if (r.reason === "name_taken") return fail(c, 409, r.reason, { memberId: r.memberId, linked: r.linked });
    return fail(c, 409, r.reason);
  });

  // グループを開く。最後に開かれた日の更新は、応答の後で別に流し、失敗しても無視する（Q-025）
  app.get("/groups/:groupId", async (c) => {
    const groupId = c.req.param("groupId");
    const view = await readGroup(c.env.DB, groupId, c.get("user")?.uid ?? null);
    if (!view) return fail(c, 404, "group_not_found");
    c.executionCtx.waitUntil(
      touchGroup(c.env.DB, groupId).catch((e) => console.warn("last_opened_on の更新に失敗（無視する）", String(e))),
    );
    return c.json(view);
  });

  // ログインなしのメンバーの「行った」を付ける・外す（REQ-016・REQ-023）
  const memberVisit = (visited: boolean) => async (c: C) => {
    const memberId = parseMemberId(c.req.param("memberId") ?? "");
    const pref = parsePref(c.req.param("pref") ?? "");
    if (memberId === null || pref === null) return fail(c, 400, "bad_request");
    return writeResponse(c, await setMemberVisit(c.env.DB, c.req.param("groupId")!, memberId, pref, visited));
  };
  app.put("/groups/:groupId/members/:memberId/visits/:pref", memberVisit(true));
  app.delete("/groups/:groupId/members/:memberId/visits/:pref", memberVisit(false));

  // ログイン済みの人の「行った」を付ける・外す（REQ-030）。アカウントに書く
  const myVisit = (visited: boolean) => async (c: C) => {
    const { user, error } = requireUser(c);
    if (error) return error;
    const pref = parsePref(c.req.param("pref") ?? "");
    if (pref === null) return fail(c, 400, "bad_request");
    return writeResponse(c, await setAccountVisit(c.env.DB, c.req.param("groupId")!, user.uid, pref, visited));
  };
  app.put("/groups/:groupId/my-visits/:pref", myVisit(true));
  app.delete("/groups/:groupId/my-visits/:pref", myVisit(false));

  // 知らない API は JSON で 404
  app.notFound((c) => c.json({ error: "not_found" }, 404));

  // 途中で落ちたとき（D1 の失敗など）は 503。無料枠を超えたときの D1 のエラーの文はまだ確かめていないので、
  // いまは「一時的な失敗」として返す（Phase 2 で確かめて「枠切れ」を分ける：docs/design/api.md）
  app.onError((e, c) => {
    console.error("api error", e instanceof Error ? e.message : String(e));
    return c.json({ error: "unavailable", reason: "temporary" }, 503);
  });

  return app;
}
