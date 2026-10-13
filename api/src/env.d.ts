// wrangler.jsonc に書かない秘密の値（`wrangler secret put` で入れる）。ローカルでは .dev.vars に置く（リポジトリには入れない）
interface Env {
  /** Turnstile の秘密の鍵 */
  TURNSTILE_SECRET?: string;
}
