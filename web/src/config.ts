// 画面のコードに置く設定（公開してよい値だけ。秘密の鍵はここに置かない）

// ボット対策（Turnstile）のサイトキー（api の「Turnstile」）。サイトキーは公開してよい鍵なのでコードに書く。
// いまは Cloudflare の試験用の鍵（いつも通る、見える形のもの）。本番の鍵は、最初のデプロイの前に運営者が
// Cloudflare の管理画面でウィジェットを作って差し替える（秘密の鍵は API の側に wrangler secret put TURNSTILE_SECRET で入れる）
export const TURNSTILE_SITE_KEY = "1x00000000000000000000AA";
