// 保存のところが API を呼ぶ形のテスト。URL・メソッド・本文、応答の形の確かめ、端末にメンバーを覚えるとき・覚えないときを、
// fetch と localStorage を差し替えて確かめる（api の「一覧」、auth-flow の「端末が覚えるもの」）
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, failureOf } from "./api";
import {
  createGroup,
  deleteGroup,
  deleteMember,
  fetchGroup,
  joinGroup,
  leaveGroup,
  parseCreated,
  parseGroupView,
  parseJoined,
  parseRemoved,
  readRememberedMember,
  renameGroup,
  saveVisit,
} from "./store";

const G = "abcdefghijABCDEFGHIJ01";

const VIEW = {
  group: { name: "旅行部", manageBy: "owner", ownerOnly: true },
  members: [
    { id: 12, name: "ゆう", color: 0, isOwner: true, linked: true, isMe: false },
    { id: 13, name: "たろう", color: 1, isOwner: false, linked: false, isMe: false },
  ],
  visits: [
    { memberId: 12, pref: 13 },
    { memberId: 13, pref: 1 },
  ],
};

// 中身を Map に持つ localStorage の代わり
function fakeStorage() {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => void items.set(k, v),
    removeItem: (k: string) => void items.delete(k),
  };
}

let calls: { input: string; init: RequestInit }[];
let storage: ReturnType<typeof fakeStorage>;

// 次の fetch の応答を決める
function respond(status: number, body: unknown) {
  vi.stubGlobal("fetch", (input: string, init: RequestInit) => {
    calls.push({ input, init });
    return Promise.resolve(new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));
  });
}

