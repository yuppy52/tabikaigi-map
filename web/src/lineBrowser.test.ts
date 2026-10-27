// LINE のアプリ内ブラウザから外部ブラウザへ移す計算のテスト（screens の「画面のルール」、auth-flow の「LINE のアプリ内ブラウザ」）。
// LINE の中で付いていなければ足す、付いていれば何もしない、LINE 以外では何もしない、ほかのクエリと # が残るかを確かめる
import { describe, expect, it } from "vitest";
import { externalBrowserUrl, isLineInAppBrowser, reopenOnce } from "./lineBrowser";

// 名乗り（User-Agent）の見本
const LINE_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.16.0";
const LINE_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36 Line/14.16.1/IAB";
const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36";
const X_IN_APP =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Twitter for iPhone/10.60";

const G = "https://tabikaigi-map.com/g/abcdefghijABCDEFGHIJ01";

describe("isLineInAppBrowser：LINE のアプリ内ブラウザか", () => {
  it("iPhone と Android の LINE は LINE とみなす", () => {
    expect(isLineInAppBrowser(LINE_IOS)).toBe(true);
    expect(isLineInAppBrowser(LINE_ANDROID)).toBe(true);
  });

  it("iPhone の Safari、Android の Chrome、X のアプリ内は LINE とみなさない", () => {
    expect(isLineInAppBrowser(IPHONE_SAFARI)).toBe(false);
    expect(isLineInAppBrowser(ANDROID_CHROME)).toBe(false);
    expect(isLineInAppBrowser(X_IN_APP)).toBe(false);
  });

  it("「 Line/」と形が違うもの（小文字、大文字、前に空白がない、/ がない）は LINE とみなさない", () => {
    expect(isLineInAppBrowser("Mozilla/5.0 Safari line/14.16.0")).toBe(false);
    expect(isLineInAppBrowser("Mozilla/5.0 Safari LINE/14.16.0")).toBe(false);
    expect(isLineInAppBrowser("Mozilla/5.0 SafariLine/14.16.0")).toBe(false);
    expect(isLineInAppBrowser("Mozilla/5.0 Safari Line 14.16.0")).toBe(false);
    expect(isLineInAppBrowser("")).toBe(false);
  });
});

describe("externalBrowserUrl：開き直す先の URL", () => {
  it("LINE の中で付いていなければ、?openExternalBrowser=1 を足す", () => {
    expect(externalBrowserUrl(G, LINE_IOS)).toBe(`${G}?openExternalBrowser=1`);
    expect(externalBrowserUrl(G, LINE_ANDROID)).toBe(`${G}?openExternalBrowser=1`);
  });

  it("グループの画面のほか、アプリの画面すべて（/new・/login など）で足す", () => {
    expect(externalBrowserUrl("https://tabikaigi-map.com/new", LINE_IOS)).toBe("https://tabikaigi-map.com/new?openExternalBrowser=1");
    expect(externalBrowserUrl("https://tabikaigi-map.com/login", LINE_IOS)).toBe("https://tabikaigi-map.com/login?openExternalBrowser=1");
  });

  it("もう付いていれば何もしない（外に出られなかった LINE なので、くり返さない）", () => {
    expect(externalBrowserUrl(`${G}?openExternalBrowser=1`, LINE_IOS)).toBeNull();
    expect(externalBrowserUrl(`${G}?a=b&openExternalBrowser=1#x`, LINE_ANDROID)).toBeNull();
    expect(externalBrowserUrl(`${G}?openExternalBrowser=1&a=b`, LINE_ANDROID)).toBeNull();
  });

  it("ほかのクエリと # は、そのまま残して後ろに足す", () => {
    expect(externalBrowserUrl(`${G}?a=1&b=x%20y`, LINE_IOS)).toBe(`${G}?a=1&b=x%20y&openExternalBrowser=1`);
    expect(externalBrowserUrl(`${G}#part`, LINE_IOS)).toBe(`${G}?openExternalBrowser=1#part`);
    expect(externalBrowserUrl(`${G}?a=1#part`, LINE_IOS)).toBe(`${G}?a=1&openExternalBrowser=1#part`);
  });

  it("中身のない ? だけのときは、? を重ねない", () => {
    expect(externalBrowserUrl(`${G}?`, LINE_IOS)).toBe(`${G}?openExternalBrowser=1`);
  });

  it("値が 1 でないとき（openExternalBrowser=0 など）は付いていないとみなして足す", () => {
    expect(externalBrowserUrl(`${G}?openExternalBrowser=0`, LINE_IOS)).toBe(`${G}?openExternalBrowser=0&openExternalBrowser=1`);
  });

  it("LINE 以外（iPhone の Safari、Android の Chrome、X のアプリ内）では、付いていなくても何もしない", () => {
    expect(externalBrowserUrl(G, IPHONE_SAFARI)).toBeNull();
    expect(externalBrowserUrl(G, ANDROID_CHROME)).toBeNull();
    expect(externalBrowserUrl(G, X_IN_APP)).toBeNull();
    expect(externalBrowserUrl(G, "Mozilla/5.0 Safari line/14.16.0")).toBeNull();
  });
});

