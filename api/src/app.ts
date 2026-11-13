// API の本体（Hono）。URL と応答の一覧は docs/design/api.md。
// ログインはない（ADR 0013）。外の仕組み（Turnstile）は引数で受け取り、テストで差し替えられるようにしている
import { Hono, type Context, type Next } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { createGroup, joinGroup, readGroup, setMemberVisit, touchGroup } from "./groups";
import { isGroupId } from "./ids";
import { deleteGroup, deleteMember, leaveMember, renameGroup } from "./manage";
import { notifyRoom } from "./room-entry";
import { checkName, GROUP_NAME, MEMBER_NAME } from "./names";
import { TurnstileUnavailableError, type TurnstileVerifier } from "./turnstile";

export type Deps = { verifyTurnstile: TurnstileVerifier };

type C = Context<{ Bindings: Env }>;

/** 決まった形のエラー（画面は error の値で知らせを読み分ける：docs/design/screens.md の「知らせ」） */
function fail(c: C, status: ContentfulStatusCode, error: string, extra: Record<string, unknown> = {}) {
  return c.json({ error, ...extra }, status);
}

/** 断った理由（groups.ts・manage.ts が返すもの） */
type Reason = "group_not_found" | "member_not_found";

/** 断った理由ごとの状態コード（「ない」は 404）。理由を足したら型の確かめで漏れに気づく */
const STATUS: Record<Reason, ContentfulStatusCode> = {
  group_not_found: 404,
  member_not_found: 404,
};

