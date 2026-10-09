// Worker の入口。/api/* だけがここに来る（wrangler.jsonc の run_worker_first）
import { createApp } from "./app";
import { googleKeyProvider } from "./firebase-auth";

export { GroupRoom } from "./room";

const app = createApp(googleKeyProvider);

// 部屋への WebSocket：/api/rooms/<roomKey>/ws（グループIDそのものは URL に入れない）
const ROOM_PATH = /^\/api\/rooms\/([0-9a-f]{64})\/ws$/;

export default {
  fetch(request, env, ctx) {
    const url = new URL(request.url);
    const room = ROOM_PATH.exec(url.pathname);
    if (room) {
      // Hono を通さずに、部屋にそのまま渡す（WebSocket の切り替えの応答を返すため）
      return env.GROUP_ROOM.get(env.GROUP_ROOM.idFromName(room[1])).fetch(request);
    }
    if (url.pathname.startsWith("/api/")) return app.fetch(request, env, ctx);
    // ここに来たら「静的なファイルとして返るはずのものが Worker を通った」印（試作の確認用）
    return new Response("REACHED_WORKER", { status: 418 });
  },
} satisfies ExportedHandler<Env>;