describe("externalBrowserUrl：行き先とくり返し", () => {
  const inputs = [
    G,
    `${G}?openExternalBrowser=0`,
    `${G}?openExternalBrowser=1%20`,
    `${G}#?openExternalBrowser=1`,
    "https://tabikaigi-map.com//evil.example/",
    "https://tabikaigi-map.com/g//evil.example",
    "https://tabikaigi-map.com/%2F%2Fevil.example",
  ];

  it("行き先は、いつも開いた URL と同じサイト（よそのサイトへ飛ばない）", () => {
    for (const href of inputs) {
      const out = externalBrowserUrl(href, LINE_IOS);
      expect(out).not.toBeNull();
      expect(new URL(out as string).origin).toBe(new URL(href).origin);
    }
  });

  it("出した URL をもう一度入れると、何もしない（2回目は開き直さない）", () => {
    for (const href of inputs) {
      expect(externalBrowserUrl(externalBrowserUrl(href, LINE_IOS) as string, LINE_IOS)).toBeNull();
    }
  });

  it("名前を % で書き換えても、付いているとみなす（読むときに戻すため）", () => {
    expect(externalBrowserUrl(`${G}?openExternal%42rowser=1`, LINE_IOS)).toBeNull();
  });

  it("このタブでもう開き直していれば、引数がなくても何もしない", () => {
    expect(externalBrowserUrl(G, LINE_IOS, true)).toBeNull();
  });
});

describe("reopenOnce：開き直しはタブで1回だけ", () => {
  function memory(): Pick<Storage, "getItem" | "setItem"> {
    const m = new Map<string, string>();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
  }

  it("1回目は開き直し、引数が落ちた URL で戻ってきても2回目は開き直さない", () => {
    const s = memory();
    expect(reopenOnce(G, LINE_IOS, s)).toBe(`${G}?openExternalBrowser=1`);
    expect(reopenOnce(G, LINE_IOS, s)).toBeNull();
  });

  it("印が読めない・書けないときは、開き直さない", () => {
    const broken = (which: "get" | "set"): Pick<Storage, "getItem" | "setItem"> => ({
      getItem: () => {
        if (which === "get") throw new Error("denied");
        return null;
      },
      setItem: () => {
        if (which === "set") throw new Error("denied");
      },
    });
    expect(reopenOnce(G, LINE_IOS, broken("get"))).toBeNull();
    expect(reopenOnce(G, LINE_IOS, broken("set"))).toBeNull();
  });

  it("LINE 以外では、印も書かない", () => {
    const s = memory();
    expect(reopenOnce(G, IPHONE_SAFARI, s)).toBeNull();
    expect(s.getItem("tabikaigi-line-reopen")).toBeNull();
  });
});
