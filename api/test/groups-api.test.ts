// グループの作成・参加・開く・「行った」の API のテスト。
// 改造した画面を想定したリクエストが断られること（docs/design/permissions.md の × の欄）と、
// 通るべき人が通ること（断りすぎていないこと）を確かめる
import { beforeAll, describe, expect, it } from "vitest";
import { KeyUnavailableError } from "../src/firebase-auth";
import { TurnstileUnavailableError } from "../src/turnstile";
import { call, create, env, join, otherKey, setup, token } from "./helpers";

beforeAll(setup);

let n = 0;
/** テストごとに別の uid を使う（テストどうしでデータベースを共有しているため） */
const newUid = () => `uid-${++n}-${Date.now()}`;

describe("ID トークン（NFR-006 (10)）", () => {
  const post = async (t: string) =>
    call("POST", "/api/groups", { token: t, body: { groupName: "偽物", name: "ゆう", turnstileToken: "ok" } });

  it("別の Firebase のプロジェクトのトークン（署名は同じ Google の鍵）は 401", async () => {
    const r = await post(await token(newUid(), { aud: "evil-project", iss: "https://securetoken.google.com/evil-project" }));
    expect(r).toEqual({ status: 401, json: { error: "invalid_token" } });
  });

  it("alg が RS256 でない・知らない kid・sub が空・auth_time が未来は 401", async () => {
    const t = Math.floor(Date.now() / 1000);
    const { SignJWT } = await import("jose");
    const hs = await new SignJWT({ sub: "x" }).setProtectedHeader({ alg: "HS256", kid: "test-kid" }).sign(new Uint8Array(32));
    expect((await post(hs)).json).toEqual({ error: "invalid_token" });
    expect((await post(await token(newUid(), {}, undefined, "unknown-kid"))).json).toEqual({ error: "invalid_token" });
    expect((await post(await token("", {}))).json).toEqual({ error: "invalid_token" });
    expect((await post(await token(newUid(), { auth_time: t + 3600 }))).json).toEqual({ error: "invalid_token" });
    const made = await env.DB.prepare("SELECT count(*) AS n FROM groups WHERE name = '偽物'").first<{ n: number }>();
    expect(made!.n).toBe(0);
  });

  it("Firebase のプロジェクトIDが設定されていなければ、全部 401 にせず 503 で止める", async () => {
    const r = await call("POST", "/api/groups", {
      token: await token(newUid()),
      env: { FIREBASE_PROJECT_ID: "" as never },
      body: { groupName: "旅行部", name: "ゆう", turnstileToken: "ok" },
    });
    expect(r).toEqual({ status: 503, json: { error: "unavailable", reason: "temporary" } });
  });

  it("トークンなしはログインなしとして通る", async () => {
    const r = await call("POST", "/api/groups", { body: { groupName: "旅行部", name: "ゆう", turnstileToken: "ok" } });
    expect(r.status).toBe(201);
  });

  it("署名の誤ったトークンは、ログインなしに落とさず 401", async () => {
    const r = await call("POST", "/api/groups", {
      token: await token(newUid(), {}, await otherKey()),
      body: { groupName: "旅行部", name: "ゆう", turnstileToken: "ok" },
    });
    expect(r).toEqual({ status: 401, json: { error: "invalid_token" } });
  });

  it("期限切れのトークンも 401（グループは作られない）", async () => {
    const t = Math.floor(Date.now() / 1000);
    const r = await call("POST", "/api/groups", {
      token: await token(newUid(), { iat: t - 7200, exp: t - 3600 }),
      body: { groupName: "期限切れ", name: "ゆう", turnstileToken: "ok" },
    });
    expect(r.status).toBe(401);
    const made = await env.DB.prepare("SELECT count(*) AS n FROM groups WHERE name = '期限切れ'").first<{ n: number }>();
    expect(made!.n).toBe(0);
  });

  it("Bearer の形でない Authorization も 401（NFR-006 (10)）", async () => {
    const r = await call("GET", "/api/health", { headers: { Authorization: "Basic abc" } });
    expect(r.status).toBe(401);
  });

  it("公開鍵が取れないときは 503（一時的な失敗）", async () => {
    const r = await call("GET", "/api/health", {
      token: await token(newUid()),
      deps: {
        getKey: async () => {
          throw new KeyUnavailableError("test");
        },
      },
    });
    expect(r).toEqual({ status: 503, json: { error: "unavailable", reason: "temporary" } });
  });

  it("確認待ちの人は、ログインなしとして扱う（作ったメンバーは紐づかない）", async () => {
    const uid = newUid();
    const { groupId } = await create("ゆう", { token: await token(uid, { email_verified: false }) });
    const linked = await env.DB.prepare("SELECT uid FROM members WHERE group_id = ?").bind(groupId).first<{ uid: string | null }>();
    expect(linked!.uid).toBeNull();
    expect(await env.DB.prepare("SELECT 1 FROM accounts WHERE uid = ?").bind(uid).first()).toBeNull();
  });

  it("確認待ちの人が参加しても、紐づかず、アカウントの行も作られない", async () => {
    const uid = newUid();
    const { groupId } = await create();
    const r = await join(groupId, "たろう", await token(uid, { email_verified: false }));
    expect(r.status).toBe(201);
    const m = await env.DB.prepare("SELECT uid FROM members WHERE id = ?").bind(r.json.memberId).first<{ uid: string | null }>();
    expect(m!.uid).toBeNull();
    expect(await env.DB.prepare("SELECT 1 FROM accounts WHERE uid = ?").bind(uid).first()).toBeNull();
  });
});

