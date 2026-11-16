// D1 の制約のテスト（docs/design/data-model.md の「制約と索引」、NFR-006）。
// API を通さずに SQL を直接流し、改造した画面や API の間違いがあっても、データベースが断ることを確かめる
import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

const db = () => env.DB;

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

let seq = 0;
/** テストごとに別のグループIDを作る（テストどうしが混ざらないように） */
function newId() {
  seq += 1;
  return `test-group-${String(seq).padStart(10, "0")}`;
}

/** 部屋の URL に使う値（本物は SHA-256 の16進64文字。テストでは長さだけ合わせる） */
function rk(seed: string) {
  return seed.padEnd(64, "0").slice(0, 64);
}

/** グループと、最初のメンバー（ゆう）を作る */
async function createGroup() {
  const id = newId();
  await db().batch([
    db().prepare("INSERT INTO groups (id, name, last_opened_on, room_key) VALUES (?, '旅行部', '2026-10-12', ?)").bind(id, rk(id)),
    db().prepare("INSERT INTO members (group_id, name, name_key, color) VALUES (?, 'ゆう', 'ゆう', 0)").bind(id),
  ]);
  return id;
}

function addMember(groupId: string, name: string, opts: { color?: number } = {}) {
  return db()
    .prepare("INSERT INTO members (group_id, name, name_key, color) VALUES (?, ?, ?, ?)")
    .bind(groupId, name, name, opts.color ?? 1)
    .run();
}

/** 最初のメンバー（ゆう）の番号 */
async function firstMemberId(groupId: string) {
  return (await db().prepare("SELECT id FROM members WHERE group_id = ? ORDER BY id LIMIT 1").bind(groupId).first<{ id: number }>())!.id;
}

async function count(sql: string, ...args: unknown[]) {
  return (await db()
    .prepare(sql)
    .bind(...args)
    .first<{ n: number }>())!.n;
}

describe("groups", () => {
  it("グループIDが短いと断る（NFR-005）", async () => {
    await expect(
      db()
        .prepare("INSERT INTO groups (id, name, last_opened_on, room_key) VALUES ('short', '旅行部', '2026-10-12', ?)")
        .bind(rk("short"))
        .run(),
    ).rejects.toThrow(/CHECK/);
  });

  it("グループ名が空や長すぎると断る（NFR-006 (8)）", async () => {
    const insert = (name: string) =>
      db()
        .prepare("INSERT INTO groups (id, name, last_opened_on, room_key) VALUES (?, ?, '2026-10-12', ?)")
        .bind(newId(), name, rk(`r-${seq}`))
        .run();
    await expect(insert("")).rejects.toThrow(/CHECK/);
    await expect(insert("あ".repeat(401))).rejects.toThrow(/CHECK/);
    await expect(insert("あ".repeat(400))).resolves.toBeTruthy();
  });

  it("最後に開かれた日は空にできない（Q-025）", async () => {
    await expect(
      db()
        .prepare("INSERT INTO groups (id, name, room_key) VALUES (?, '旅行部', ?)")
        .bind(newId(), rk(`r-${seq}`))
        .run(),
    ).rejects.toThrow(/NOT NULL/);
  });

  it("room_key は重複できない（Q-031）", async () => {
    const insert = () =>
      db()
        .prepare("INSERT INTO groups (id, name, last_opened_on, room_key) VALUES (?, '旅行部', '2026-10-12', ?)")
        .bind(newId(), rk("same-room"))
        .run();
    await insert();
    await expect(insert()).rejects.toThrow(/UNIQUE/);
  });

  it("グループを消すと、メンバーとその「行った」も消える（REQ-047）", async () => {
    const id = await createGroup();
    await addMember(id, "たろう");
    const memberId = (await db().prepare("SELECT id FROM members WHERE group_id = ? AND name = 'たろう'").bind(id).first<{ id: number }>())!
      .id;
    await db().prepare("INSERT INTO member_visits (member_id, pref) VALUES (?, 1)").bind(memberId).run();

    await db().prepare("DELETE FROM groups WHERE id = ?").bind(id).run();

    expect(await count("SELECT count(*) AS n FROM members WHERE group_id = ?", id)).toBe(0);
    expect(await count("SELECT count(*) AS n FROM member_visits WHERE member_id = ?", memberId)).toBe(0);
  });
});

describe("グループの固定の列（groups_fixed）", () => {
  it("グループID・room_key・作った日時は後から変えられない", async () => {
    const id = await createGroup();
    const update = (set: string, value: string) => db().prepare(`UPDATE groups SET ${set} = ? WHERE id = ?`).bind(value, id).run();
    await expect(update("id", `${id}-moved`)).rejects.toThrow(/group_fixed/);
    await expect(update("room_key", rk("other-room"))).rejects.toThrow(/group_fixed/);
    await expect(update("created_at", "2000-01-01T00:00:00Z")).rejects.toThrow(/group_fixed/);
  });

  it("グループ名と最後に開かれた日は書き換えられる（正しい操作がある）", async () => {
    const id = await createGroup();
    await expect(db().prepare("UPDATE groups SET name = '旅の会' WHERE id = ?").bind(id).run()).resolves.toBeTruthy();
    await expect(db().prepare("UPDATE groups SET last_opened_on = '2026-11-10' WHERE id = ?").bind(id).run()).resolves.toBeTruthy();
    expect(await db().prepare("SELECT name, last_opened_on FROM groups WHERE id = ?").bind(id).first()).toEqual({
      name: "旅の会",
      last_opened_on: "2026-11-10",
    });
  });
});

