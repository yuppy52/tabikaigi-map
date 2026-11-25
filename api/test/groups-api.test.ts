// グループの作成・参加・開く・「行った」の API のテスト。
// 改造した画面を想定したリクエストが断られること（docs/design/permissions.md の × の欄）と、
// 通るべき人が通ること（断りすぎていないこと）を確かめる
import { beforeAll, describe, expect, it } from "vitest";
import { TurnstileUnavailableError } from "../src/turnstile";
import { call, callRaw, create, env, join, setup } from "./helpers";

beforeAll(setup);

/** 表ごとの行の数（断ったときに何も書いていないことの確かめ） */
async function rowCounts() {
  const n = async (table: string) => (await env.DB.prepare(`SELECT count(*) AS n FROM ${table}`).first<{ n: number }>())!.n;
  return { groups: await n("groups"), members: await n("members"), member_visits: await n("member_visits") };
}

/** prepare と batch が必ず失敗する D1（D1 が落ちた日をまねる。表の名前を替えて戻す形にしない：ほかのテストに漏らさない） */
const brokenDb = {
  prepare() {
    throw new Error("D1 が使えない");
  },
  batch() {
    throw new Error("D1 が使えない");
  },
} as unknown as D1Database;

/** 少しずつ届く本文（Content-Length が付かない）。size バイトの JSON を、1KB ずつ流す */
function streamBody(body: unknown, size: number) {
  const json = JSON.stringify(body);
  // 日本語は1文字3バイトなので、バイトで数えて埋める（`,"pad":"` と `"` の9バイトを足し、元の `}` は使い回す）
  const head = new TextEncoder().encode(json).length;
  const text = json.slice(0, -1) + `,"pad":"${"x".repeat(Math.max(0, size - head - 9))}"}`;
  const bytes = new TextEncoder().encode(text);
  if (bytes.length !== size) throw new Error(`本文の大きさが ${bytes.length} バイトになった`);
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) return controller.close();
      controller.enqueue(bytes.slice(offset, offset + 1024));
      offset += 1024;
    },
  });
}

/** D1 を包み、何回使われたかを数える（「D1 を使わずに断る」の確かめ。room.test の countingEnv と同じ考え方） */
function countingDb() {
  const used = { db: 0 };
  const db = new Proxy(env.DB, {
    get(t, p) {
      used.db++;
      const v: unknown = Reflect.get(t, p);
      return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(t) : v;
    },
  });
  return { used, env: { DB: db } as Partial<Env> };
}

describe("目印のヘッダー（よそのサイトから読ませない）", () => {
  it("X-Tabikaigi がなければ、D1 を読まずに 400", async () => {
    const { groupId } = await create();
    const c = countingDb();
    const r = await call("GET", `/api/groups/${groupId}`, { headers: { "X-Tabikaigi": "" }, env: c.env });
    expect(r).toEqual({ status: 400, json: { error: "bad_request" } });
    expect(c.used.db).toBe(0);
  });

  it("目印のない書き込み（POST・PUT・DELETE の全部）は 400 で、D1 を使わず、行も変わらない（8-B）", async () => {
    const { groupId, memberId } = await create("ゆう", { groupName: "目印部" });
    const taro = (await join(groupId, "たろう")).json.memberId as number;
    expect((await call("PUT", `/api/groups/${groupId}/members/${memberId}/visits/13`)).status).toBe(200);
    const writes: [string, string, unknown][] = [
      ["POST", "/api/groups", { groupName: "旅行部", name: "じろう", turnstileToken: "ok" }],
      ["POST", `/api/groups/${groupId}/members`, { name: "はなこ", turnstileToken: "ok" }],
      ["PUT", `/api/groups/${groupId}/members/${memberId}/visits/14`, undefined],
      ["DELETE", `/api/groups/${groupId}/members/${memberId}/visits/13`, undefined],
      ["POST", `/api/groups/${groupId}/members/${taro}/leave`, undefined],
      ["DELETE", `/api/groups/${groupId}/members/${taro}`, undefined],
      ["PUT", `/api/groups/${groupId}/name`, { name: "旅の会" }],
      ["DELETE", `/api/groups/${groupId}`, undefined],
    ];
    const before = await rowCounts();
    // ヘッダーがない・値が違う（"1" の一歩手前の "0"、空）
    for (const mark of [undefined, "0", ""]) {
      for (const [method, path, body] of writes) {
        const c = countingDb();
        const r = await call(method, path, {
          body,
          env: c.env,
          omitMark: mark === undefined,
          headers: mark === undefined ? {} : { "X-Tabikaigi": mark },
        });
        const label = `${method} ${path} ${String(mark)}`;
        expect(r, label).toEqual({ status: 400, json: { error: "bad_request" } });
        expect(c.used.db, label).toBe(0);
      }
    }
    expect(await rowCounts()).toEqual(before);
    const view = await call("GET", `/api/groups/${groupId}`);
    expect(view.json.group).toEqual({ name: "目印部" });
    expect(view.json.members.map((m: { id: number }) => m.id)).toEqual([memberId, taro]);
    expect(view.json.visits).toEqual([{ memberId, pref: 13 }]);
    // 断りすぎの確認：目印があれば同じ書き込みが通る
    expect((await call("PUT", `/api/groups/${groupId}/name`, { body: { name: "旅の会" } })).status).toBe(200);
  });

  it("/api/health は目印なしでも通る", async () => {
    expect((await call("GET", "/api/health", { headers: { "X-Tabikaigi": "" } })).status).toBe(200);
  });
});

