// API の本体（Hono）。鍵の取り方を外から渡せるようにして、テストで差し替えられるようにしている
import { Hono } from "hono";
import { createGroup, joinGroup, setVisited } from "./db";
import { checkName } from "./names";
import { roomKey } from "./room";
import {
  InvalidTokenError,
  KeyUnavailableError,
  verifyFirebaseIdToken,
  type KeyProvider,
  type VerifiedUser,
} from "./firebase-auth";

type Vars = { user: VerifiedUser };

export function createApp(getKey: KeyProvider) {
  const app = new Hono<{ Bindings: Env; Variables: Vars }>().basePath("/api");

  app.get("/health", (c) => c.json({ ok: true }));

  // ログインが必要な API の前に置く「関所」。証明書を確かめて、通ったら user を渡す
  app.use("/me", async (c, next) => {
    const auth = c.req.header("Authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return c.json({ error: "login_required" }, 401);
    try {
      c.set("user", await verifyFirebaseIdToken(token, c.env.FIREBASE_PROJECT_ID, getKey));
    } catch (e) {
      if (e instanceof InvalidTokenError) return c.json({ error: "invalid_token" }, 401);
      if (e instanceof KeyUnavailableError) return c.json({ error: "unavailable" }, 503);
      throw e;
    }
    await next();
  });

  // 「行った」の付け外し。D1 に書いてから、部屋に知らせる（試作なので、紐づいたメンバーの本人確認は省いている）
  app.post("/visits", async (c) => {
    const body = await c.req.json<{ groupId?: unknown; memberId?: unknown; pref?: unknown; visited?: unknown }>().catch(() => ({}));
    const { groupId, memberId, pref, visited } = body as Record<string, unknown>;
    if (typeof groupId !== "string" || !Number.isInteger(memberId) || !Number.isInteger(pref) || typeof visited !== "boolean") {
      return c.json({ error: "bad_request" }, 400);
    }
    // そのグループのメンバーか（グループIDを知っている人だけが書ける：NFR-005）
    const member = await c.env.DB.prepare("SELECT 1 FROM members WHERE id = ? AND group_id = ?").bind(memberId, groupId).first();
    if (!member) return c.json({ error: "not_found" }, 404);
    try {
      await setVisited(c.env.DB, memberId as number, pref as number, visited);
    } catch (e) {
      if (e instanceof Error && /CHECK constraint failed/.test(e.message)) return c.json({ error: "bad_request" }, 400);
      throw e;
    }
    // 書けたら部屋に知らせる。知らせに失敗しても、書き込みは成功として返す（画面は開き直せば正しくなる）
    let notified = 0;
    try {
      const room = c.env.GROUP_ROOM.get(c.env.GROUP_ROOM.idFromName(await roomKey(groupId)));
      notified = await room.broadcast({ type: "visit", memberId: memberId as number, pref: pref as number, visited });
    } catch {
      notified = -1;
    }
    return c.json({ ok: true, notified });
  });

  // ---- 画面の試作（demo）用の API。グループIDは URL に入れず、中身で送る ----

  app.post("/groups", async (c) => {
    const { groupName, name } = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const g = checkName(String(groupName ?? ""), 20);
    const n = checkName(String(name ?? ""), 10);
    if (!g.ok || !n.ok) return c.json({ error: "bad_name" }, 400);
    return c.json(await createGroup(c.env.DB, g.name, n.name));
  });

  app.post("/groups/join", async (c) => {
    const { groupId, name } = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const n = checkName(String(name ?? ""), 10);
    if (typeof groupId !== "string" || !n.ok) return c.json({ error: "bad_request" }, 400);
    const r = await joinGroup(c.env.DB, groupId, n.name);
    return r.ok ? c.json(r) : c.json(r, r.reason === "no_group" ? 404 : 409);
  });

  // グループの全体（メンバーと「行った」）を返す。つながったとき・画面に戻ったときに取り直す
  app.post("/groups/state", async (c) => {
    const { groupId } = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    if (typeof groupId !== "string") return c.json({ error: "bad_request" }, 400);
    const [group, members, visits] = await c.env.DB.batch([
      c.env.DB.prepare("SELECT name FROM groups WHERE id = ?").bind(groupId),
      c.env.DB.prepare("SELECT id, name FROM members WHERE group_id = ? ORDER BY id").bind(groupId),
      c.env.DB.prepare(
        "SELECT v.member_id AS memberId, v.pref FROM visits v JOIN members m ON m.id = v.member_id WHERE m.group_id = ?",
      ).bind(groupId),
    ]);
    if (group.results.length === 0) return c.json({ error: "not_found" }, 404);
    return c.json({ group: group.results[0], members: members.results, visits: visits.results });
  });

  app.get("/me", (c) => {
    const user = c.get("user");
    return c.json({ uid: user.uid, emailVerified: user.emailVerified });
  });

  // 知らない API は JSON で 404（画面が「いまは使えない」などを出し分けやすいように）
  app.notFound((c) => c.json({ error: "not_found" }, 404));
  app.onError((_e, c) => c.json({ error: "internal" }, 500));

  return app;
}