describe("members", () => {
  it("同じグループで同じ name_key は断る（NFR-006 (11)）", async () => {
    const id = await createGroup();
    await expect(addMember(id, "ゆう")).rejects.toThrow(/UNIQUE/);
  });

  it("別のグループなら同じ名前でよい", async () => {
    const a = await createGroup();
    const b = await createGroup();
    await expect(addMember(a, "たろう")).resolves.toBeTruthy();
    await expect(addMember(b, "たろう")).resolves.toBeTruthy();
  });

  it("名前が違えば、同じグループに何人でも入れる（20人まで）", async () => {
    const id = await createGroup();
    await addMember(id, "たろう");
    await addMember(id, "はなこ");
    expect(await count("SELECT count(*) AS n FROM members WHERE group_id = ?", id)).toBe(3);
  });

  it("名前が空や長すぎると断る（NFR-006 (8)）", async () => {
    const id = await createGroup();
    await expect(addMember(id, "")).rejects.toThrow(/CHECK/);
    await expect(addMember(id, "あ".repeat(201))).rejects.toThrow(/CHECK/);
  });

  it("色は 0〜9 だけ（REQ-021）", async () => {
    const id = await createGroup();
    await expect(addMember(id, "たろう", { color: 10 })).rejects.toThrow(/CHECK/);
    await expect(addMember(id, "はなこ", { color: -1 })).rejects.toThrow(/CHECK/);
  });

  it("ないグループには入れない（外部キー）", async () => {
    await expect(addMember("no-such-group-000000", "たろう")).rejects.toThrow(/FOREIGN KEY/);
  });

  it("番号を使い回さない（消したメンバーの番号に、後から入った人が入らない）", async () => {
    const id = await createGroup();
    await addMember(id, "たろう");
    const first = (await db().prepare("SELECT max(id) AS n FROM members").first<{ n: number }>())!.n;
    await db().prepare("DELETE FROM members WHERE id = ?").bind(first).run();
    await addMember(id, "たろう");
    const second = (await db().prepare("SELECT max(id) AS n FROM members").first<{ n: number }>())!.n;
    expect(second).toBeGreaterThan(first);
  });
});

describe("メンバーの固定の列（members_fixed）", () => {
  it("番号は後から変えられない", async () => {
    const id = await createGroup();
    const memberId = await firstMemberId(id);
    await expect(
      db()
        .prepare("UPDATE members SET id = ? WHERE id = ?")
        .bind(memberId + 1000000, memberId)
        .run(),
    ).rejects.toThrow(/member_fixed/);
  });

  it("参加日時は後から変えられない", async () => {
    const id = await createGroup();
    await expect(db().prepare("UPDATE members SET created_at = '2000-01-01T00:00:00Z' WHERE group_id = ?").bind(id).run()).rejects.toThrow(
      /member_fixed/,
    );
  });

  it("メンバーを別のグループに移して、20人の上限をすり抜けられない（NFR-006 (8)）", async () => {
    const full = await createGroup();
    for (let i = 2; i <= 20; i++) await addMember(full, `メンバー${i}`);
    const other = await createGroup();
    await addMember(other, "たろう");
    await expect(
      db().prepare("UPDATE members SET group_id = ? WHERE group_id = ? AND name = 'たろう'").bind(full, other).run(),
    ).rejects.toThrow(/member_fixed/);
    expect(await count("SELECT count(*) AS n FROM members WHERE group_id = ?", full)).toBe(20);
  });

  it("名前の書き換えは断らない（運営者が削除の依頼で手で直すため：data-model.md）。同じ名前の重複は UNIQUE で断る", async () => {
    const id = await createGroup();
    await addMember(id, "たろう");
    await expect(
      db().prepare("UPDATE members SET name = 'じろう', name_key = 'じろう' WHERE group_id = ? AND name = 'たろう'").bind(id).run(),
    ).resolves.toBeTruthy();
    await expect(
      db().prepare("UPDATE members SET name = 'ゆう', name_key = 'ゆう' WHERE group_id = ? AND name = 'じろう'").bind(id).run(),
    ).rejects.toThrow(/UNIQUE constraint failed: members\.group_id, members\.name_key/);
  });
});