describe("Turnstile（Q-031）", () => {
  it("合言葉がない・違うと 403", async () => {
    const none = await call("POST", "/api/groups", { body: { groupName: "旅行部", name: "ゆう" } });
    expect(none).toEqual({ status: 403, json: { error: "turnstile_failed" } });
    const { groupId } = await create();
    const bad = await call("POST", `/api/groups/${groupId}/members`, { body: { name: "たろう", turnstileToken: "ng" } });
    expect(bad).toEqual({ status: 403, json: { error: "turnstile_failed" } });
  });

  it("Turnstile で断ったときは、グループもメンバーも増えない（作成と参加：8-C）", async () => {
    const { groupId } = await create();
    const before = await rowCounts();
    for (const token of [undefined, "ng", ""]) {
      const c = await call("POST", "/api/groups", { body: { groupName: "旅行部", name: "ゆう", turnstileToken: token } });
      expect(c, String(token)).toEqual({ status: 403, json: { error: "turnstile_failed" } });
      const j = await call("POST", `/api/groups/${groupId}/members`, { body: { name: "たろう", turnstileToken: token } });
      expect(j, String(token)).toEqual({ status: 403, json: { error: "turnstile_failed" } });
    }
    expect(await rowCounts()).toEqual(before);
    // 断りすぎの確認：合言葉が合えば参加できる
    expect((await join(groupId, "たろう")).status).toBe(201);
  });

  it("Cloudflare に聞けないときは、通さずに 503", async () => {
    const r = await call("POST", "/api/groups", {
      body: { groupName: "旅行部", name: "ゆう", turnstileToken: "ok" },
      deps: {
        verifyTurnstile: async () => {
          throw new TurnstileUnavailableError("test");
        },
      },
    });
    expect(r).toEqual({ status: 503, json: { error: "unavailable", reason: "temporary" } });
  });
});

