// Worker の入口。/api/* だけがここに来る（wrangler.jsonc の run_worker_first）
import { createApp, type Env } from "./app";
import { googleKeyProvider } from "./firebase-auth";

const app = createApp(googleKeyProvider);

export default {
  fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return app.fetch(request, env, ctx);
    // ここに来たら「静的なファイルとして返るはずのものが Worker を通った」印（試作の確認用）
    return new Response("REACHED_WORKER", { status: 418 });
  },
} satisfies ExportedHandler<Env>;
