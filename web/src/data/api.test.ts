// API を呼ぶところのテスト。状態コードと本文が、成功か失敗の種類（通信エラー、いまは使えない、429、断った理由）に
// 正しく分かれるか（screens の「API の応答と画面の動き」「知らせ」）と、要求に目印のヘッダーと JSON を付けるかを、fetch を差し替えて確かめる
import { describe, expect, it } from "vitest";
import { ApiError, callApi, failureOf, interpretResponse, type Fetch } from "./api";

describe("interpretResponse：応答を成功か失敗の種類にする", () => {
  it("2xx の JSON は成功で、本文をそのまま返す", () => {
    expect(interpretResponse(201, '{"memberId":3}')).toEqual({ ok: true, status: 201, body: { memberId: 3 } });
  });

  it("断った応答は、状態コードと error の値と、本文の残り（name_taken の memberId など）", () => {
    expect(interpretResponse(409, '{"error":"name_taken","memberId":2,"linked":false}')).toEqual({
      ok: false,
      failure: { kind: "refused", status: 409, error: "name_taken", body: { error: "name_taken", memberId: 2, linked: false } },
    });
    expect(interpretResponse(404, '{"error":"group_not_found"}')).toMatchObject({
      failure: { kind: "refused", status: 404, error: "group_not_found" },
    });
  });

  it("error がない・文字でない・本文がオブジェクトでないときは、error を空にする（表にない値）", () => {
    expect(interpretResponse(400, "{}")).toMatchObject({ failure: { kind: "refused", status: 400, error: "" } });
    expect(interpretResponse(400, '{"error":1}')).toMatchObject({ failure: { kind: "refused", status: 400, error: "" } });
    expect(interpretResponse(500, "[]")).toMatchObject({ failure: { kind: "refused", status: 500, error: "", body: {} } });
  });

  it("503 は reason で分ける：quota は枠切れ、temporary とそれ以外は一時的な失敗", () => {
    expect(interpretResponse(503, '{"error":"unavailable","reason":"quota"}')).toEqual({
      ok: false,
      failure: { kind: "unavailable", reason: "quota" },
    });
    expect(interpretResponse(503, '{"error":"unavailable","reason":"temporary"}')).toEqual({
      ok: false,
      failure: { kind: "unavailable", reason: "temporary" },
    });
    expect(interpretResponse(503, '{"error":"unavailable"}')).toEqual({ ok: false, failure: { kind: "unavailable", reason: "temporary" } });
  });

  it("エラーの状態コードで JSON でない応答（Cloudflare のエラー画面）は、枠切れとみなす", () => {
    for (const status of [500, 502, 503, 404]) {
      expect(interpretResponse(status, "<html>error</html>")).toEqual({ ok: false, failure: { kind: "unavailable", reason: "quota" } });
    }
  });

  it("成功の状態コードなのに JSON でない応答（配信の設定の誤り）は、枠切れにせず表にない値（bad_response）にする", () => {
    for (const text of ["<html>app</html>", ""]) {
      expect(interpretResponse(200, text)).toEqual({
        ok: false,
        failure: { kind: "refused", status: 200, error: "bad_response", body: {} },
      });
    }
  });

  it("429 は、JSON でも JSON でなくても 429 として扱う（枠切れにしない）", () => {
    expect(interpretResponse(429, "<html>rate limited</html>")).toEqual({ ok: false, failure: { kind: "rate_limited" } });
    expect(interpretResponse(429, '{"error":"x"}')).toEqual({ ok: false, failure: { kind: "rate_limited" } });
  });
});

// 呼ばれた要求を残し、決まった応答を返す fetch
function fakeFetch(status: number, text: string) {
  const calls: { input: string; init: RequestInit }[] = [];
  const fn: Fetch = (input, init) => {
    calls.push({ input, init });
    return Promise.resolve(new Response(text, { status }));
  };
  return { fn, calls };
}

describe("callApi：API を1回呼ぶ", () => {
  it("本文がなければ、目印のヘッダーだけを付け、Content-Type と Authorization は付けない", async () => {
    const { fn, calls } = fakeFetch(200, '{"ok":true}');
    expect(await callApi("PUT", "/api/groups/x/members/1/visits/13", undefined, fn)).toEqual({ ok: true, status: 200, body: { ok: true } });
    expect(calls).toHaveLength(1);
    expect(calls[0].input).toBe("/api/groups/x/members/1/visits/13");
    expect(calls[0].init.method).toBe("PUT");
    expect(calls[0].init.headers).toEqual({ "X-Tabikaigi": "1" });
    expect(calls[0].init.body).toBeUndefined();
  });

  it("本文があれば、JSON にして Content-Type: application/json を付ける", async () => {
    const { fn, calls } = fakeFetch(201, '{"memberId":4}');
    await callApi("POST", "/api/groups/x/members", { name: "さくら", turnstileToken: "t" }, fn);
    expect(calls[0].init.headers).toEqual({ "X-Tabikaigi": "1", "Content-Type": "application/json" });
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ name: "さくら", turnstileToken: "t" });
  });

  it("fetch が失敗したら通信エラー", async () => {
    const fn: Fetch = () => Promise.reject(new TypeError("Failed to fetch"));
    expect(await callApi("GET", "/api/groups/x", undefined, fn)).toEqual({ ok: false, failure: { kind: "network" } });
  });

  it("本文を読み切れなかったら通信エラー", async () => {
    const res = new Response("{}", { status: 200 });
    res.text = () => Promise.reject(new TypeError("network error"));
    const fn: Fetch = () => Promise.resolve(res);
    expect(await callApi("GET", "/api/groups/x", undefined, fn)).toEqual({ ok: false, failure: { kind: "network" } });
  });

  it("断った応答・503・429・JSON でない応答は、interpretResponse と同じに分ける", async () => {
    expect(await callApi("GET", "/", undefined, fakeFetch(404, '{"error":"group_not_found"}').fn)).toMatchObject({
      failure: { kind: "refused", status: 404, error: "group_not_found" },
    });
    expect(await callApi("GET", "/", undefined, fakeFetch(503, '{"error":"unavailable","reason":"quota"}').fn)).toEqual({
      ok: false,
      failure: { kind: "unavailable", reason: "quota" },
    });
    expect(await callApi("GET", "/", undefined, fakeFetch(429, "slow down").fn)).toEqual({ ok: false, failure: { kind: "rate_limited" } });
    expect(await callApi("GET", "/", undefined, fakeFetch(502, "<html>").fn)).toEqual({
      ok: false,
      failure: { kind: "unavailable", reason: "quota" },
    });
  });
});

describe("failureOf：受けた失敗を失敗の種類にする", () => {
  it("ApiError なら、その中身", () => {
    expect(failureOf(new ApiError({ kind: "network" }))).toEqual({ kind: "network" });
  });

  it("ApiError でないもの（プログラムの間違い）は、表にない値", () => {
    expect(failureOf(new TypeError("x"))).toEqual({ kind: "refused", status: 0, error: "", body: {} });
    expect(failureOf("x")).toEqual({ kind: "refused", status: 0, error: "", body: {} });
  });
});