describe("「行った」", () => {
  it("県の番号は 1〜47 だけ", async () => {
    const id = await createGroup();
    const memberId = (await db().prepare("SELECT id FROM members WHERE group_id = ?").bind(id).first<{ id: number }>())!.id;
    const insert = (pref: number) => db().prepare("INSERT INTO member_visits (member_id, pref) VALUES (?, ?)").bind(memberId, pref).run();
    await expect(insert(0)).rejects.toThrow(/CHECK/);
    await expect(insert(48)).rejects.toThrow(/CHECK/);
    await expect(insert(47)).resolves.toBeTruthy();
  });

  it("同じ県を2回付けても1行（ON CONFLICT DO NOTHING）", async () => {
    const id = await createGroup();
    const memberId = (await db().prepare("SELECT id FROM members WHERE group_id = ?").bind(id).first<{ id: number }>())!.id;
    const insert = () =>
      db()
        .prepare("INSERT INTO member_visits (member_id, pref) VALUES (?, 13) ON CONFLICT (member_id, pref) DO NOTHING")
        .bind(memberId)
        .run();
    await insert();
    await insert();
    expect(await count("SELECT count(*) AS n FROM member_visits WHERE member_id = ?", memberId)).toBe(1);
  });

  it("ON CONFLICT DO NOTHING でも、範囲外の県は断る（OR IGNORE と違って CHECK を飲み込まない）", async () => {
    const id = await createGroup();
    const memberId = (await db().prepare("SELECT id FROM members WHERE group_id = ?").bind(id).first<{ id: number }>())!.id;
    await expect(
      db()
        .prepare("INSERT INTO member_visits (member_id, pref) VALUES (?, 99) ON CONFLICT (member_id, pref) DO NOTHING")
        .bind(memberId)
        .run(),
    ).rejects.toThrow(/CHECK/);
  });
});

describe("20人まで（NFR-006 (8)、REQ-005）", () => {
  it("21人目は断る（API の確かめが抜けたときの最後の守り）", async () => {
    const id = await createGroup();
    for (let i = 2; i <= 20; i++) await addMember(id, `メンバー${i}`);
    expect(await count("SELECT count(*) AS n FROM members WHERE group_id = ?", id)).toBe(20);
    await expect(addMember(id, "21人目")).rejects.toThrow(/group_full/);
  });
});

describe("値の形（API の入口の確かめが抜けたときの最後の守り）", () => {
  it("県と色は整数だけ（13.5 を通すと、1人で何行でも書けてしまう）", async () => {
    const id = await createGroup();
    const memberId = (await db().prepare("SELECT id FROM members WHERE group_id = ?").bind(id).first<{ id: number }>())!.id;
    await expect(db().prepare("INSERT INTO member_visits (member_id, pref) VALUES (?, 13.5)").bind(memberId).run()).rejects.toThrow(
      /CHECK constraint failed: .*pref/,
    );
    await expect(addMember(id, "たろう", { color: 2.5 })).rejects.toThrow(/CHECK constraint failed: .*color/);
  });

  it("JavaScript の数（13）は整数として入る", async () => {
    const id = await createGroup();
    const memberId = (await db().prepare("SELECT id FROM members WHERE group_id = ?").bind(id).first<{ id: number }>())!.id;
    await expect(db().prepare("INSERT INTO member_visits (member_id, pref) VALUES (?, ?)").bind(memberId, 13).run()).resolves.toBeTruthy();
  });

  it("名前にバイナリの値は入らない", async () => {
    const id = await createGroup();
    await expect(
      db().prepare("INSERT INTO members (group_id, name, name_key, color) VALUES (?, x'00', 'bin', 1)").bind(id).run(),
    ).rejects.toThrow(/CHECK constraint failed: .*name/);
  });

  it("name_key だけが長すぎても断る", async () => {
    const id = await createGroup();
    await expect(
      db().prepare("INSERT INTO members (group_id, name, name_key, color) VALUES (?, 'たろう', ?, 1)").bind(id, "あ".repeat(201)).run(),
    ).rejects.toThrow(/CHECK constraint failed: .*name_key/);
  });

  it("グループIDは64文字まで、room_key は64文字、最後に開かれた日は YYYY-MM-DD", async () => {
    const insert = (gid: string, room: string, day: string) =>
      db().prepare("INSERT INTO groups (id, name, last_opened_on, room_key) VALUES (?, '旅行部', ?, ?)").bind(gid, day, room).run();
    await expect(insert("a".repeat(65), rk("long-id"), "2026-10-12")).rejects.toThrow(/CHECK constraint failed: .*id/);
    await expect(insert(newId(), "short-room", "2026-10-12")).rejects.toThrow(/CHECK constraint failed: .*room_key/);
    await expect(insert(newId(), rk(`day-${seq}`), "x")).rejects.toThrow(/CHECK constraint failed: .*last_opened_on/);
  });

  it("「行った」は、ないメンバーには付けられない（外部キー）", async () => {
    await expect(db().prepare("INSERT INTO member_visits (member_id, pref) VALUES (999999, 1)").run()).rejects.toThrow(/FOREIGN KEY/);
  });
});

describe("NOT NULL", () => {
  it("SQLite の CHECK は NULL を通すので、NOT NULL で空の行を断る", async () => {
    const id = await createGroup();
    await expect(
      db().prepare("INSERT INTO members (group_id, name, name_key, color) VALUES (?, NULL, 'x', 0)").bind(id).run(),
    ).rejects.toThrow(/NOT NULL/);
    await expect(db().prepare("INSERT INTO member_visits (member_id, pref) VALUES (1, NULL)").run()).rejects.toThrow(/NOT NULL/);
  });
});
