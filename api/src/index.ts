// Worker の入口。/api/* だけがここに来る（画面は Worker を通さずに配る：wrangler.jsonc の run_worker_first）
import { createApp } from "./app";
import { googleKeyProvider } from "./firebase-auth";
import { connectRoom, ROOM_PREFIX } from "./room-entry";
import { cloudflareTurnstile } from "./turnstile";

// 部屋（Durable Object）のクラス。wrangler.jsonc の durable_objects から、この名前で探される
export { GroupRoom } from "./room";

// 本番では、Google の公開鍵と Cloudflare の Turnstile を使う
const app = createApp({ getKey: googleKeyProvider, verifyTurnstile: cloudflareTurnstile });

export default {
  fetch(request, env, ctx) {
    // 部屋への WebSocket は Hono を通さずに受ける（目印のヘッダーの代わりに Origin で確かめる：room-entry.ts）
    if (new URL(request.url).pathname.startsWith(ROOM_PREFIX)) return connectRoom(request, env);
    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
