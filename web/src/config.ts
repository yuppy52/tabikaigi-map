// 画面のコードに置く設定（公開してよい値だけ。秘密の鍵はここに置かない）

// ボット対策（Turnstile）のサイトキー（api の「Turnstile」）。サイトキーは公開してよい鍵なのでコードに書く。
// 手元（Vite の dev）では必ず Cloudflare の試験用の鍵（いつも通る、見える形のもの）を使い、
// npm run build（本番）では本番の鍵を使う。本番のウィジェットに localhost を足さない（手元は試験用の鍵で足りる）。
// 秘密の鍵は API の側に wrangler secret put TURNSTILE_SECRET で入れる
const TEST_SITE_KEY = "1x00000000000000000000AA";
// 本番のウィジェット（使えるサイトは tabikaigi-map.com だけ）の公開してよい鍵。2026-11-27 に作った（deploy の「最初のデプロイ」の 3）
const PRODUCTION_SITE_KEY = "0x4AAAAAAGVuRBGgwGui7szI";
export const TURNSTILE_SITE_KEY = import.meta.env.PROD ? PRODUCTION_SITE_KEY : TEST_SITE_KEY;
