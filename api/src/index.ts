// Worker の入口。/api/* だけがここに来る（画面の配信と部屋は Phase 2 で足す）
import { createApp } from "./app";
import { googleKeyProvider } from "./firebase-auth";
import { cloudflareTurnstile } from "./turnstile";

// 本番では、Google の公開鍵と Cloudflare の Turnstile を使う
export default createApp({ getKey: googleKeyProvider, verifyTurnstile: cloudflareTurnstile });