describe("グループを作る（REQ-001）", () => {
  it("作った人は最初のメンバー（色 0）になる。作成者の印は持たない（ADR 0013）", async () => {
    const { groupId, memberId } = await create("ゆう");
    expect(groupId).toMatch(/^[A-Za-z0-9]{22}$/);
    const r = await call("GET", `/api/groups/${groupId}`);
    expect(r.json.members).toEqual([{ id: memberId, name: "ゆう", color: 0 }]);
  });

  it("名前とグループ名の決まり（REQ-009・REQ-010）：空白だけ、長すぎは 400", async () => {
    const post = (groupName: unknown, name: unknown) => call("POST", "/api/groups", { body: { groupName, name, turnstileToken: "ok" } });
    const badName = { status: 400, json: { error: "bad_name" } };
    expect(await post("旅行部", "　 ")).toEqual(badName);
    expect(await post("旅行部", "あ".repeat(11))).toEqual(badName);
    expect(await post("あ".repeat(21), "ゆう")).toEqual(badName);
    expect(await post(123, "ゆう")).toEqual(badName);
    // 見た目は1文字でも、記号を何百も重ねた名前は 400（データベースのエラーにしない）
    expect(await post("旅行部", "a" + "́".repeat(300))).toEqual(badName);
    expect((await post("旅行部", "👨‍👩‍👧".repeat(10))).status).toBe(201);
  });

  it("前後の空白は取り除いて保存する", async () => {
    const { groupId } = await create("　ゆう ");
    const r = await call("GET", `/api/groups/${groupId}`);
    expect(r.json.members[0].name).toBe("ゆう");
  });

  it("メンバーを入れる文が失敗したら、グループも残らない（同じ batch で取り消される：8-D）", async () => {
    const before = await rowCounts();
    // メンバーの INSERT を必ず失敗させるトリガーを、このテストの間だけ置く（最後に外す）
    await env.DB.prepare(
      "CREATE TRIGGER test_block_member_insert BEFORE INSERT ON members BEGIN SELECT RAISE(ABORT, 'blocked'); END",
    ).run();
    try {
      const r = await call("POST", "/api/groups", { body: { groupName: "残らない部", name: "ゆう", turnstileToken: "ok" } });
      expect(r).toEqual({ status: 503, json: { error: "unavailable", reason: "temporary" } });
    } finally {
      await env.DB.prepare("DROP TRIGGER test_block_member_insert").run();
    }
    expect(await rowCounts()).toEqual(before);
    expect(await env.DB.prepare("SELECT 1 FROM groups WHERE name = '残らない部'").first()).toBeNull();
    // トリガーを外せば作れる（ほかのテストに漏れていない）
    expect((await call("POST", "/api/groups", { body: { groupName: "残らない部", name: "ゆう", turnstileToken: "ok" } })).status).toBe(201);
  });

  it("大きな本文は読まずに断る", async () => {
    const r = await call("POST", "/api/groups", {
      rawBody: JSON.stringify({ groupName: "旅行部", name: "ゆう", turnstileToken: "ok", pad: "x".repeat(10_000) }),
      headers: { "Content-Type": "application/json" },
    });
    expect(r).toEqual({ status: 413, json: { error: "bad_request" } });
  });
});

describe("本文の上限（4KB：8-E）", () => {
  const pad = "x".repeat(10_000);
  const raw = (body: unknown) => ({ rawBody: JSON.stringify(body), headers: { "Content-Type": "application/json" } });

  it("参加でも、大きな本文は読まずに 413 で、メンバーは増えない", async () => {
    const { groupId } = await create();
    const before = await rowCounts();
    const r = await call("POST", `/api/groups/${groupId}/members`, raw({ name: "たろう", turnstileToken: "ok", pad }));
    expect(r).toEqual({ status: 413, json: { error: "bad_request" } });
    expect(await rowCounts()).toEqual(before);
  });

  it("Content-Length のない少しずつの本文でも、4KB を超えたら 413 で、行も名前も変わらない", async () => {
    const { groupId } = await create("ゆう", { groupName: "流す部" });
    // 本当に Content-Length が付かない形で送っていることの確かめ
    const probe = new Request("https://example.com/", { method: "PUT", body: streamBody({ name: "x" }, 100) });
    expect(probe.headers.get("content-length")).toBeNull();
    const before = await rowCounts();
    const headers = { "Content-Type": "application/json" };
    const join413 = await call("POST", `/api/groups/${groupId}/members`, {
      rawBody: streamBody({ name: "たろう", turnstileToken: "ok" }, 4 * 1024 + 1),
      headers,
    });
    expect(join413).toEqual({ status: 413, json: { error: "bad_request" } });
    const rename413 = await call("PUT", `/api/groups/${groupId}/name`, { rawBody: streamBody({ name: "旅の会" }, 4 * 1024 + 1), headers });
    expect(rename413).toEqual({ status: 413, json: { error: "bad_request" } });
    expect(await rowCounts()).toEqual(before);
    expect((await call("GET", `/api/groups/${groupId}`)).json.group).toEqual({ name: "流す部" });
    // 断りすぎの確認：少しずつでも 4KB ちょうどなら通る
    const ok = await call("PUT", `/api/groups/${groupId}/name`, { rawBody: streamBody({ name: "旅の会" }, 4 * 1024), headers });
    expect(ok).toEqual({ status: 200, json: { ok: true } });
  });

  it("グループ名の変更でも、大きな本文は読まずに 413 で、名前は変わらない", async () => {
    const { groupId } = await create("ゆう", { groupName: "上限部" });
    const r = await call("PUT", `/api/groups/${groupId}/name`, raw({ name: "旅の会", pad }));
    expect(r).toEqual({ status: 413, json: { error: "bad_request" } });
    expect((await call("GET", `/api/groups/${groupId}`)).json.group).toEqual({ name: "上限部" });
    // 断りすぎの確認：小さな本文なら通る
    expect((await call("PUT", `/api/groups/${groupId}/name`, raw({ name: "旅の会" }))).status).toBe(200);
  });
});