describe("目印のヘッダー（よそのサイトから読ませない）", () => {
  it("X-Tabikaigi がなければ、D1 を読まずに 400", async () => {
    const { groupId } = await create();
    const r = await call("GET", `/api/groups/${groupId}`, { headers: { "X-Tabikaigi": "" } });
    expect(r).toEqual({ status: 400, json: { error: "bad_request" } });
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
    expect(bad.status).toBe(403);
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
  it("ログインなしで作ると、作成者のメンバー（紐づいていない）になる", async () => {
    const { groupId, memberId } = await create("ゆう");
    expect(groupId).toMatch(/^[A-Za-z0-9]{22}$/);
    const r = await call("GET", `/api/groups/${groupId}`);
    expect(r.json.members).toEqual([{ id: memberId, name: "ゆう", color: 0, isOwner: true, linked: false, isMe: false }]);
  });

  it("ログイン済みで作ると、作成者のメンバーが最初から紐づく", async () => {
    const t = await token(newUid());
    const { groupId } = await create("ゆう", { token: t });
    const r = await call("GET", `/api/groups/${groupId}`, { token: t });
    expect(r.json.members[0]).toMatchObject({ isOwner: true, linked: true, isMe: true });
  });

  it("名前とグループ名の決まり（REQ-009・REQ-010）：空白だけ、長すぎは 400", async () => {
    const post = (groupName: unknown, name: unknown) => call("POST", "/api/groups", { body: { groupName, name, turnstileToken: "ok" } });
    expect((await post("旅行部", "　 ")).status).toBe(400);
    expect((await post("旅行部", "あ".repeat(11))).status).toBe(400);
    expect((await post("あ".repeat(21), "ゆう")).status).toBe(400);
    expect((await post(123, "ゆう")).status).toBe(400);
    // 見た目は1文字でも、記号を何百も重ねた名前は 400（データベースのエラーにしない）
    expect((await post("旅行部", "a" + "́".repeat(300))).json).toEqual({ error: "bad_name" });
    expect((await post("旅行部", "👨‍👩‍👧".repeat(10))).status).toBe(201);
  });

  it("前後の空白は取り除いて保存する", async () => {
    const { groupId } = await create("　ゆう ");
    const r = await call("GET", `/api/groups/${groupId}`);
    expect(r.json.members[0].name).toBe("ゆう");
  });

  it("11グループ目は 409 group_limit（NFR-006 (13)）", async () => {
    const t = await token(newUid());
    for (let i = 0; i < 10; i++) await create("ゆう", { token: t });
    const r = await call("POST", "/api/groups", { token: t, body: { groupName: "11個目", name: "ゆう", turnstileToken: "ok" } });
    expect(r).toEqual({ status: 409, json: { error: "group_limit" } });
    // batch ごと取り消され、0人のグループが残らない（作成者の印のトリガーの前提）
    const left = await env.DB.prepare("SELECT count(*) AS n FROM groups WHERE name = '11個目'").first<{ n: number }>();
    expect(left!.n).toBe(0);
  });

  it("大きな本文は読まずに断る", async () => {
    const r = await call("POST", "/api/groups", {
      rawBody: JSON.stringify({ groupName: "旅行部", name: "ゆう", turnstileToken: "ok", pad: "x".repeat(10_000) }),
      headers: { "Content-Type": "application/json" },
    });
    expect(r.status).toBe(413);
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

  it("満員でも、すでにいる名前なら group_full でなく name_taken を返す（戻ってくる人：REQ-005・REQ-012）", async () => {
    const uid = `uid-full-${Date.now()}`;
    const t = await token(uid);
    const { groupId, memberId } = await create("ゆう", { token: t });
    for (let i = 2; i <= 20; i++) expect((await join(groupId, `メンバー${i}`)).status).toBe(201);
    expect(await join(groupId, "メンバー2")).toMatchObject({ status: 409, json: { error: "name_taken", linked: false } });
    expect(await join(groupId, "ゆう")).toEqual({
      status: 409,
      json: { error: "name_taken", memberId, linked: true },
    });
    // 全角半角だけが違う名前も、同じ名前として扱う
    expect(await join(groupId, "ﾒﾝﾊﾞｰ2")).toMatchObject({ status: 409, json: { error: "name_taken" } });
    // 自分のメンバーがいる人が別の名前で入ろうとしたら already_member（満員より先に）
    expect(await join(groupId, "べつの名前", t)).toEqual({ status: 409, json: { error: "already_member" } });
    const count = await env.DB.prepare("SELECT count(*) AS n FROM members WHERE group_id = ?").bind(groupId).first<{ n: number }>();
    expect(count!.n).toBe(20);
  });

  it("満員のとき、よそのグループの同じ名前・よそのグループの自分のメンバーでは group_full（グループの範囲で読み直す）", async () => {
    const t = await token(`uid-full-other-${Date.now()}`);
    const other = await create("たろう", { token: t });
    const { groupId } = await create("ゆう");
    for (let i = 2; i <= 20; i++) expect((await join(groupId, `メンバー${i}`)).status).toBe(201);
    expect(await join(groupId, "たろう")).toEqual({ status: 409, json: { error: "group_full" } });
    expect(await join(groupId, "じろう", t)).toEqual({ status: 409, json: { error: "group_full" } });
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
    ];
    for (const [first, second] of same) {
      expect((await join(groupId, first)).status).toBe(201);
      expect(await join(groupId, second)).toMatchObject({ status: 409, json: { error: "name_taken" } });
    }
  });

  it("同じ名前（全角半角・大文字小文字の違いも同じ）は 409 name_taken と、その人の番号と紐づいているか（REQ-011・REQ-012）", async () => {
    const { groupId, memberId } = await create("Yu");
    expect(await join(groupId, "ｙｕ")).toEqual({ status: 409, json: { error: "name_taken", memberId, linked: false } });
  });

  it("紐づいたメンバーと同じ名前は、linked: true（ほかの人は入れない：REQ-013）", async () => {
    const t = await token(newUid());
    const { groupId, memberId } = await create("ゆう", { token: t });
    expect((await join(groupId, "ゆう")).json).toEqual({ error: "name_taken", memberId, linked: true });
  });

  it("ログイン済みで参加すると紐づく。同じグループに2人目は 409 already_member（NFR-006 (9)）", async () => {
    const t = await token(newUid());
    const { groupId } = await create("ゆう");
    expect((await join(groupId, "たろう", t)).status).toBe(201);
    expect(await join(groupId, "じろう", t)).toEqual({ status: 409, json: { error: "already_member" } });
  });

  it("10グループに入っている人は、11グループ目に参加できない（NFR-006 (13)）", async () => {
    const t = await token(newUid());
    for (let i = 0; i < 10; i++) await create("ゆう", { token: t });
    const { groupId } = await create("はなこ");
    expect(await join(groupId, "たろう", t)).toEqual({ status: 409, json: { error: "group_limit" } });
  });
});

describe("グループを開く", () => {
  it("ほかのメンバーの uid を返さない。自分かどうかだけ（NFR-007）", async () => {
    const uidA = newUid();
    const tA = await token(uidA);
    const { groupId } = await create("ゆう", { token: tA });
    await join(groupId, "たろう", await token(newUid()));
    const r = await call("GET", `/api/groups/${groupId}`, { token: tA });
    expect(JSON.stringify(r.json)).not.toContain("uid-");
    expect(r.json.members.map((m: { isMe: boolean; linked: boolean }) => [m.isMe, m.linked])).toEqual([
      [true, true],
      [false, true],
    ]);
  });

  it("紐づいたメンバーの「行った」はアカウントから、ログインなしのメンバーの「行った」はメンバーから読む", async () => {
    const t = await token(newUid());
    const { groupId, memberId: me } = await create("ゆう", { token: t });
    const taro = (await join(groupId, "たろう")).json.memberId as number;
    await call("PUT", `/api/groups/${groupId}/my-visits/13`, { token: t });
    await call("PUT", `/api/groups/${groupId}/members/${taro}/visits/1`);
    const r = await call("GET", `/api/groups/${groupId}`);
    expect(r.json.visits).toEqual(
      expect.arrayContaining([
        { memberId: me, pref: 13 },
        { memberId: taro, pref: 1 },
      ]),
    );
    expect(r.json.visits).toHaveLength(2);
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

  it("「作成者のみ」は、作成者のメンバーがいるときだけ効く（REQ-051）", async () => {
    const { groupId, memberId } = await create();
    await join(groupId, "たろう");
    await env.DB.prepare("UPDATE groups SET manage_by = 'owner' WHERE id = ?").bind(groupId).run();
    expect((await call("GET", `/api/groups/${groupId}`)).json.group).toMatchObject({ manageBy: "owner", ownerOnly: true });
    await env.DB.prepare("DELETE FROM members WHERE id = ?").bind(memberId).run();
    expect((await call("GET", `/api/groups/${groupId}`)).json.group).toMatchObject({ manageBy: "owner", ownerOnly: false });
  });
});

describe("ログインなしのメンバーの「行った」（REQ-016・REQ-023）", () => {
  it("付けて、2回付けても成功、外せる", async () => {
    const { groupId, memberId } = await create();
    const path = `/api/groups/${groupId}/members/${memberId}/visits/13`;
    expect(await call("PUT", path)).toEqual({ status: 200, json: { ok: true } });
    expect((await call("PUT", path)).status).toBe(200);
    expect((await call("DELETE", path)).status).toBe(200);
    expect((await call("DELETE", path)).status).toBe(200);
    expect((await call("GET", `/api/groups/${groupId}`)).json.visits).toEqual([]);
  });

  it("紐づいたメンバーの「行った」は、メンバーの番号では書けない（NFR-006 (1)）", async () => {
    const t = await token(newUid());
    const { groupId, memberId } = await create("ゆう", { token: t });
    // 本人のトークンを付けても、ほかの人でも、メンバーの番号では書けない（アカウントの「行った」に書く）
    expect(await call("PUT", `/api/groups/${groupId}/members/${memberId}/visits/13`)).toEqual({
      status: 403,
      json: { error: "member_linked" },
    });
    expect((await call("PUT", `/api/groups/${groupId}/members/${memberId}/visits/13`, { token: t })).status).toBe(403);
    const rows = await env.DB.prepare("SELECT count(*) AS n FROM member_visits WHERE member_id = ?").bind(memberId).first<{ n: number }>();
    expect(rows!.n).toBe(0);
  });

  it("別のグループのメンバーの番号では書けない（404）", async () => {
    const a = await create();
    const b = await create();
    expect(await call("PUT", `/api/groups/${b.groupId}/members/${a.memberId}/visits/13`)).toEqual({
      status: 404,
      json: { error: "member_not_found" },
    });
  });

  it("ないグループは group_not_found、いないメンバーは member_not_found", async () => {
    const { groupId } = await create();
    expect((await call("PUT", `/api/groups/${"C".repeat(22)}/members/1/visits/13`)).json).toEqual({ error: "group_not_found" });
    expect((await call("DELETE", `/api/groups/${groupId}/members/999999999/visits/13`)).json).toEqual({ error: "member_not_found" });
  });

  it("県の番号とメンバーの番号の形が違えば 400（0、48、小数、文字）", async () => {
    const { groupId, memberId } = await create();
    for (const pref of ["0", "48", "13.5", "1e1", "abc", "013"]) {
      expect((await call("PUT", `/api/groups/${groupId}/members/${memberId}/visits/${pref}`)).status).toBe(400);
    }
    expect((await call("PUT", `/api/groups/${groupId}/members/1.5/visits/13`)).status).toBe(400);
    expect((await call("PUT", `/api/groups/${groupId}/members/-1/visits/13`)).status).toBe(400);
  });
});

describe("ログイン済みの人の「行った」（REQ-030・NFR-006 (2)）", () => {
  it("ログインしていなければ 401 login_required", async () => {
    const { groupId } = await create();
    expect(await call("PUT", `/api/groups/${groupId}/my-visits/13`)).toEqual({ status: 401, json: { error: "login_required" } });
  });

  it("確認待ちの人は書けない（NFR-006 (10)）", async () => {
    const uid = newUid();
    const t = await token(uid);
    const { groupId } = await create("ゆう", { token: t });
    const unverified = await token(uid, { email_verified: false });
    expect(await call("PUT", `/api/groups/${groupId}/my-visits/13`, { token: unverified })).toEqual({
      status: 401,
      json: { error: "login_required" },
    });
  });

  it("自分のアカウントにだけ書く。全グループで共有される", async () => {
    const uid = newUid();
    const t = await token(uid);
    const a = await create("ゆう", { token: t });
    const b = await create("ゆう", { token: t });
    expect((await call("PUT", `/api/groups/${a.groupId}/my-visits/47`, { token: t })).status).toBe(200);
    expect((await call("GET", `/api/groups/${b.groupId}`)).json.visits).toEqual([{ memberId: b.memberId, pref: 47 }]);
  });

  it("自分のメンバーがいないグループからは書けない（404 member_not_found）", async () => {
    const t = await token(newUid());
    await create("ゆう", { token: t }); // アカウントはある
    const other = await create("はなこ");
    expect(await call("PUT", `/api/groups/${other.groupId}/my-visits/13`, { token: t })).toEqual({
      status: 404,
      json: { error: "member_not_found" },
    });
  });

  it("ほかの人の「行った」は、自分のトークンでは変えられない（書くのは自分の uid の行だけ）", async () => {
    const uidA = newUid();
    const tA = await token(uidA);
    const tB = await token(newUid());
    const { groupId } = await create("ゆう", { token: tA });
    await join(groupId, "たろう", tB);
    await call("PUT", `/api/groups/${groupId}/my-visits/13`, { token: tA });
    await call("DELETE", `/api/groups/${groupId}/my-visits/13`, { token: tB });
    const row = await env.DB.prepare("SELECT 1 FROM account_visits WHERE uid = ? AND pref = 13").bind(uidA).first();
    expect(row).not.toBeNull();
  });
});

describe("そのほか", () => {
  it("知らない API は JSON の 404（api.md の共通の決まり）", async () => {
    expect(await call("GET", "/api/nothing")).toEqual({ status: 404, json: { error: "not_found" } });
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