// 失敗した Promise の失敗の種類
async function failureFrom(p: Promise<unknown>) {
  const e: unknown = await p.then(
    () => null,
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(ApiError);
  return failureOf(e);
}

beforeEach(() => {
  calls = [];
  storage = fakeStorage();
  vi.stubGlobal("localStorage", storage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseGroupView：グループを開いたときの応答を読む", () => {
  it("api の形なら、そのまま返す", () => {
    expect(parseGroupView(VIEW)).toEqual(VIEW);
  });

  it("形が違えば null（グループがない、メンバーの番号が整数でない、県が範囲の外、真偽値が数）", () => {
    expect(parseGroupView(null)).toBeNull();
    expect(parseGroupView({ ...VIEW, group: null })).toBeNull();
    expect(parseGroupView({ ...VIEW, group: { ...VIEW.group, manageBy: "x" } })).toBeNull();
    expect(parseGroupView({ ...VIEW, members: [{ ...VIEW.members[0], id: "12" }] })).toBeNull();
    expect(parseGroupView({ ...VIEW, members: [{ ...VIEW.members[0], linked: 1 }] })).toBeNull();
    expect(parseGroupView({ ...VIEW, visits: [{ memberId: 12, pref: 48 }] })).toBeNull();
    expect(parseGroupView({ ...VIEW, visits: undefined })).toBeNull();
  });
});

describe("parseCreated・parseJoined：作成・参加の応答を読む", () => {
  it("作成：groupId と memberId があれば返す。なければ null", () => {
    expect(parseCreated({ groupId: G, memberId: 1 })).toEqual({ groupId: G, memberId: 1 });
    expect(parseCreated({ groupId: "", memberId: 1 })).toBeNull();
    expect(parseCreated({ groupId: G })).toBeNull();
  });

  it("参加：201 は入れた。409 name_taken は同じ名前の人（番号と紐づいているか）", () => {
    expect(parseJoined({ ok: true, status: 201, body: { memberId: 5 } })).toEqual({ ok: true, result: { status: "joined", memberId: 5 } });
    const taken = { kind: "refused" as const, status: 409, error: "name_taken", body: { error: "name_taken", memberId: 2, linked: true } };
    expect(parseJoined({ ok: false, failure: taken })).toEqual({ ok: true, result: { status: "name_taken", memberId: 2, linked: true } });
  });

  it("参加：name_taken の本文の形が違えば失敗のまま。ほかの失敗もそのまま。201 の形が違えば bad_response", () => {
    const bad = { kind: "refused" as const, status: 409, error: "name_taken", body: { error: "name_taken" } };
    expect(parseJoined({ ok: false, failure: bad })).toEqual({ ok: false, failure: bad });
    expect(parseJoined({ ok: false, failure: { kind: "network" } })).toEqual({ ok: false, failure: { kind: "network" } });
    expect(parseJoined({ ok: true, status: 201, body: {} })).toEqual({
      ok: false,
      failure: { kind: "refused", status: 201, error: "bad_response", body: {} },
    });
  });
});

describe("fetchGroup：グループを開く", () => {
  it("GET /api/groups/{id} に目印のヘッダーを付けて呼び、応答を返す", async () => {
    respond(200, VIEW);
    expect(await fetchGroup(G)).toEqual(VIEW);
    expect(calls[0].input).toBe(`/api/groups/${G}`);
    expect(calls[0].init).toMatchObject({ method: "GET", headers: { "X-Tabikaigi": "1" } });
  });

  it("404 group_not_found は、その理由の失敗", async () => {
    respond(404, { error: "group_not_found" });
    expect(await failureFrom(fetchGroup(G))).toMatchObject({ kind: "refused", status: 404, error: "group_not_found" });
  });

  it("200 でも形が違えば bad_response の失敗（表にない値）", async () => {
    respond(200, { group: {} });
    expect(await failureFrom(fetchGroup(G))).toMatchObject({ kind: "refused", error: "bad_response" });
  });
});

describe("saveVisit：自分の「行った」を付ける・外す", () => {
  it("付けるのは PUT、外すのは DELETE …/members/{memberId}/visits/{pref}（本文なし）", async () => {
    respond(200, { ok: true });
    await saveVisit(G, 13, 47, true);
    await saveVisit(G, 13, 1, false);
    expect(calls.map((c) => [c.init.method, c.input])).toEqual([
      ["PUT", `/api/groups/${G}/members/13/visits/47`],
      ["DELETE", `/api/groups/${G}/members/13/visits/1`],
    ]);
    expect(calls[0].init.body).toBeUndefined();
  });

  it("403 member_linked は、その理由の失敗", async () => {
    respond(403, { error: "member_linked" });
    expect(await failureFrom(saveVisit(G, 13, 47, true))).toMatchObject({ kind: "refused", status: 403, error: "member_linked" });
  });
});

describe("createGroup：グループを作る", () => {
  it("POST /api/groups に前後の空白を取った名前とトークンを送り、作れたら作ったメンバーを覚える", async () => {
    respond(201, { groupId: G, memberId: 1 });
    expect(await createGroup(" 卒業旅行 ", "さくら　", "tok")).toEqual({ groupId: G, memberId: 1 });
    expect(calls[0].input).toBe("/api/groups");
    expect(calls[0].init).toMatchObject({ method: "POST", headers: { "X-Tabikaigi": "1", "Content-Type": "application/json" } });
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ groupName: "卒業旅行", name: "さくら", turnstileToken: "tok" });
    expect(await readRememberedMember(G)).toEqual({ memberId: 1, name: "さくら" });
  });

  it("名前の長さが外れていれば、API を呼ばずに 400 bad_name", async () => {
    respond(201, { groupId: G, memberId: 1 });
    expect(await failureFrom(createGroup("", "さくら", "tok"))).toMatchObject({ status: 400, error: "bad_name" });
    expect(calls).toHaveLength(0);
  });

  it("断られたら覚えない（403 turnstile_failed）", async () => {
    respond(403, { error: "turnstile_failed" });
    expect(await failureFrom(createGroup("卒業旅行", "さくら", "tok"))).toMatchObject({ status: 403, error: "turnstile_failed" });
    expect(storage.items.size).toBe(0);
  });

  it("localStorage に書けなくても、作れたことは返す（覚えられないだけ）", async () => {
    respond(201, { groupId: G, memberId: 1 });
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    });
    expect(await createGroup("卒業旅行", "さくら", "tok")).toEqual({ groupId: G, memberId: 1 });
  });
});

describe("joinGroup：参加する", () => {
  it("POST /api/groups/{id}/members に名前とトークンを送り、入れたら覚える", async () => {
    respond(201, { memberId: 7 });
    expect(await joinGroup(G, "けんじ", "tok")).toEqual({ status: "joined", memberId: 7 });
    expect(calls[0].input).toBe(`/api/groups/${G}/members`);
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ name: "けんじ", turnstileToken: "tok" });
    expect(await readRememberedMember(G)).toEqual({ memberId: 7, name: "けんじ" });
  });

  it("409 name_taken は、同じ名前の人を結果として返し、覚えない（「続ける」を押したときに覚える：REQ-012）", async () => {
    respond(409, { error: "name_taken", memberId: 13, linked: false });
    expect(await joinGroup(G, "たろう", "tok")).toEqual({ status: "name_taken", memberId: 13, linked: false });
    expect(await readRememberedMember(G)).toBeNull();
  });

  it("409 group_full は、その理由の失敗", async () => {
    respond(409, { error: "group_full" });
    expect(await failureFrom(joinGroup(G, "けんじ", "tok"))).toMatchObject({ status: 409, error: "group_full" });
  });
});