describe("参加する（REQ-004・REQ-005・REQ-008）", () => {
  it("ログインなしで参加できる。色は使われていない色の小さい順", async () => {
    const { groupId } = await create();
    const r = await join(groupId, "たろう");
    expect(r.status).toBe(201);
    const view = await call("GET", `/api/groups/${groupId}`);
    expect(view.json.members.map((m: { color: number }) => m.color)).toEqual([0, 1]);
  });

  it("10色を使い切ったら、使っている人が一番少ない色（同じなら小さい番号）", async () => {
    const { groupId } = await create();
    for (let i = 1; i <= 10; i++) await join(groupId, `メンバー${i}`);
    const view = await call("GET", `/api/groups/${groupId}`);
    expect(view.json.members.map((m: { color: number }) => m.color)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0]);
  });

  it("21人目は 409 group_full（NFR-006 (8)）", async () => {
    const { groupId } = await create();
    for (let i = 2; i <= 20; i++) expect((await join(groupId, `メンバー${i}`)).status).toBe(201);
    expect(await join(groupId, "21人目")).toEqual({ status: 409, json: { error: "group_full" } });
  });

  it("参加の SQL の人数の確かめだけでも、21人目を 409 group_full で断る（トリガーを外して確かめる：NFR-006 (8)）", async () => {
    const { groupId } = await create();
    for (let i = 2; i <= 20; i++) expect((await join(groupId, `メンバー${i}`)).status).toBe(201);
    // 後ろの守り（members_group_full トリガー）を一時的に外す。作り直す SQL は migrations/0001_init.sql と同じ
    await env.DB.prepare("DROP TRIGGER members_group_full").run();
    try {
      expect(await join(groupId, "21人目")).toEqual({ status: 409, json: { error: "group_full" } });
    } finally {
      await env.DB.prepare(
        `CREATE TRIGGER members_group_full
BEFORE INSERT ON members
WHEN (SELECT count(*) FROM members WHERE group_id = NEW.group_id) >= 20
BEGIN
  SELECT RAISE(ABORT, 'group_full');
END`,
      ).run();
    }
    const count = await env.DB.prepare("SELECT count(*) AS n FROM members WHERE group_id = ?").bind(groupId).first<{ n: number }>();
    expect(count!.n).toBe(20);
  });

  it("満員でも、すでにいる名前なら group_full でなく name_taken とその人の番号を返す（戻ってくる人：REQ-005・REQ-012）", async () => {
    const { groupId, memberId } = await create("ゆう");
    for (let i = 2; i <= 20; i++) expect((await join(groupId, `メンバー${i}`)).status).toBe(201);
    expect(await join(groupId, "ゆう")).toEqual({ status: 409, json: { error: "name_taken", memberId } });
    // 全角半角だけが違う名前も、同じ名前として扱う
    expect(await join(groupId, "ﾒﾝﾊﾞｰ2")).toMatchObject({ status: 409, json: { error: "name_taken" } });
    const count = await env.DB.prepare("SELECT count(*) AS n FROM members WHERE group_id = ?").bind(groupId).first<{ n: number }>();
    expect(count!.n).toBe(20);
  });

  it("満員のとき、よそのグループにだけいる名前では group_full（グループの範囲で読み直す）", async () => {
    const other = await create("たろう");
    const { groupId } = await create("ゆう");
    for (let i = 2; i <= 20; i++) expect((await join(groupId, `メンバー${i}`)).status).toBe(201);
    expect(await join(groupId, "たろう")).toEqual({ status: 409, json: { error: "group_full" } });
    expect(other.memberId).toBeGreaterThan(0);
  });

  it("ないグループは 404", async () => {
    expect((await join("A".repeat(22), "たろう")).json).toEqual({ error: "group_not_found" });
  });

  it("形の違うグループIDは、D1 を引かずに 404", async () => {
    // D1 を壊しても 503 にならず 404 なら、データベースを引いていない
    await env.DB.prepare("ALTER TABLE groups RENAME TO groups_tmp").run();
    try {
      expect((await join("short", "たろう")).json).toEqual({ error: "group_not_found" });
      expect((await call("GET", "/api/groups/abc")).json).toEqual({ error: "group_not_found" });
      // グループIDを持つ API のすべてで同じ（確かめを外したり、ルートの後ろに動かしたりしたら落ちる）
      const routes: [string, string][] = [
        ["PUT", "/members/1/visits/13"],
        ["DELETE", "/members/1/visits/13"],
        ["POST", "/members/1/leave"],
        ["DELETE", "/members/1"],
        ["PUT", "/name"],
        ["DELETE", ""],
      ];
      for (const [method, rest] of routes) {
        const res = await call(method, `/api/groups/short${rest}`, { body: {} });
        expect({ method, rest, ...res }).toEqual({ method, rest, status: 404, json: { error: "group_not_found" } });
      }
    } finally {
      await env.DB.prepare("ALTER TABLE groups_tmp RENAME TO groups").run();
    }
  });

  it("見えない文字・向きを変える文字の名前は 400（なりすましと見た目が空の名前を防ぐ）", async () => {
    const { groupId } = await create("ゆう");
    const invisible = ["ゆう\u200B", "\u3164", "\u2060", "ゆ\u202Eう", "ゆ\nう", "ゆ\u0000う"];
    // 結合文字・記号の仲間で見えないもの（異体字の切り替え、組み合わせの記号、モンゴル文字の切り替え、点字の空白）
    invisible.push("ゆう\uFE00", "ゆう\uFE0F", "ゆう\u{E0100}", "ゆ\u034Fう", "ゆう\u180B", "\u2800");
    // 絵文字の部品（ZWJ、タグ文字、U+FE0F）も、絵文字の外にあれば断る
    invisible.push("ゆ\u200Dう", "ゆう\u200D", "ゆう\u{E0061}", "ゆう\u{E007F}", "ゆう1\uFE0F");
    // 絵文字の部品の並びの境目（2つ続く、頭や終わりにある、🏴 でない絵文字の後ろのタグ、決まりのない旗）
    invisible.push("😀\uFE0F\uFE0F", "\u200D😀", "😀\u200D", "😀\u200D\u200D😀", "\u{1F3F4}\u{E0067}", "😀\u{E0067}\u{E007F}");
    invisible.push("ゆう\u{1F3F4}\u{E0061}\u{E007F}");
    // Unicode が「表示しない」と決めている文字のうち、分類（Cf など）の外にあるもの（クメール文字、割り当てのない場所）
    invisible.push("ゆ\u17B4う", "ゆう\u2065", "ゆう\u{E0080}", "ゆう\uFFF0");
    // 見た目の1文字に部品を重ねすぎたもの（ZWJ でつないだ絵文字67個、肌の色の記号150個）
    invisible.push("😀\u200D".repeat(66) + "😀", "👍" + "🏻".repeat(150));
    for (const name of invisible) {
      expect((await join(groupId, name)).json).toEqual({ error: "bad_name" });
    }
    // 絵文字の家族（ZWJ でつなぐ）と、旗の絵文字（タグ文字）は通す
    expect((await join(groupId, "👨‍👩‍👧")).status).toBe(201);
    expect((await join(groupId, "🏴󠁧󠁢󠁳󠁣󠁴󠁿")).status).toBe(201);
    // 絵文字の直後の、絵文字の形を選ぶ文字（❤️、1️⃣）は通す
    expect((await join(groupId, "ゆう\u2764\uFE0F")).status).toBe(201);
    expect((await join(groupId, "1\uFE0F\u20E3")).status).toBe(201);
    expect((await join(groupId, "🏳️‍🌈")).status).toBe(201);
    expect((await join(groupId, "👩🏽‍💻")).status).toBe(201);
  });

  it("見た目が同じ名前（絵文字の形の切り替え・ZWJ・旗のタグ・続いた空白だけが違う）は、同じ名前とみなす（REQ-011）", async () => {
    const { groupId } = await create("ゆう");
    const same = [
      ["\u2764", "\u2764\uFE0F"],
      ["たろう😀😀", "たろう😀\u200D😀"],
      ["🏴", "🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}"],
      ["ゆ う", "ゆ  う"],
      ["\u2600", "\u2600\uFE0E"],
      ["じろう", "\u3000じろう\u3000"],
    ];
    for (const [first, second] of same) {
      expect((await join(groupId, first)).status).toBe(201);
      expect(await join(groupId, second)).toMatchObject({ status: 409, json: { error: "name_taken" } });
    }
  });

  it("名前の前後の空白（全角の空白も）は取り除いて保存する", async () => {
    const { groupId } = await create("ゆう");
    const r = await join(groupId, "\u3000 さぶろう\u3000");
    expect(r.status).toBe(201);
    const row = await env.DB.prepare("SELECT name FROM members WHERE id = ?").bind(r.json.memberId).first();
    expect(row).toEqual({ name: "さぶろう" });
  });

  it("同じ名前（全角半角・大文字小文字の違いも同じ）は 409 name_taken と、その人の番号（REQ-011・REQ-012）", async () => {
    const { groupId, memberId } = await create("Yu");
    expect(await join(groupId, "ｙｕ")).toEqual({ status: 409, json: { error: "name_taken", memberId } });
  });
});

