// Turnstile を Cloudflare に聞く関数（cloudflareTurnstile）のテスト（Q-031、api の「Turnstile」）。
// Cloudflare には実際に聞かず、fetch を差し替えて、応答ごとに「通す・断る（403）・使えない（503）」を確かめる
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { cloudflareTurnstile, TurnstileUnavailableError } from "../src/turnstile";

const TOKEN = "the-token-xyz";
const SECRET = "test-secret";

/** 確かめに使う設定。既定は本番と同じ名前（tabikaigi-map.com）を期待する */
function makeEnv(over: Partial<Env> = {}): Env {
  return { TURNSTILE_SECRET: SECRET, TURNSTILE_HOSTNAME: "tabikaigi-map.com", ...over } as Env;
}

/** fetch を差し替え、決まった応答を返す。呼ばれたときの引数はあとで見る（後片付けは afterEach） */
function stubFetch(res: Response | (() => Promise<Response>)) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async () => (typeof res === "function" ? res() : res));
}

/** siteverify の JSON の応答 */
function siteverify(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** ログ（console.error）を見張る。テストの出力は汚さない */
let errorLog: MockInstance<typeof console.error>;
beforeEach(() => {
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** ログに、券・hostname の値・秘密の鍵が入っていないこと */
function expectLogHasNoSecrets() {
  const text = JSON.stringify(errorLog.mock.calls);
  for (const leak of [TOKEN, SECRET, "tabikaigi-map.com", "example.com"]) expect(text).not.toContain(leak);
}

describe("cloudflareTurnstile：設定がないときは通さない（503）", () => {
  it("秘密の鍵がない・空 → TurnstileUnavailableError（Cloudflare には聞かない）", async () => {
    const fetchMock = stubFetch(siteverify({ success: true, hostname: "tabikaigi-map.com" }));
    await expect(cloudflareTurnstile(TOKEN, makeEnv({ TURNSTILE_SECRET: undefined }))).rejects.toBeInstanceOf(TurnstileUnavailableError);
    await expect(cloudflareTurnstile(TOKEN, makeEnv({ TURNSTILE_SECRET: "" }))).rejects.toBeInstanceOf(TurnstileUnavailableError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("TURNSTILE_HOSTNAME がない・空 → TurnstileUnavailableError（Cloudflare には聞かない）", async () => {
    const fetchMock = stubFetch(siteverify({ success: true, hostname: "tabikaigi-map.com" }));
    const missing = makeEnv();
    delete (missing as Partial<Env>).TURNSTILE_HOSTNAME;
    await expect(cloudflareTurnstile(TOKEN, missing)).rejects.toBeInstanceOf(TurnstileUnavailableError);
    await expect(cloudflareTurnstile(TOKEN, makeEnv({ TURNSTILE_HOSTNAME: "" }))).rejects.toBeInstanceOf(TurnstileUnavailableError);
    expect(fetchMock).not.toHaveBeenCalled();
    expectLogHasNoSecrets();
  });
});

describe("cloudflareTurnstile：応答の中身で通す・断る", () => {
  it("success が true で hostname が一致 → true（通るべき券が通る）", async () => {
    stubFetch(siteverify({ success: true, hostname: "tabikaigi-map.com", "error-codes": [] }));
    expect(await cloudflareTurnstile(TOKEN, makeEnv())).toBe(true);
    expect(errorLog).not.toHaveBeenCalled();
  });

  it("手元の設定（example.com）で試験用の鍵の応答 → true", async () => {
    stubFetch(siteverify({ success: true, hostname: "example.com", "error-codes": [] }));
    expect(await cloudflareTurnstile(TOKEN, makeEnv({ TURNSTILE_HOSTNAME: "example.com" }))).toBe(true);
  });

  it("success が true でも hostname が違う（試験用の鍵の example.com）→ false、ログは固定の文だけ", async () => {
    stubFetch(siteverify({ success: true, hostname: "example.com", "error-codes": [] }));
    expect(await cloudflareTurnstile(TOKEN, makeEnv())).toBe(false);
    expect(errorLog.mock.calls).toEqual([["turnstile: hostname mismatch"]]);
    expectLogHasNoSecrets();
  });

  it.each([
    ["evil.tabikaigi-map.com"],
    ["tabikaigi-map.com.evil.example"],
    ["TABIKAIGI-MAP.COM"],
    ["tabikaigi-map.com."],
    ["tabikaigi-map.com:443"],
    [["tabikaigi-map.com"]],
    [null],
    [undefined],
  ])("hostname が %j → false（完全に一致する文字だけ通す）", async (hostname) => {
    stubFetch(siteverify({ success: true, hostname }));
    expect(await cloudflareTurnstile(TOKEN, makeEnv())).toBe(false);
  });

  it.each(["timeout-or-duplicate", "invalid-input-response"])(
    "success が false（%s）→ false（利用者の券の失敗は 403 のまま）",
    async (code) => {
      stubFetch(siteverify({ success: false, hostname: "tabikaigi-map.com", "error-codes": [code] }));
      expect(await cloudflareTurnstile(TOKEN, makeEnv())).toBe(false);
    },
  );

  it.each([[undefined], ["invalid-input-secret"], [{ 0: "internal-error" }]])(
    "success が false で error-codes が配列でない・ない（%j）→ false",
    async (codes) => {
      stubFetch(siteverify({ success: false, "error-codes": codes }));
      expect(await cloudflareTurnstile(TOKEN, makeEnv())).toBe(false);
    },
  );

  it.each([["true"], [1]])("success が %j → false（true そのものだけ通す）", async (success) => {
    stubFetch(siteverify({ success, hostname: "tabikaigi-map.com" }));
    expect(await cloudflareTurnstile(TOKEN, makeEnv())).toBe(false);
  });
});

describe("cloudflareTurnstile：運営者の側・Cloudflare の側の失敗は通さない（503）", () => {
  it.each(["invalid-input-secret", "missing-input-secret", "internal-error"])(
    "success が false で error-codes に %s → TurnstileUnavailableError、ログに理由だけ",
    async (code) => {
      stubFetch(siteverify({ success: false, hostname: "tabikaigi-map.com", "error-codes": ["bad-request", code] }));
      await expect(cloudflareTurnstile(TOKEN, makeEnv())).rejects.toBeInstanceOf(TurnstileUnavailableError);
      expect(errorLog.mock.calls).toEqual([[`turnstile: unavailable (${code})`]]);
      expectLogHasNoSecrets();
    },
  );

  it("siteverify が 500 → TurnstileUnavailableError", async () => {
    stubFetch(siteverify({ success: true, hostname: "tabikaigi-map.com" }, 500));
    await expect(cloudflareTurnstile(TOKEN, makeEnv())).rejects.toBeInstanceOf(TurnstileUnavailableError);
    expectLogHasNoSecrets();
  });

  it.each([
    ["通信の失敗", new TypeError("network")],
    ["時間切れ", new DOMException("timed out", "TimeoutError")],
  ])("fetch が投げる（%s）→ TurnstileUnavailableError", async (_label, err) => {
    stubFetch(() => Promise.reject(err));
    await expect(cloudflareTurnstile(TOKEN, makeEnv())).rejects.toBeInstanceOf(TurnstileUnavailableError);
    expectLogHasNoSecrets();
  });

  it.each([
    ["JSON でない", () => new Response("<html>bad gateway</html>", { status: 200 })],
    ["JSON の null", () => siteverify(null)],
  ])("応答が %s → TurnstileUnavailableError", async (_label, makeRes) => {
    stubFetch(makeRes());
    await expect(cloudflareTurnstile(TOKEN, makeEnv())).rejects.toBeInstanceOf(TurnstileUnavailableError);
  });

  it("5秒で切る：fetch に AbortSignal が渡っている（実際には待たない）", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const fetchMock = stubFetch(siteverify({ success: true, hostname: "tabikaigi-map.com" }));
    await cloudflareTurnstile(TOKEN, makeEnv());
    expect(timeout).toHaveBeenCalledWith(5000);
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.signal).toBe(timeout.mock.results[0]?.value);
  });
});

describe("cloudflareTurnstile：送るもの", () => {
  it("siteverify に秘密の鍵と券だけを送り、利用者の IP（remoteip）は送らない", async () => {
    const fetchMock = stubFetch(siteverify({ success: true, hostname: "tabikaigi-map.com" }));
    await cloudflareTurnstile(TOKEN, makeEnv());
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(init?.method).toBe("POST");
    const form = init?.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect([...form.keys()].sort()).toEqual(["response", "secret"]);
    expect(form.get("secret")).toBe(SECRET);
    expect(form.get("response")).toBe(TOKEN);
    expect(form.has("remoteip")).toBe(false);
  });
});
