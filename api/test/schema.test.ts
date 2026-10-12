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

/** グループと、作成者のメンバー（最初のメンバー）を作る */
async function createGroup(ownerUid: string | null = null) {
  const id = newId();
  await db().batch([
    db().prepare("INSERT INTO groups (id, name, last_opened_on, room_key) VALUES (?, '旅行部', '2026-10-12', ?)").bind(id, rk(id)),
    db()
      .prepare("INSERT INTO members (group_id, name, name_key, color, is_owner, uid) VALUES (?, 'ゆう', 'ゆう', 0, 1, ?)")
      .bind(id, ownerUid),
  ]);
  return id;
}

async function addAccount(uid: string) {
  await db().prepare("INSERT INTO accounts (uid) VALUES (?) ON CONFLICT (uid) DO NOTHING").bind(uid).run();
}

function addMember(groupId: string, name: string, opts: { uid?: string | null; isOwner?: 0 | 1; color?: number } = {}) {
  return db()
    .prepare("INSERT INTO members (group_id, name, name_key, color, is_owner, uid) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(groupId, name, name, opts.color ?? 1, opts.isOwner ?? 0, opts.uid ?? null)
    .run();
}

async function count(sql: string, ...args: unknown[]) {
  return (await db().prepare(sql).bind(...args).first<{ n: number }>())!.n;
}

describe("groups", () => {
  it("グループIDが短いと断る（NFR-005）", async () => {
    await expect(
      db().prepare("INSERT INTO groups (id, name, last_opened_on, room_key) VALUES ('short', '旅行部', '2026-10-12', ?)").bind(rk("short")).run(),
    ).rejects.toThrow(/CHECK/);
  });

  it("グループ名が空や長すぎると断る（NFR-006 (8)）", async () => {
    const insert = (name: string) =>
      db().prepare("INSERT INTO groups (id, name, last_opened_on, room_key) VALUES (?, ?, '2026-10-12', ?)").bind(newId(), name, rk(`r-${seq}`)).run();
    await expect(insert("")).rejects.toThrow(/CHECK/);
    await expect(insert("あ".repeat(401))).rejects.toThrow(/CHECK/);
    await expect(insert("あ".repeat(400))).resolves.toBeTruthy();
  });

  it("管理できる人は everyone か owner だけ（REQ-044）", async () => {
    const id = await createGroup();
    await expect(db().prepare("UPDATE groups SET manage_by = 'admin' WHERE id = ?").bind(id).run()).rejects.toThrow(/CHECK/);
  });

  it("最後に開かれた日は空にできない（Q-025）", async () => {
    await expect(
      db().prepare("INSERT INTO groups (id, name, room_key) VALUES (?, '旅行部', ?)").bind(newId(), rk(`r-${seq}`)).run(),
    ).rejects.toThrow(/NOT NULL/);
  });

  it("room_key は重複できない（Q-031）", async () => {
    const insert = () =>
      db().prepare("INSERT INTO groups (id, name, last_opened_on, room_key) VALUES (?, '旅行部', '2026-10-12', ?)").bind(newId(), rk("same-room")).run();
    await insert();
    await expect(insert()).rejects.toThrow(/UNIQUE/);
  });

  it("グループを消すと、メンバーとその「行った」も消え、アカウントの「行った」は残る（REQ-047）", async () => {
    await addAccount("uid-delete-group");
    await db().prepare("INSERT INTO account_visits (uid, pref) VALUES ('uid-delete-group', 13)").run();
    const id = await createGroup("uid-delete-group");
    await addMember(id, "たろう");
    const memberId = (await db().prepare("SELECT id FROM members WHERE group_id = ? AND name = 'たろう'").bind(id).first<{ id: number }>())!.id;
    await db().prepare("INSERT INTO member_visits (member_id, pref) VALUES (?, 1)").bind(memberId).run();

    await db().prepare("DELETE FROM groups WHERE id = ?").bind(id).run();

    expect(await count("SELECT count(*) AS n FROM members WHERE group_id = ?", id)).toBe(0);
    expect(await count("SELECT count(*) AS n FROM member_visits WHERE member_id = ?", memberId)).toBe(0);
    expect(await count("SELECT count(*) AS n FROM account_visits WHERE uid = 'uid-delete-group'")).toBe(1);
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

  it("1つのグループで、1つのアカウントに紐づくメンバーは1人だけ（NFR-006 (9)）", async () => {
    await addAccount("uid-one-per-group");
    const id = await createGroup("uid-one-per-group");
    await expect(addMember(id, "たろう", { uid: "uid-one-per-group" })).rejects.toThrow(/UNIQUE/);
  });

  it("ログインなしのメンバー（uid が NULL）は何人でもよい", async () => {
    const id = await createGroup();
    await addMember(id, "たろう");
    await addMember(id, "はなこ");
    expect(await count("SELECT count(*) AS n FROM members WHERE group_id = ? AND uid IS NULL", id)).toBe(3);
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

  it("ないアカウントには紐づけられない（外部キー）", async () => {
    const id = await createGroup();
    await expect(addMember(id, "たろう", { uid: "uid-not-created" })).rejects.toThrow(/FOREIGN KEY/);
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

describe("作成者（NFR-006 (4)、ADR 0005）", () => {
  it("作成者の印は後から付けられない", async () => {
    const id = await createGroup();
    await addMember(id, "たろう");
    await expect(
      db().prepare("UPDATE members SET is_owner = 1 WHERE group_id = ? AND name = 'たろう'").bind(id).run(),
    ).rejects.toThrow(/member_fixed/);
  });

  it("作成者の印は外せない", async () => {
    const id = await createGroup();
    await expect(
      db().prepare("UPDATE members SET is_owner = 0 WHERE group_id = ? AND is_owner = 1").bind(id).run(),
    ).rejects.toThrow(/member_fixed/);
  });

  it("2人目以降を作成者として入れられない", async () => {
    const id = await createGroup();
    await expect(addMember(id, "たろう", { isOwner: 1 })).rejects.toThrow(/owner_first_only/);
  });

  it("作成者が退出した後に、印付きのメンバーを入れて作成者を復活させられない", async () => {
    const id = await createGroup();
    await addMember(id, "たろう");
    await db().prepare("DELETE FROM members WHERE group_id = ? AND is_owner = 1").bind(id).run();
    expect(await count("SELECT count(*) AS n FROM members WHERE group_id = ? AND is_owner = 1", id)).toBe(0);
    await expect(addMember(id, "ゆう", { isOwner: 1 })).rejects.toThrow(/owner_first_only/);
  });

  it("トリガーがなくても、部分 UNIQUE で作成者は1グループに1人まで", async () => {
    // トリガーで先に止まるので、このテストの中だけトリガーを外して索引そのものを確かめ、最後に元に戻す
    // （テストどうしでデータベースを共有しているため、戻さないと後のテストが変わる）
    const id = await createGroup();
    const trigger = (await db()
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'members_owner_first_only'")
      .first<{ sql: string }>())!.sql;
    await db().prepare("DROP TRIGGER members_owner_first_only").run();
    try {
      await expect(addMember(id, "たろう", { isOwner: 1 })).rejects.toThrow(/UNIQUE constraint failed: members\.group_id/);
    } finally {
      await db().prepare(trigger).run();
    }
    await expect(addMember(id, "はなこ", { isOwner: 1 })).rejects.toThrow(/owner_first_only/);
  });

  it("作成者のメンバーを別のグループに移して、作成者を作り直せない", async () => {
    const a = await createGroup();
    const b = await createGroup();
    await addMember(b, "たろう");
    await db().prepare("DELETE FROM members WHERE group_id = ? AND is_owner = 1").bind(b).run();
    await expect(
      db().prepare("UPDATE members SET group_id = ? WHERE group_id = ? AND is_owner = 1").bind(b, a).run(),
    ).rejects.toThrow(/member_fixed/);
  });

  it("作成者のメンバーへの紐づけは、印のトリガーに引っかからない", async () => {
    await addAccount("uid-owner-link");
    const id = await createGroup();
    await expect(
      db().prepare("UPDATE members SET uid = 'uid-owner-link' WHERE group_id = ? AND is_owner = 1 AND uid IS NULL").bind(id).run(),
    ).resolves.toBeTruthy();
    expect(await count("SELECT count(*) AS n FROM members WHERE group_id = ? AND is_owner = 1 AND uid = 'uid-owner-link'", id)).toBe(1);
  });

  it("作成者でないメンバーの名前の変更は、印のトリガーに引っかからない", async () => {
    await addAccount("uid-rename");
    const id = await createGroup();
    await addMember(id, "たろう", { uid: "uid-rename" });
    await expect(
      db().prepare("UPDATE members SET name = 'じろう', name_key = 'じろう' WHERE group_id = ? AND uid = 'uid-rename'").bind(id).run(),
    ).resolves.toBeTruthy();
  });
});

describe("紐づけ（NFR-006 (3)(9)）", () => {
  it("紐づいたメンバーを別のアカウントに付け替えられない", async () => {
    await addAccount("uid-a");
    await addAccount("uid-b");
    const id = await createGroup("uid-a");
    await expect(
      db().prepare("UPDATE members SET uid = 'uid-b' WHERE group_id = ? AND uid = 'uid-a'").bind(id).run(),
    ).rejects.toThrow(/uid_fixed/);
  });

  it("紐づけを外せない", async () => {
    await addAccount("uid-unlink");
    const id = await createGroup("uid-unlink");
    await expect(
      db().prepare("UPDATE members SET uid = NULL WHERE group_id = ? AND uid = 'uid-unlink'").bind(id).run(),
    ).rejects.toThrow(/uid_fixed/);
  });

  it("同じグループで、2人目のメンバーを同じアカウントに紐づけられない", async () => {
    await addAccount("uid-link-twice");
    const id = await createGroup("uid-link-twice");
    await addMember(id, "たろう");
    await expect(
      db().prepare("UPDATE members SET uid = 'uid-link-twice' WHERE group_id = ? AND name = 'たろう'").bind(id).run(),
    ).rejects.toThrow(/UNIQUE constraint failed: members\.group_id, members\.uid/);
  });

  it("名前を変えて、同じグループのほかの人と同じ名前にできない（REQ-014）", async () => {
    await addAccount("uid-rename-dup");
    const id = await createGroup();
    await addMember(id, "たろう", { uid: "uid-rename-dup" });
    await expect(
      db().prepare("UPDATE members SET name = 'ゆう', name_key = 'ゆう' WHERE group_id = ? AND uid = 'uid-rename-dup'").bind(id).run(),
    ).rejects.toThrow(/UNIQUE constraint failed: members\.group_id, members\.name_key/);
  });
});

describe("10グループまで（NFR-006 (13)、REQ-060）", () => {
  async function inTenGroups(uid: string) {
    await addAccount(uid);
    const ids: string[] = [];
    for (let i = 0; i < 10; i++) ids.push(await createGroup(uid));
    return ids;
  }

  it("11グループ目を作ると断り、グループも作られない（batch ごと取り消し）", async () => {
    const uid = "uid-limit-create";
    await inTenGroups(uid);
    const before = await count("SELECT count(*) AS n FROM groups");
    await expect(createGroup(uid)).rejects.toThrow(/group_limit/);
    expect(await count("SELECT count(*) AS n FROM groups")).toBe(before);
  });

  it("11グループ目に紐づいたメンバーとして参加できない", async () => {
    const uid = "uid-limit-join";
    await inTenGroups(uid);
    const other = await createGroup();
    await expect(addMember(other, "たろう", { uid })).rejects.toThrow(/group_limit/);
  });

  it("11グループ目のメンバーに紐づけられない", async () => {
    const uid = "uid-limit-link";
    await inTenGroups(uid);
    const other = await createGroup();
    await expect(
      db().prepare("UPDATE members SET uid = ? WHERE group_id = ? AND uid IS NULL").bind(uid, other).run(),
    ).rejects.toThrow(/group_limit/);
  });

  it("10グループに入っている人も、名前を変えられる（自分の行を数えて断らない）", async () => {
    const uid = "uid-limit-rename";
    const [first] = await inTenGroups(uid);
    await expect(
      db().prepare("UPDATE members SET name = 'ゆうき', name_key = 'ゆうき' WHERE group_id = ? AND uid = ?").bind(first, uid).run(),
    ).resolves.toBeTruthy();
  });

  it("1つ抜ければ、また入れる", async () => {
    const uid = "uid-limit-leave";
    const [first] = await inTenGroups(uid);
    await db().prepare("DELETE FROM members WHERE group_id = ? AND uid = ?").bind(first, uid).run();
    await expect(createGroup(uid)).resolves.toBeTruthy();
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

    await addAccount("uid-pref");
    await expect(db().prepare("INSERT INTO account_visits (uid, pref) VALUES ('uid-pref', 0)").run()).rejects.toThrow(/CHECK/);
  });

  it("同じ県を2回付けても1行（ON CONFLICT DO NOTHING）", async () => {
    const id = await createGroup();
    const memberId = (await db().prepare("SELECT id FROM members WHERE group_id = ?").bind(id).first<{ id: number }>())!.id;
    const insert = () =>
      db().prepare("INSERT INTO member_visits (member_id, pref) VALUES (?, 13) ON CONFLICT (member_id, pref) DO NOTHING").bind(memberId).run();
    await insert();
    await insert();
    expect(await count("SELECT count(*) AS n FROM member_visits WHERE member_id = ?", memberId)).toBe(1);
  });

  it("ON CONFLICT DO NOTHING でも、範囲外の県は断る（OR IGNORE と違って CHECK を飲み込まない）", async () => {
    const id = await createGroup();
    const memberId = (await db().prepare("SELECT id FROM members WHERE group_id = ?").bind(id).first<{ id: number }>())!.id;
    await expect(
      db().prepare("INSERT INTO member_visits (member_id, pref) VALUES (?, 99) ON CONFLICT (member_id, pref) DO NOTHING").bind(memberId).run(),
    ).rejects.toThrow(/CHECK/);
  });
});

describe("退会（REQ-036）", () => {
  it("accounts の行を消すと、アカウントの「行った」と紐づいたメンバー（作成者の印も）が消える", async () => {
    const uid = "uid-withdraw";
    await addAccount(uid);
    await db().prepare("INSERT INTO account_visits (uid, pref) VALUES (?, 1), (?, 2)").bind(uid, uid).run();
    const id = await createGroup(uid);
    await addMember(id, "たろう");

    await db().prepare("DELETE FROM accounts WHERE uid = ?").bind(uid).run();

    expect(await count("SELECT count(*) AS n FROM account_visits WHERE uid = ?", uid)).toBe(0);
    expect(await count("SELECT count(*) AS n FROM members WHERE uid = ?", uid)).toBe(0);
    expect(await count("SELECT count(*) AS n FROM members WHERE group_id = ? AND is_owner = 1", id)).toBe(0);
    expect(await count("SELECT count(*) AS n FROM members WHERE group_id = ?", id)).toBe(1);
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
    await expect(db().prepare("INSERT INTO member_visits (member_id, pref) VALUES (?, 13.5)").bind(memberId).run()).rejects.toThrow(/CHECK constraint failed: .*pref/);
    await addAccount("uid-real");
    await expect(db().prepare("INSERT INTO account_visits (uid, pref) VALUES ('uid-real', 1.0000001)").run()).rejects.toThrow(/CHECK constraint failed: .*pref/);
    await expect(addMember(id, "たろう", { color: 2.5 })).rejects.toThrow(/CHECK constraint failed: .*color/);
  });

  it("JavaScript の数（13）は整数として入る", async () => {
    const id = await createGroup();
    const memberId = (await db().prepare("SELECT id FROM members WHERE group_id = ?").bind(id).first<{ id: number }>())!.id;
    await expect(db().prepare("INSERT INTO member_visits (member_id, pref) VALUES (?, ?)").bind(memberId, 13).run()).resolves.toBeTruthy();
  });

  it("作成者の印は 0 か 1 だけ", async () => {
    const id = newId();
    await db().prepare("INSERT INTO groups (id, name, last_opened_on, room_key) VALUES (?, '旅行部', '2026-10-12', ?)").bind(id, rk(id)).run();
    await expect(addMember(id, "ゆう", { isOwner: 2 as 1 })).rejects.toThrow(/CHECK constraint failed: .*is_owner/);
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

  it("アカウントの uid は1〜128文字", async () => {
    const insert = (uid: string) => db().prepare("INSERT INTO accounts (uid) VALUES (?)").bind(uid).run();
    await expect(insert("")).rejects.toThrow(/CHECK constraint failed: .*uid/);
    await expect(insert("u".repeat(129))).rejects.toThrow(/CHECK constraint failed: .*uid/);
    await expect(insert("u".repeat(128))).resolves.toBeTruthy();
  });

  it("「行った」は、ないメンバー・ないアカウントには付けられない（外部キー）", async () => {
    await expect(db().prepare("INSERT INTO member_visits (member_id, pref) VALUES (999999, 1)").run()).rejects.toThrow(/FOREIGN KEY/);
    await expect(db().prepare("INSERT INTO account_visits (uid, pref) VALUES ('uid-none', 1)").run()).rejects.toThrow(/FOREIGN KEY/);
  });

  it("アカウントの「行った」も県は 1〜47 だけ", async () => {
    await addAccount("uid-pref48");
    await expect(db().prepare("INSERT INTO account_visits (uid, pref) VALUES ('uid-pref48', 48)").run()).rejects.toThrow(/CHECK constraint failed: .*pref/);
  });
});

describe("NOT NULL", () => {
  it("SQLite の CHECK は NULL を通すので、NOT NULL で空の行を断る", async () => {
    const id = await createGroup();
    await expect(
      db().prepare("INSERT INTO members (group_id, name, name_key, color) VALUES (?, NULL, 'x', 0)").bind(id).run(),
    ).rejects.toThrow(/NOT NULL/);
    await expect(
      db().prepare("INSERT INTO member_visits (member_id, pref) VALUES (1, NULL)").run(),
    ).rejects.toThrow(/NOT NULL/);
  });
});