describe("グループを開く", () => {
  it("応答は group.name、members（id・name・color を参加した順）、visits だけ（api.md の「グループを開いたときの応答」）", async () => {
    const { groupId, memberId: yu } = await create("ゆう", { groupName: "開く部" });
    const taro = (await join(groupId, "たろう")).json.memberId as number;
    await call("PUT", `/api/groups/${groupId}/members/${taro}/visits/1`);
    await call("PUT", `/api/groups/${groupId}/members/${yu}/visits/13`);
    // よそのグループの「行った」は混ざらない
    const other = await create("じろう");
    await call("PUT", `/api/groups/${other.groupId}/members/${other.memberId}/visits/47`);
    const r = await call("GET", `/api/groups/${groupId}`);
    expect(r).toEqual({
      status: 200,
      json: {
        group: { name: "開く部" },
        members: [
          { id: yu, name: "ゆう", color: 0 },
          { id: taro, name: "たろう", color: 1 },
        ],
        visits: [
          { memberId: yu, pref: 13 },
          { memberId: taro, pref: 1 },
        ],
      },
    });
  });

  it("ないグループは 404", async () => {
    expect(await call("GET", `/api/groups/${"B".repeat(22)}`)).toEqual({ status: 404, json: { error: "group_not_found" } });
  });

  it("最後に開かれた日を今日にする", async () => {
    const { groupId } = await create();
    await env.DB.prepare("UPDATE groups SET last_opened_on = '2026-01-01' WHERE id = ?").bind(groupId).run();
    await call("GET", `/api/groups/${groupId}`);
    const row = await env.DB.prepare("SELECT last_opened_on AS d FROM groups WHERE id = ?").bind(groupId).first<{ d: string }>();
    expect(row!.d).not.toBe("2026-01-01");
  });

  it("最後に開かれた日の更新が失敗しても、グループは開ける（Q-025）", async () => {
    const { groupId } = await create();
    await env.DB.prepare("UPDATE groups SET last_opened_on = '2026-01-01' WHERE id = ?").bind(groupId).run();
    // 書き込みだけが止まった日を、更新を断るトリガーでまねる（最後に外す）
    await env.DB.prepare(
      "CREATE TRIGGER test_block_touch BEFORE UPDATE OF last_opened_on ON groups BEGIN SELECT RAISE(ABORT, 'blocked'); END",
    ).run();
    try {
      const r = await call("GET", `/api/groups/${groupId}`);
      expect(r.status).toBe(200);
    } finally {
      await env.DB.prepare("DROP TRIGGER test_block_touch").run();
    }
  });
});