/** 書き込みの結果を応答にする（0行だったときの理由は、groups.ts・manage.ts で読み直して分けてある） */
function writeResponse(c: C, r: { ok: true } | { ok: false; reason: Reason }, body: Record<string, unknown> = { ok: true }) {
  if (r.ok) return c.json(body);
  return fail(c, STATUS[r.reason], r.reason);
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
  const app = new Hono<{ Bindings: Env }>().basePath("/api");

  // 本文は小さいものしか送らない。大きな本文を送りつけられても読まずに断る
  app.use(bodyLimit({ maxSize: 4 * 1024, onError: (c) => c.json({ error: "bad_request" }, 413) }));

  // 画面が必ず付ける目印のヘッダー。よそのサイトに <img src="…/api/groups/…"> を置かれても、
  // ブラウザはこのヘッダーを勝手に付けないので、D1 を読まずに断れる（読み取りの無料枠を使い切らせない。/api/health は除く）
  app.use(async (c, next) => {
    if (c.req.path !== "/api/health" && c.req.header("X-Tabikaigi") !== "1") return fail(c, 400, "bad_request");
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
    const body: unknown = await c.req.json().catch(() => null);
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
    const r = await createGroup(c.env.DB, groupName.name, name.name);
    return c.json({ groupId: r.groupId, memberId: r.memberId }, 201);
  });

  // グループIDの形が違えば、データベースを引かずに「ない」と返す。
  // Hono では /groups/:groupId/* が /groups/abc にも当たる（2026-10-19 にテストで確かめた）が、念のため両方に掛ける
  const checkGroupId = async (c: C, next: Next) => {
    if (!isGroupId(c.req.param("groupId") ?? "")) return fail(c, 404, "group_not_found");
    return next();
  };
  app.use("/groups/:groupId/*", checkGroupId);
  app.use("/groups/:groupId", checkGroupId);

  // 新しいメンバーとして参加する（REQ-004・REQ-005・REQ-008）
  app.post("/groups/:groupId/members", async (c) => {
    const body = await readBody(c);
    const name = checkName(body.name, MEMBER_NAME);
    if (!name.ok) return fail(c, 400, "bad_name");
    const blocked = await checkTurnstile(c, body.turnstileToken);
    if (blocked) return blocked;
    const r = await joinGroup(c.env.DB, c.req.param("groupId"), name.name);
    if (r.ok) return c.json({ memberId: r.memberId }, 201);
    if (r.reason === "group_not_found") return fail(c, 404, r.reason);
    // 同じ名前の人がいれば、その人の番号を返す（画面が「（名前）さんとして入る」を出す：REQ-012）
    if (r.reason === "name_taken") return fail(c, 409, r.reason, { memberId: r.memberId });
    return fail(c, 409, r.reason);
  });

  // グループを開く。最後に開かれた日の更新は、応答の後で別に流し、失敗しても無視する（Q-025）
  app.get("/groups/:groupId", async (c) => {
    const groupId = c.req.param("groupId");
    const view = await readGroup(c.env.DB, groupId);
    if (!view) return fail(c, 404, "group_not_found");
    c.executionCtx.waitUntil(
      touchGroup(c.env.DB, groupId).catch((e) => console.warn("last_opened_on の更新に失敗（無視する）", String(e))),
    );
    return c.json(view);
  });

  // メンバーの「行った」を付ける・外す（REQ-016・REQ-023）
  const memberVisit = (visited: boolean) => async (c: C) => {
    const memberId = parseMemberId(c.req.param("memberId") ?? "");
    const pref = parsePref(c.req.param("pref") ?? "");
    if (memberId === null || pref === null) return fail(c, 400, "bad_request");
    const groupId = c.req.param("groupId")!;
    const r = await setMemberVisit(c.env.DB, groupId, memberId, pref, visited);
    // 書けたら（付いていた・外れていたときも成功なので）部屋に配る。断ったときは配らない
    if (r.ok) notifyRoom(c.executionCtx, c.env, groupId, { type: "visit", memberId, pref, visited });
    return writeResponse(c, r);
  };
  app.put("/groups/:groupId/members/:memberId/visits/:pref", memberVisit(true));
  app.delete("/groups/:groupId/members/:memberId/visits/:pref", memberVisit(false));

  /** URL のメンバーの番号を読む。形が違えば null */
  const memberIdOf = (c: C) => parseMemberId(c.req.param("memberId") ?? "");

  // 退出する（REQ-049・REQ-050）。最後の1人ならグループも消え、groupDeleted: true を返す
  app.post("/groups/:groupId/members/:memberId/leave", async (c) => {
    const memberId = memberIdOf(c);
    if (memberId === null) return fail(c, 400, "bad_request");
    const r = await leaveMember(c.env.DB, c.req.param("groupId"), memberId);
    return writeResponse(c, r, r.ok ? { ok: true, groupDeleted: r.groupDeleted } : undefined);
  });

  // メンバーを削除する（REQ-048・REQ-050）
  app.delete("/groups/:groupId/members/:memberId", async (c) => {
    const memberId = memberIdOf(c);
    if (memberId === null) return fail(c, 400, "bad_request");
    const groupId = c.req.param("groupId");
    const r = await deleteMember(c.env.DB, groupId, memberId);
    // ほかの人の画面が、消されたことに気づくように取り直してもらう（Q-020）。
    // 本当に1人消えたときだけ配る（いない番号・ほかのグループの番号・2回目は成功でも D1 に書いていないので配らない）
    if (r.ok && r.removed) notifyRoom(c.executionCtx, c.env, groupId, { type: "refetch" });
    return writeResponse(c, r, r.ok ? { ok: true, groupDeleted: r.groupDeleted } : undefined);
  });

  // グループ名を変える（REQ-046）。メンバーの番号は受け取らず、グループIDだけで通す
  app.put("/groups/:groupId/name", async (c) => {
    const name = checkName((await readBody(c)).name, GROUP_NAME);
    if (!name.ok) return fail(c, 400, "bad_name");
    return writeResponse(c, await renameGroup(c.env.DB, c.req.param("groupId"), name.name));
  });

  // グループを削除する（REQ-047）。メンバーの番号は受け取らず、グループIDだけで通す
  app.delete("/groups/:groupId", async (c) => {
    const groupId = c.req.param("groupId");
    const r = await deleteGroup(c.env.DB, groupId);
    // ほかの人の画面が、消されたことに気づくように取り直してもらう（Q-020）
    if (r.ok) notifyRoom(c.executionCtx, c.env, groupId, { type: "refetch" });
    return writeResponse(c, r);
  });

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
