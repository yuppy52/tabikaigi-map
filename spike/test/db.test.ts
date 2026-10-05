// D1 の決まりのテスト（ADR 0003 の「D1 の『読んで、判断して、書く』」「D1 の制約」）
import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { createGroup, joinGroup, leaveGroup, MAX_MEMBERS, setVisited } from "../src/db";
import { checkName, nameKey } from "../src/names";


const db = () => env.DB;

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

async function memberCount(groupId: string) {
  return (await db().prepare("SELECT count(*) AS n FROM members WHERE group_id = ?").bind(groupId).first<{ n: number }>())!.n;
}
async function groupExists(groupId: string) {
  return (await db().prepare("SELECT 1 FROM groups WHERE id = ?").bind(groupId).first()) !== null;
}
async function ownerOf(groupId: string) {
  return (await db().prepare("SELECT owner_member_id AS o FROM groups WHERE id = ?").bind(groupId).first<{ o: number | null }>())!.o;
}

describe("名前の決まり（REQ-009〜REQ-011）", () => {
  it("全角と半角、大文字と小文字は同じ名前とみなす", () => {
    expect(nameKey("ＹＵ")).toBe(nameKey("yu"));
    expect(nameKey("ｶﾀｶﾅ")).toBe(nameKey("カタカナ"));
    expect(nameKey("ｳﾞ")).toBe(nameKey("ヴ"));
    expect(nameKey("Ａ　Ｂ")).toBe(nameKey("a b"));
  });
  it("ひらがなとカタカナ、漢字とかなは別の名前", () => {
    expect(nameKey("ゆう")).not.toBe(nameKey("ユウ"));
    expect(nameKey("優")).not.toBe(nameKey("ゆう"));
  });
  it("前後の空白を除いて1〜10文字。絵文字の家族は1文字", () => {
    expect(checkName("  ゆう　", 10)).toEqual({ ok: true, name: "ゆう" });
    expect(checkName("　 ", 10)).toEqual({ ok: false, reason: "empty" });
    expect(checkName("👨‍👩‍👧".repeat(10), 10).ok).toBe(true);
    expect(checkName("あ".repeat(11), 10)).toEqual({ ok: false, reason: "too_long" });
  });
});

describe("グループの作成と作成者", () => {
  it("作った人が最初のメンバーで、作成者になる", async () => {
    const { groupId, memberId } = await createGroup(db(), "旅行部", "ゆう");
    expect(await memberCount(groupId)).toBe(1);
    expect(await ownerOf(groupId)).toBe(memberId);
  });

  it("作成者が退出したら、作成者は空になる（ON DELETE SET NULL）", async () => {
    const { groupId, memberId } = await createGroup(db(), "旅行部", "ゆう");
    await joinGroup(db(), groupId, "たろう");
    await leaveGroup(db(), groupId, memberId);
    expect(await ownerOf(groupId)).toBeNull();
  });

  it("作成者が抜けた後に同じ名前で入り直しても、作成者には戻らない（番号を使い回さない）", async () => {
    const { groupId, memberId } = await createGroup(db(), "旅行部", "ゆう");
    await joinGroup(db(), groupId, "たろう");
    await leaveGroup(db(), groupId, memberId);
    const again = await joinGroup(db(), groupId, "ゆう");
    expect(again.ok && again.memberId).not.toBe(memberId);
    expect(await ownerOf(groupId)).toBeNull();
  });
});

