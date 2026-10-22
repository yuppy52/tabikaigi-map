// 開発中の Vite で、アプリの URL を app.html に書き換える計算のテスト（vite.config.ts のプラグイン）。
// 本物の web/public/_redirects も読み、本番と同じ URL が書き換わるかを確かめる（screens の「トップと URL」）
import { describe, expect, it } from "vitest";
import { parseRedirects, rewriteToApp } from "./redirects";
// ?raw はファイルの中身を文字のまま読む（Vite の決まり。画面の型の設定には node の型がないので、node:fs は使わない）
import redirectsText from "../../public/_redirects?raw";

describe("parseRedirects：_redirects の行を読む", () => {
  it("空の行と # の行を飛ばし、200 の行だけを取る。* で終わる行は頭が合えばよい", () => {
    const text = ["# 説明", "", "/g/* /app 200", "/new  /app   200", "/old /new 301", "/bad /app"].join("\n");
    expect(parseRedirects(text)).toEqual([
      { from: "/g/", prefix: true, to: "/app" },
      { from: "/new", prefix: false, to: "/app" },
    ]);
  });

  it("Windows の改行（\\r\\n）でも読める", () => {
    expect(parseRedirects("/me /app 200\r\n/login /app 200\r\n")).toEqual([
      { from: "/me", prefix: false, to: "/app" },
      { from: "/login", prefix: false, to: "/app" },
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
    for (const url of ["/g/abcdefghijABCDEFGHIJ01", "/new", "/account", "/login", "/groups", "/me", "/contact"]) {
      expect(rewriteToApp(url, rules)).toBe("/app.html");
    }
  });

  it("素の HTML のページ（トップ、使い方、プライバシーポリシー）は書き換えない", () => {
    for (const url of ["/", "/guide", "/privacy"]) expect(rewriteToApp(url, rules)).toBeNull();
  });
});