describe("メンバーの「行った」（REQ-016・REQ-023）", () => {
  it("付けて、2回付けても成功、外せる", async () => {
    const { groupId, memberId } = await create();
    const path = `/api/groups/${groupId}/members/${memberId}/visits/13`;
    expect(await call("PUT", path)).toEqual({ status: 200, json: { ok: true } });
    expect((await call("PUT", path)).status).toBe(200);
    expect((await call("DELETE", path)).status).toBe(200);
    expect((await call("DELETE", path)).status).toBe(200);
    expect((await call("GET", `/api/groups/${groupId}`)).json.visits).toEqual([]);
  });

  it("同じグループのほかのメンバーの「行った」も付け外しできる（信頼ベース：REQ-022・REQ-023）", async () => {
    const { groupId } = await create();
    const taro = (await join(groupId, "たろう")).json.memberId as number;
    const path = `/api/groups/${groupId}/members/${taro}/visits/5`;
    expect(await call("PUT", path)).toEqual({ status: 200, json: { ok: true } });
    expect((await call("GET", `/api/groups/${groupId}`)).json.visits).toEqual([{ memberId: taro, pref: 5 }]);
    expect(await call("DELETE", path)).toEqual({ status: 200, json: { ok: true } });
    expect((await call("GET", `/api/groups/${groupId}`)).json.visits).toEqual([]);
  });

  it("ほかのグループのメンバーの番号では、付けも外しもできない（404 member_not_found：NFR-006 (14)）", async () => {
    const a = await create();
    const b = await create();
    const count = async () =>
      (await env.DB.prepare("SELECT count(*) AS n FROM member_visits WHERE member_id = ? AND pref = 13")
        .bind(a.memberId)
        .first<{ n: number }>())!.n;
    // b のグループIDで、a のメンバーの番号に付ける → 書かれない
    expect(await call("PUT", `/api/groups/${b.groupId}/members/${a.memberId}/visits/13`)).toEqual({
      status: 404,
      json: { error: "member_not_found" },
    });
    expect(await count()).toBe(0);
    // a のメンバーが付けた県を、b のグループIDで外す → 消えない
    expect((await call("PUT", `/api/groups/${a.groupId}/members/${a.memberId}/visits/13`)).status).toBe(200);
    expect(await call("DELETE", `/api/groups/${b.groupId}/members/${a.memberId}/visits/13`)).toEqual({
      status: 404,
      json: { error: "member_not_found" },
    });
    expect(await count()).toBe(1);
  });

  it("ないグループは group_not_found、いないメンバーは member_not_found", async () => {
    const { groupId } = await create();
    expect((await call("PUT", `/api/groups/${"C".repeat(22)}/members/1/visits/13`)).json).toEqual({ error: "group_not_found" });
    expect((await call("DELETE", `/api/groups/${groupId}/members/999999999/visits/13`)).json).toEqual({ error: "member_not_found" });
  });

  it("県の番号とメンバーの番号の形が違えば 400（0、48、小数、文字）", async () => {
    const { groupId, memberId } = await create();
    for (const pref of ["0", "48", "13.5", "1e1", "abc", "013"]) {
      expect(await call("PUT", `/api/groups/${groupId}/members/${memberId}/visits/${pref}`)).toEqual({
        status: 400,
        json: { error: "bad_request" },
      });
    }
    expect(await call("PUT", `/api/groups/${groupId}/members/1.5/visits/13`)).toEqual({ status: 400, json: { error: "bad_request" } });
    expect(await call("PUT", `/api/groups/${groupId}/members/-1/visits/13`)).toEqual({ status: 400, json: { error: "bad_request" } });
  });
});