describe("参加（REQ-005・NFR-006 (8)(9)(11)）", () => {
  it("同じ名前（全角・大文字の違いだけ）は断る", async () => {
    const { groupId } = await createGroup(db(), "g", "Yu");
    expect(await joinGroup(db(), groupId, "ｙｕ")).toEqual({ ok: false, reason: "name_taken" });
  });

  it("ログインなしの人（uid が NULL）は何人いてもよい", async () => {
    const { groupId } = await createGroup(db(), "g", "a");
    expect((await joinGroup(db(), groupId, "b")).ok).toBe(true);
    expect((await joinGroup(db(), groupId, "c")).ok).toBe(true);
  });

  it("同じアカウントの2人目のメンバーは断る", async () => {
    const { groupId } = await createGroup(db(), "g", "a", "uid-1");
    expect(await joinGroup(db(), groupId, "b", "uid-1")).toEqual({ ok: false, reason: "already_linked" });
  });

  it("別のグループなら、同じアカウントでも入れる", async () => {
    await createGroup(db(), "g1", "a", "uid-2");
    const { groupId } = await createGroup(db(), "g2", "x");
    expect((await joinGroup(db(), groupId, "a", "uid-2")).ok).toBe(true);
  });

  it("ないグループには入れない", async () => {
    expect(await joinGroup(db(), "NoSuchGroup0000000000000", "a")).toEqual({ ok: false, reason: "no_group" });
  });

  it("21人が同時に参加しても、ちょうど20人で止まる", async () => {
    const { groupId } = await createGroup(db(), "g", "m0");
    const results = await Promise.all(
      Array.from({ length: MAX_MEMBERS }, (_, i) => joinGroup(db(), groupId, `m${i + 1}`)),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(MAX_MEMBERS - 1);
    expect(results.filter((r) => !r.ok && r.reason === "full")).toHaveLength(1);
    expect(await memberCount(groupId)).toBe(MAX_MEMBERS);
  });

  it("データベースの上限：長すぎる名前は API を通らなくても入らない", async () => {
    const { groupId } = await createGroup(db(), "g", "a");
    await expect(
      db().prepare("INSERT INTO members (group_id, name, name_key) VALUES (?, ?, ?)").bind(groupId, "あ".repeat(41), "x").run(),
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  it("データベースの上限：uid に空の文字は入れられない", async () => {
    const { groupId } = await createGroup(db(), "g", "a");
    await expect(
      db().prepare("INSERT INTO members (group_id, name, name_key, uid) VALUES (?, 'b', 'b', '')").bind(groupId).run(),
    ).rejects.toThrow(/CHECK constraint failed/);
  });
});

describe("退出とグループの削除（Q-010）", () => {
  it("最後の1人が退出したら、グループも消える", async () => {
    const { groupId, memberId } = await createGroup(db(), "g", "a");
    await leaveGroup(db(), groupId, memberId);
    expect(await groupExists(groupId)).toBe(false);
  });

  it("最後の2人が同時に退出しても、0人のグループは残らない", async () => {
    const { groupId, memberId } = await createGroup(db(), "g", "a");
    const b = await joinGroup(db(), groupId, "b");
    if (!b.ok) throw new Error("参加できなかった");
    await Promise.all([leaveGroup(db(), groupId, memberId), leaveGroup(db(), groupId, b.memberId)]);
    expect(await groupExists(groupId)).toBe(false);
  });

  it("最後の退出と参加が同時でも、親のないメンバーは残らない", async () => {
    for (let i = 0; i < 10; i++) {
      const { groupId, memberId } = await createGroup(db(), "g", "a");
      const [, joined] = await Promise.all([leaveGroup(db(), groupId, memberId), joinGroup(db(), groupId, "b")]);
      const exists = await groupExists(groupId);
      // 参加が先なら、グループは残り b がいる。退出が先なら、グループは消え、参加は no_group
      if (joined.ok) expect(exists && (await memberCount(groupId)) === 1).toBe(true);
      else expect(joined.reason === "no_group" && !exists).toBe(true);
      const orphans = await db().prepare("SELECT count(*) AS n FROM members WHERE group_id NOT IN (SELECT id FROM groups)").first<{ n: number }>();
      expect(orphans!.n).toBe(0);
    }
  });

  it("グループを消すと、メンバーと「行った」も消える（ON DELETE CASCADE）", async () => {
    const { groupId, memberId } = await createGroup(db(), "g", "a");
    await setVisited(db(), memberId, 13, true);
    await db().prepare("DELETE FROM groups WHERE id = ?").bind(groupId).run();
    const v = await db().prepare("SELECT count(*) AS n FROM visits WHERE member_id = ?").bind(memberId).first<{ n: number }>();
    expect(await memberCount(groupId)).toBe(0);
    expect(v!.n).toBe(0);
  });

  it("ないグループにメンバーは作れない（外部キー）", async () => {
    await expect(
      db().prepare("INSERT INTO members (group_id, name, name_key) VALUES ('NoSuchGroup0000000000000', 'a', 'a')").run(),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/);
  });

  it("batch の途中で失敗したら、前の文も取り消される", async () => {
    const { groupId } = await createGroup(db(), "g", "a");
    await expect(
      db().batch([
        db().prepare("INSERT INTO members (group_id, name, name_key) VALUES (?, 'b', 'b')").bind(groupId),
        db().prepare("INSERT INTO members (group_id, name, name_key) VALUES (?, 'A', 'a')").bind(groupId), // 重複で失敗
      ]),
    ).rejects.toThrow(/UNIQUE/);
    expect(await memberCount(groupId)).toBe(1);
  });
});

describe("「行った」（NFR-009）", () => {
  it("付けるのを2回押しても1行、外すのを2回押してもエラーにならない", async () => {
    const { memberId } = await createGroup(db(), "g", "a");
    await setVisited(db(), memberId, 1, true);
    await setVisited(db(), memberId, 1, true);
    const n = async () => (await db().prepare("SELECT count(*) AS n FROM visits WHERE member_id = ?").bind(memberId).first<{ n: number }>())!.n;
    expect(await n()).toBe(1);
    await setVisited(db(), memberId, 1, false);
    await setVisited(db(), memberId, 1, false);
    expect(await n()).toBe(0);
  });

  it("県の番号は1〜47だけ", async () => {
    const { memberId } = await createGroup(db(), "g", "a");
    await expect(setVisited(db(), memberId, 48, true)).rejects.toThrow(/CHECK constraint failed/);
  });

  it("（落とし穴の記録）INSERT OR IGNORE だと、CHECK の違反も黙って無視される", async () => {
    const { memberId } = await createGroup(db(), "g", "a");
    const r = await db().prepare("INSERT OR IGNORE INTO visits (member_id, pref) VALUES (?, 48)").bind(memberId).run();
    expect(r.meta.changes).toBe(0); // エラーにならず、0行のまま
  });
});
