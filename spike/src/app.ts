// API の本体（Hono）。鍵の取り方を外から渡せるようにして、テストで差し替えられるようにしている
import { Hono } from "hono";
import {
  InvalidTokenError,
  KeyUnavailableError,
  verifyFirebaseIdToken,
  type KeyProvider,
  type VerifiedUser,
} from "./firebase-auth";

export type Env = { FIREBASE_PROJECT_ID: string };
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

  app.get("/me", (c) => {
    const user = c.get("user");
    return c.json({ uid: user.uid, emailVerified: user.emailVerified });
  });

  // 知らない API は JSON で 404（画面が「いまは使えない」などを出し分けやすいように）
  app.notFound((c) => c.json({ error: "not_found" }, 404));
  app.onError((_e, c) => c.json({ error: "internal" }, 500));

  return app;
}
