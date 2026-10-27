// 招待URLのカード（OGP）のテスト（architecture の「招待URLのプレビュー（OGP）」）。
// app.html に決めた値のタグがあるか、og:url を書いていないか、配る画像（web/public/ogp.png）が正本（assets/ogp.png）と同じかを確かめる
import { describe, expect, it } from "vitest";
// ?raw はファイルの中身を文字のまま、?inline は画像を base64 の文字にして読む（Vite の決まり。画面の型の設定には node の型がないため）
import appHtml from "../app.html?raw";
import publicPng from "../public/ogp.png?inline";
import assetsPng from "../../assets/ogp.png?inline";

// <meta> の content を、属性（property か name）と名前で取り出す
function metaContent(html: string, attr: "property" | "name", key: string): string | null {
  const re = new RegExp(`<meta\\s+${attr}="${key.replace(/[.:]/g, "\\$&")}"\\s+content="([^"]*)"`);
  return re.exec(html)?.[1] ?? null;
}

describe("app.html の OGP", () => {
  it("決めた値のタグがある", () => {
    expect(metaContent(appHtml, "property", "og:title")).toBe("旅会議マップ");
    expect(metaContent(appHtml, "property", "og:description")).toBe("友達と行った都道府県を塗って、次の旅行先を決めよう");
    expect(metaContent(appHtml, "property", "og:image")).toBe("https://tabikaigi-map.com/ogp.png");
    expect(metaContent(appHtml, "property", "og:type")).toBe("website");
    expect(metaContent(appHtml, "name", "twitter:card")).toBe("summary_large_image");
    expect(metaContent(appHtml, "property", "og:image:width")).toBe("1200");
    expect(metaContent(appHtml, "property", "og:image:height")).toBe("630");
  });

  it("og:url は書かない（グループごとに URL が違うため）", () => {
    expect(appHtml).not.toMatch(/<meta[^>]*"og:url"/);
  });

  it("noindex と no-referrer の meta は残っている", () => {
    expect(metaContent(appHtml, "name", "robots")).toBe("noindex");
    expect(metaContent(appHtml, "name", "referrer")).toBe("no-referrer");
  });
});

describe("OGP の画像", () => {
  it("配る写し（web/public/ogp.png）が正本（assets/ogp.png）と同じ（tools/gen-ogp.mjs が両方に書く）", () => {
    expect(publicPng.startsWith("data:image/png;base64,")).toBe(true);
    expect(publicPng).toBe(assetsPng);
  });
});