describe("送り直さないことと、API を呼ばないとき（2026-10-23：access-reviewer）", () => {
  it("参加で名前の長さが外れていれば、API を呼ばずに bad_name で失敗し、覚えない", async () => {
    respond(201, { memberId: 99 });
    const f = await failureFrom(joinGroup(G, "あいうえおかきくけこさ", "token"));
    expect(f).toMatchObject({ kind: "refused", status: 400, error: "bad_name" });
    expect(calls).toHaveLength(0);
    expect(storage.items.size).toBe(0);
  });

  it("「行った」の保存とグループを開くのは、429・503・通信エラーでも1回しか送らない（D1 の無料枠をやり直しで減らさない）", async () => {
    for (const [status, body] of [
      [429, "<html>rate</html>"],
      [503, { error: "unavailable", reason: "temporary" }],
    ] as const) {
      calls = [];
      respond(status, body);
      await failureFrom(saveVisit(G, 13, 1, true));
      await failureFrom(fetchGroup(G));
      expect(calls).toHaveLength(2);
    }
    calls = [];
    vi.stubGlobal("fetch", (input: string, init: RequestInit) => {
      calls.push({ input, init });
      return Promise.reject(new TypeError("network"));
    });
    expect(await failureFrom(saveVisit(G, 13, 1, true))).toEqual({ kind: "network" });
    expect(calls).toHaveLength(1);
  });

  it("作ったときの応答のグループIDが形（英数字22文字）でなければ、表にない値にして覚えない", async () => {
    respond(201, { groupId: "../x", memberId: 1 });
    const f = await failureFrom(createGroup("旅行部", "ゆう", "token"));
    expect(f).toMatchObject({ kind: "refused", error: "bad_response" });
    expect(storage.items.size).toBe(0);
  });
});

describe("renameGroup：グループ名を変える（REQ-046）", () => {
  it("PUT /api/groups/{id}/name に前後の空白を取った名前を送り、保存した名前を返す", async () => {
    respond(200, { ok: true });
    expect(await renameGroup(G, " 卒業旅行　")).toBe("卒業旅行");
    expect(calls[0].input).toBe(`/api/groups/${G}/name`);
    expect(calls[0].init).toMatchObject({ method: "PUT", headers: { "X-Tabikaigi": "1", "Content-Type": "application/json" } });
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ name: "卒業旅行" });
  });

  it("空・21文字なら、API を呼ばずに 400 bad_name。20文字は送る", async () => {
    respond(200, { ok: true });
    expect(await failureFrom(renameGroup(G, "　"))).toMatchObject({ kind: "refused", status: 400, error: "bad_name" });
    expect(await failureFrom(renameGroup(G, "あ".repeat(21)))).toMatchObject({ kind: "refused", status: 400, error: "bad_name" });
    expect(calls).toHaveLength(0);
    expect(await renameGroup(G, "あ".repeat(20))).toBe("あ".repeat(20));
    expect(calls).toHaveLength(1);
  });

  it("断られたら、その理由の失敗（400 bad_name・403 not_allowed・404 group_not_found）", async () => {
    for (const [status, error] of [
      [400, "bad_name"],
      [403, "not_allowed"],
      [404, "group_not_found"],
    ] as const) {
      respond(status, { error });
      expect(await failureFrom(renameGroup(G, "旅行部"))).toMatchObject({ kind: "refused", status, error });
    }
  });

  it("429・503・通信エラーは、その種類の失敗で、1回しか送らない", async () => {
    respond(429, "<html>rate</html>");
    expect(await failureFrom(renameGroup(G, "旅行部"))).toEqual({ kind: "rate_limited" });
    respond(503, { error: "unavailable", reason: "quota" });
    expect(await failureFrom(renameGroup(G, "旅行部"))).toEqual({ kind: "unavailable", reason: "quota" });
    vi.stubGlobal("fetch", (input: string, init: RequestInit) => {
      calls.push({ input, init });
      return Promise.reject(new TypeError("network"));
    });
    expect(await failureFrom(renameGroup(G, "旅行部"))).toEqual({ kind: "network" });
    expect(calls).toHaveLength(3);
  });

  it("200 でも形が違えば（{ ok: true } でない、JSON でない）bad_response の失敗（表にない値）", async () => {
    respond(200, {});
    expect(await failureFrom(renameGroup(G, "旅行部"))).toMatchObject({ kind: "refused", error: "bad_response" });
    respond(200, "<html></html>");
    expect(await failureFrom(renameGroup(G, "旅行部"))).toMatchObject({ kind: "refused", error: "bad_response" });
  });
});

describe("parseRemoved：退出・メンバーの削除の応答を読む", () => {
  it("{ ok: true, groupDeleted } なら groupDeleted を返す。形が違えば null", () => {
    expect(parseRemoved({ ok: true, groupDeleted: true })).toEqual({ groupDeleted: true });
    expect(parseRemoved({ ok: true, groupDeleted: false })).toEqual({ groupDeleted: false });
    expect(parseRemoved({ ok: true })).toBeNull();
    expect(parseRemoved({ ok: false, groupDeleted: false })).toBeNull();
    expect(parseRemoved(null)).toBeNull();
  });
});

