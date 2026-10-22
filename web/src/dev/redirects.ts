// 開発中の Vite（5173 番）で、アプリの URL（/g/… など）でも app.html を出すための計算（vite.config.ts のプラグインが使う）。
// URL の一覧は web/public/_redirects が正本なので、ここには書かずに、そのファイルを読んで同じ決まりで書き換える。
// 本番の Cloudflare では _redirects そのものが効くので、この計算は開発中だけ使う

export type RewriteRule = {
  // 合う URL の頭（`*` で終わる行は、その前までの頭が合えばよい）
  from: string;
  // `*` で終わる行か
  prefix: boolean;
  to: string;
};

// _redirects の中身から、200（URL を変えずに中身だけ差し替える）の行を取り出す。
// 空の行と # で始まる行は飛ばす。200 でない行（移す 301・302 など）は、開発中は扱わない
export function parseRedirects(text: string): RewriteRule[] {
  const rules: RewriteRule[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const [from, to, status] = line.split(/\s+/);
    if (!from || !to || status !== "200") continue;
    const prefix = from.endsWith("*");
    rules.push({ from: prefix ? from.slice(0, -1) : from, prefix, to });
  }
  return rules;
}

// 要求の URL（パスとクエリ）が、行き先 /app の行に合えば、/app.html に書き換えた URL を返す（クエリは残す）。合わなければ null。
// /app にしているのは Cloudflare が /app.html を /app に移すためで（_redirects の頭の説明）、開発中の Vite が配るファイルは /app.html
export function rewriteToApp(url: string, rules: readonly RewriteRule[]): string | null {
  const q = url.indexOf("?");
  const path = q < 0 ? url : url.slice(0, q);
  const query = q < 0 ? "" : url.slice(q);
  const hit = rules.some((r) => r.to === "/app" && (r.prefix ? path.startsWith(r.from) : path === r.from));
  return hit ? `/app.html${query}` : null;
}