describe("API の応答は残させない（Cache-Control: no-store、X-Robots-Tag: noindex、Referrer-Policy: no-referrer：5-A）", () => {
  const expected = { cache: "no-store", robots: "noindex", referrer: "no-referrer" };
  const headersOf = (method: string, path: string, res: Response) => ({
    method,
    path,
    status: res.status,
    cache: res.headers.get("cache-control"),
    robots: res.headers.get("x-robots-tag"),
    referrer: res.headers.get("referrer-policy"),
  });

  it("成功・失敗・知らない API・落ちたとき、どの応答にも no-store・noindex・no-referrer が付く", async () => {
    const { groupId, memberId } = await create();
    const cases: [string, string, Parameters<typeof callRaw>[2], number][] = [
      ["GET", `/api/groups/${groupId}`, {}, 200],
      ["POST", "/api/groups", { body: { groupName: "旅行部", name: "ゆう", turnstileToken: "ok" } }, 201],
      ["PUT", `/api/groups/${groupId}/members/${memberId}/visits/13`, {}, 200],
      ["GET", "/api/health", {}, 200],
      ["POST", "/api/groups", { body: { groupName: "旅行部", name: "", turnstileToken: "ok" } }, 400],
      ["GET", `/api/groups/${groupId}`, { omitMark: true }, 400],
      ["POST", "/api/groups", { body: { groupName: "旅行部", name: "ゆう", turnstileToken: "ng" } }, 403],
      ["GET", `/api/groups/${"D".repeat(22)}`, {}, 404],
      ["GET", "/api/groups/short", {}, 404],
      ["GET", "/api/nothing", {}, 404],
      [
        "POST",
        "/api/groups",
        { rawBody: JSON.stringify({ pad: "x".repeat(10_000) }), headers: { "Content-Type": "application/json" } },
        413,
      ],
    ];
    for (const [method, path, opts, status] of cases) {
      const res = await callRaw(method, path, opts);
      expect(headersOf(method, path, res)).toEqual({ method, path, status, ...expected });
    }
    // D1 が落ちたときの 503 にも付く
    const res = await callRaw("GET", `/api/groups/${groupId}`, { env: { DB: brokenDb } });
    expect(headersOf("GET", groupId, res)).toEqual({ method: "GET", path: groupId, status: 503, ...expected });
  });
});