describe("leaveGroup：退出する（REQ-049・REQ-050）", () => {
  it("POST /api/groups/{id}/members/{memberId}/leave を本文なしで呼び、groupDeleted を返す", async () => {
    respond(200, { ok: true, groupDeleted: true });
    expect(await leaveGroup(G, 12)).toEqual({ groupDeleted: true });
    expect(calls[0].input).toBe(`/api/groups/${G}/members/12/leave`);
    expect(calls[0].init).toMatchObject({ method: "POST", headers: { "X-Tabikaigi": "1" } });
    expect(calls[0].init.body).toBeUndefined();
  });

  it("端末の覚えは変えない（忘れるのは画面の側）", async () => {
    storage.items.set("tabikaigi-members", JSON.stringify({ [G]: { memberId: 12, name: "ゆう" } }));
    respond(200, { ok: true, groupDeleted: false });
    await leaveGroup(G, 12);
    expect(await readRememberedMember(G)).toEqual({ memberId: 12, name: "ゆう" });
  });

  it("断られたら、その理由の失敗（403 member_linked・404 group_not_found）", async () => {
    for (const [status, error] of [
      [403, "member_linked"],
      [404, "group_not_found"],
    ] as const) {
      respond(status, { error });
      expect(await failureFrom(leaveGroup(G, 12))).toMatchObject({ kind: "refused", status, error });
    }
  });

  it("200 でも形が違えば bad_response の失敗", async () => {
    respond(200, { ok: true });
    expect(await failureFrom(leaveGroup(G, 12))).toMatchObject({ kind: "refused", error: "bad_response" });
  });
});

describe("deleteMember：メンバーを削除する（REQ-048）", () => {
  it("DELETE /api/groups/{id}/members/{memberId} を本文なしで呼ぶ", async () => {
    respond(200, { ok: true, groupDeleted: false });
    await deleteMember(G, 13);
    expect(calls[0].input).toBe(`/api/groups/${G}/members/13`);
    expect(calls[0].init).toMatchObject({ method: "DELETE", headers: { "X-Tabikaigi": "1" } });
    expect(calls[0].init.body).toBeUndefined();
  });

  it("断られたら、その理由の失敗（403 not_allowed・404 group_not_found）。429・通信エラーはその種類", async () => {
    for (const [status, error] of [
      [403, "not_allowed"],
      [404, "group_not_found"],
    ] as const) {
      respond(status, { error });
      expect(await failureFrom(deleteMember(G, 13))).toMatchObject({ kind: "refused", status, error });
    }
    respond(429, "<html>rate</html>");
    expect(await failureFrom(deleteMember(G, 13))).toEqual({ kind: "rate_limited" });
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("network")));
    expect(await failureFrom(deleteMember(G, 13))).toEqual({ kind: "network" });
  });

  it("200 でも形が違えば bad_response の失敗", async () => {
    respond(200, {});
    expect(await failureFrom(deleteMember(G, 13))).toMatchObject({ kind: "refused", error: "bad_response" });
  });
});

describe("deleteGroup：グループを削除する（REQ-047）", () => {
  it("DELETE /api/groups/{id} を本文なしで呼ぶ", async () => {
    respond(200, { ok: true });
    await deleteGroup(G);
    expect(calls[0].input).toBe(`/api/groups/${G}`);
    expect(calls[0].init).toMatchObject({ method: "DELETE", headers: { "X-Tabikaigi": "1" } });
    expect(calls[0].init.body).toBeUndefined();
  });

  it("断られたら、その理由の失敗（403 not_allowed・404 group_not_found）。503 はその種類", async () => {
    for (const [status, error] of [
      [403, "not_allowed"],
      [404, "group_not_found"],
    ] as const) {
      respond(status, { error });
      expect(await failureFrom(deleteGroup(G))).toMatchObject({ kind: "refused", status, error });
    }
    respond(503, { error: "unavailable", reason: "temporary" });
    expect(await failureFrom(deleteGroup(G))).toEqual({ kind: "unavailable", reason: "temporary" });
  });

  it("200 でも形が違えば（{ ok: true } でない、JSON でない）bad_response の失敗", async () => {
    respond(200, {});
    expect(await failureFrom(deleteGroup(G))).toMatchObject({ kind: "refused", error: "bad_response" });
    respond(200, "<html></html>");
    expect(await failureFrom(deleteGroup(G))).toMatchObject({ kind: "refused", error: "bad_response" });
  });
});
