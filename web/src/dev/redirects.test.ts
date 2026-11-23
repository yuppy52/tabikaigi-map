// 開発中の Vite で、アプリの URL を app.html に書き換える計算のテスト（vite.config.ts のプラグイン）。
// 本物の web/public/_redirects も読み、本番と同じ URL が書き換わるかを確かめる（screens の「トップと URL」）
import { describe, expect, it } from "vitest";
import { parseRedirects, rewriteToApp } from "./redirects";
// ?raw はファイルの中身を文字のまま読む（Vite の決まり。画面の型の設定には node の型がないので、node:fs は使わない）
import redirectsText from "../../public/_redirects?raw";
import headersText from "../../public/_headers?raw";

describe("parseRedirects：_redirects の行を読む", () => {
  it("空の行と # の行を飛ばし、200 の行だけを取る。* で終わる行は頭が合えばよい", () => {
    const text = ["# 説明", "", "/g/* /app 200", "/new  /app   200", "/old /new 301", "/bad /app"].join("\n");
    expect(parseRedirects(text)).toEqual([
      { from: "/g/", prefix: true, to: "/app" },
      { from: "/new", prefix: false, to: "/app" },
    ]);
  });

  it("Windows の改行（\\r\\n）でも読める", () => {
    expect(parseRedirects("/new /app 200\r\n/x /app 200\r\n")).toEqual([
      { from: "/new", prefix: false, to: "/app" },
      { from: "/x", prefix: false, to: "/app" },
    ]);
  });
});

describe("rewriteToApp：/app.html に書き換えるか", () => {
  const rules = parseRedirects("/g/* /app 200\n/new /app 200\n/x /other 200");

  it("* の行は、その頭で始まる URL を書き換える（/g/ だけや、形の違う ID も）", () => {
    expect(rewriteToApp("/g/abcdefghijABCDEFGHIJ01", rules)).toBe("/app.html");
    expect(rewriteToApp("/g/", rules)).toBe("/app.html");
    expect(rewriteToApp("/g/abc/def", rules)).toBe("/app.html");
  });

  it("クエリは残す", () => {
    expect(rewriteToApp("/g/abcdefghijABCDEFGHIJ01?openExternalBrowser=1", rules)).toBe("/app.html?openExternalBrowser=1");
  });

  it("* のない行は、ちょうど同じ URL だけ", () => {
    expect(rewriteToApp("/new", rules)).toBe("/app.html");
    expect(rewriteToApp("/new/", rules)).toBeNull();
    expect(rewriteToApp("/newer", rules)).toBeNull();
  });

  it("合わない URL（画面のファイル、/g の頭が違うもの）と、行き先が /app でない行は書き換えない", () => {
    expect(rewriteToApp("/src/main.tsx", rules)).toBeNull();
    expect(rewriteToApp("/@vite/client", rules)).toBeNull();
    expect(rewriteToApp("/gx/abc", rules)).toBeNull();
    expect(rewriteToApp("/x", rules)).toBeNull();
    expect(rewriteToApp("/", rules)).toBeNull();
  });
});

describe("本物の web/public/_redirects", () => {
  const rules = parseRedirects(redirectsText);

  it("screens の「トップと URL」のアプリの URL が、どれも app.html になる", () => {
    for (const url of ["/g/abcdefghijABCDEFGHIJ01", "/new"]) {
      expect(rewriteToApp(url, rules)).toBe("/app.html");
    }
  });

  it("素の HTML のページ（トップ、使い方、プライバシーポリシー）は書き換えない", () => {
    for (const url of ["/", "/guide", "/privacy"]) expect(rewriteToApp(url, rules)).toBeNull();
  });

  it("ログインをやめて消した URL（/account・/login・/groups・/me）は書き換えない（404.html になる：ADR 0013）", () => {
    for (const url of ["/account", "/login", "/groups", "/me"]) expect(rewriteToApp(url, rules)).toBeNull();
  });

  it("問い合わせのフォームをやめて消した /contact は書き換えない（404.html になる：ADR 0014）", () => {
    expect(rewriteToApp("/contact", rules)).toBeNull();
  });
});

// _headers の「パスの行 → その下の字下げした行（ヘッダー）」を読む。このテストのためだけの簡単な読み方
function parseHeaders(text: string): Map<string, string[]> {
  const byPath = new Map<string, string[]>();
  let current: string[] | null = null;
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    if (/^\s/.test(line)) current?.push(line.trim().toLowerCase());
    else byPath.set(line.trim(), (current = []));
  }
  return byPath;
}

describe("本物の web/public/_headers", () => {
  const headers = parseHeaders(headersText);

  // app.html を返すパスすべてに、noindex と no-referrer を付ける（NFR-019・NFR-005）。
  // _redirects と _headers は手でそろえるので、片方だけ足したときにここで落とす（ADR 0011 の「足すときは両方に」）
  it("_redirects で app.html を返すパスと /app・/app.html に、noindex と no-referrer が付いている", () => {
    const paths = parseRedirects(redirectsText).map((r) => (r.prefix ? `${r.from}*` : r.from));
    for (const path of [...paths, "/app", "/app.html"]) {
      const lines = headers.get(path);
      expect(lines, path).toBeDefined();
      expect(lines, path).toContain("x-robots-tag: noindex");
      expect(lines, path).toContain("referrer-policy: no-referrer");
    }
  });
});