describe("そのほか", () => {
  it("知らない API は JSON の 404（api.md の共通の決まり）", async () => {
    expect(await call("GET", "/api/nothing")).toEqual({ status: 404, json: { error: "not_found" } });
  });

  it("ログインの入口はない。Authorization を付けても扱いは変わらない（ADR 0013）", async () => {
    const { groupId, memberId } = await create();
    const gone: [string, string][] = [
      ["PUT", `/api/groups/${groupId}/my-visits/13`],
      ["DELETE", `/api/groups/${groupId}/my-visits/13`],
      ["POST", `/api/groups/${groupId}/members/${memberId}/link`],
      ["PUT", `/api/groups/${groupId}/members/${memberId}/name`],
      ["PUT", `/api/groups/${groupId}/manage-by`],
      ["GET", "/api/me/groups"],
      ["GET", "/api/me/visits"],
      ["DELETE", "/api/me"],
    ];
    for (const [method, path] of gone) {
      const res = await call(method, path, method === "GET" ? {} : { body: {} });
      expect({ method, path, ...res }).toEqual({ method, path, status: 404, json: { error: "not_found" } });
    }
    // 形の誤った証明書を付けても、断られずにふつうに通る（確かめる仕組みがない）
    const r = await call("PUT", `/api/groups/${groupId}/members/${memberId}/visits/13`, { headers: { Authorization: "Bearer broken" } });
    expect(r).toEqual({ status: 200, json: { ok: true } });
  });

  it("データベースが落ちたときは 503 の一時的な失敗（NFR-009・NFR-012）", async () => {
    const { groupId } = await create();
    await env.DB.prepare("ALTER TABLE member_visits RENAME TO member_visits_tmp").run();
    try {
      const r = await call("GET", `/api/groups/${groupId}`);
      expect(r).toEqual({ status: 503, json: { error: "unavailable", reason: "temporary" } });
    } finally {
      await env.DB.prepare("ALTER TABLE member_visits_tmp RENAME TO member_visits").run();
    }
  });
});
