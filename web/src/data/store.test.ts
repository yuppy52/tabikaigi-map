// 保存のところの、localStorage の中身を読む計算のテスト。壊れた・形の違う中身でも画面を止めず、
// 「覚えていない」「最初の状態」として続けられるかを確かめる（.claude/rules/web.md、auth-flow の「端末が覚えるもの」）
import { describe, expect, it } from "vitest";
import type { GroupMember } from "./types";
import {
  applyVisit,
  joinDemoGroup,
  parseStoredGroup,
  parseStoredVisits,
  pickColor,
  pickRememberedMember,
  serializeGroup,
  withoutRememberedMember,
  withRememberedMember,
} from "./store";

const G1 = "abcdefghijABCDEFGHIJ01";
const G2 = "abcdefghijABCDEFGHIJ02";

describe("parseStoredVisits：仮の「行った」を読む", () => {
  it("正しい形なら、そのまま返す", () => {
    expect(parseStoredVisits('[{"memberId":1,"pref":13},{"memberId":2,"pref":47}]', [1, 2])).toEqual([
      { memberId: 1, pref: 13 },
      { memberId: 2, pref: 47 },
    ]);
  });

  it("空の一覧は、全部外したあとの状態として返す（最初の状態に戻さない）", () => {
    expect(parseStoredVisits("[]", [1])).toEqual([]);
  });

  it("保存がない、JSON でない、一覧でないときは null（呼ぶ側が最初の状態にする）", () => {
    expect(parseStoredVisits(null, [1])).toBeNull();
    expect(parseStoredVisits("{", [1])).toBeNull();
    expect(parseStoredVisits('{"memberId":1}', [1])).toBeNull();
  });

  it("県が 1〜47 の整数でない、いないメンバー、形の違う行が1つでもあれば null", () => {
    expect(parseStoredVisits('[{"memberId":1,"pref":48}]', [1])).toBeNull();
    expect(parseStoredVisits('[{"memberId":1,"pref":0}]', [1])).toBeNull();
    expect(parseStoredVisits('[{"memberId":1,"pref":1.5}]', [1])).toBeNull();
    expect(parseStoredVisits('[{"memberId":1,"pref":"13"}]', [1])).toBeNull();
    expect(parseStoredVisits('[{"memberId":9,"pref":13}]', [1])).toBeNull();
    expect(parseStoredVisits("[null]", [1])).toBeNull();
  });

  it("同じものが2回あれば1つにする", () => {
    expect(parseStoredVisits('[{"memberId":1,"pref":13},{"memberId":1,"pref":13}]', [1])).toEqual([{ memberId: 1, pref: 13 }]);
  });
});

describe("pickRememberedMember：端末が覚えているメンバーを読む", () => {
  const stored = JSON.stringify({ [G1]: { memberId: 1, name: "たろう" } });

  it("そのグループの番号と名前を返す", () => {
    expect(pickRememberedMember(stored, G1)).toEqual({ memberId: 1, name: "たろう" });
  });

  it("ほかのグループの分は返さない（グループごとに1人ずつ）", () => {
    expect(pickRememberedMember(stored, G2)).toBeNull();
  });

  it("保存がない、壊れている、形が違うときは「覚えていない」", () => {
    expect(pickRememberedMember(null, G1)).toBeNull();
    expect(pickRememberedMember("{", G1)).toBeNull();
    expect(pickRememberedMember("[]", G1)).toBeNull();
    expect(pickRememberedMember(JSON.stringify({ [G1]: { memberId: "1", name: "たろう" } }), G1)).toBeNull();
    expect(pickRememberedMember(JSON.stringify({ [G1]: { memberId: 0, name: "たろう" } }), G1)).toBeNull();
    expect(pickRememberedMember(JSON.stringify({ [G1]: { memberId: 1 } }), G1)).toBeNull();
  });

  it("オブジェクトがもともと持つ名前（__proto__ など）をグループIDとして読まない", () => {
    expect(pickRememberedMember("{}", "__proto__")).toBeNull();
    expect(pickRememberedMember("{}", "constructor")).toBeNull();
  });
});

describe("withRememberedMember：端末が覚えるメンバーを書き足す", () => {
  it("ほかのグループの分を残して、そのグループの分を足す", () => {
    const before = JSON.stringify({ [G1]: { memberId: 1, name: "たろう" } });
    const after = withRememberedMember(before, G2, { memberId: 5, name: "はなこ" });
    expect(pickRememberedMember(after, G1)).toEqual({ memberId: 1, name: "たろう" });
    expect(pickRememberedMember(after, G2)).toEqual({ memberId: 5, name: "はなこ" });
  });

  it("番号と名前のほかは書かない", () => {
    const after = withRememberedMember(null, G1, { memberId: 1, name: "たろう", extra: 1 } as never);
    expect(JSON.parse(after)).toEqual({ [G1]: { memberId: 1, name: "たろう" } });
  });

  it("壊れた中身は作り直す", () => {
    expect(JSON.parse(withRememberedMember("{", G1, { memberId: 1, name: "たろう" }))).toEqual({ [G1]: { memberId: 1, name: "たろう" } });
  });
});

describe("applyVisit：「行った」を1件付ける・外す", () => {
  const visits = [
    { memberId: 1, pref: 13 },
    { memberId: 2, pref: 13 },
  ];

  it("付ける。すでに付いていれば2回は入れない", () => {
    expect(applyVisit(visits, 1, 1, true)).toEqual([...visits, { memberId: 1, pref: 1 }]);
    expect(applyVisit(visits, 1, 13, true).filter((v) => v.memberId === 1 && v.pref === 13)).toHaveLength(1);
  });

  it("外す。ほかの人の同じ県は残す。付いていなければ何も変わらない", () => {
    expect(applyVisit(visits, 1, 13, false)).toEqual([{ memberId: 2, pref: 13 }]);
    expect(applyVisit(visits, 1, 5, false)).toEqual(visits);
  });
});

describe("withoutRememberedMember：そのグループの覚えを忘れる（REQ-025）", () => {
  it("そのグループの分だけを消し、ほかのグループの分は残す", () => {
    const before = JSON.stringify({ [G1]: { memberId: 1, name: "たろう" }, [G2]: { memberId: 5, name: "はなこ" } });
    const after = withoutRememberedMember(before, G1);
    expect(pickRememberedMember(after, G1)).toBeNull();
    expect(pickRememberedMember(after, G2)).toEqual({ memberId: 5, name: "はなこ" });
  });

  it("覚えていないグループなら何も変わらない。壊れた中身は空にする", () => {
    const before = JSON.stringify({ [G2]: { memberId: 5, name: "はなこ" } });
    expect(JSON.parse(withoutRememberedMember(before, G1))).toEqual(JSON.parse(before));
    expect(JSON.parse(withoutRememberedMember("{", G1))).toEqual({});
    expect(JSON.parse(withoutRememberedMember(null, G1))).toEqual({});
  });

  it("参加・作成で覚えて、合わないときに忘れると、そのグループは「覚えていない」に戻る", () => {
    const joined = withRememberedMember(null, G1, { memberId: 4, name: "さくら" });
    expect(pickRememberedMember(joined, G1)).toEqual({ memberId: 4, name: "さくら" });
    expect(pickRememberedMember(withoutRememberedMember(joined, G1), G1)).toBeNull();
  });
});

const gm = (id: number, name: string, color: number, isOwner = false): GroupMember => ({
  id,
  name,
  color,
  isOwner,
  linked: false,
  isMe: false,
});

describe("parseStoredGroup・serializeGroup：仮のグループを保存して読み戻す", () => {
  const g = {
    group: { name: "卒業旅行", manageBy: "everyone" as const, ownerOnly: false },
    members: [gm(1, "さくら", 0, true), gm(2, "ゆう", 1)],
  };

  it("保存した形を読み戻すと、同じグループになる", () => {
    expect(parseStoredGroup(serializeGroup(g))).toEqual(g);
  });

  it("保存がない、壊れている、形が違うときは null（呼ぶ側は「夏旅2026」にする）", () => {
    expect(parseStoredGroup(null)).toBeNull();
    expect(parseStoredGroup("{")).toBeNull();
    expect(parseStoredGroup("[]")).toBeNull();
    expect(parseStoredGroup(JSON.stringify({ name: "a", members: [] }))).toBeNull();
    expect(parseStoredGroup(JSON.stringify({ name: 1, members: [{ id: 1, name: "a", color: 0, isOwner: true }] }))).toBeNull();
    expect(parseStoredGroup(JSON.stringify({ name: "a", members: [{ id: 0, name: "a", color: 0, isOwner: true }] }))).toBeNull();
    expect(parseStoredGroup(JSON.stringify({ name: "a", members: [{ id: 1, name: "a", color: 10, isOwner: true }] }))).toBeNull();
    expect(parseStoredGroup(JSON.stringify({ name: "a", members: [{ id: 1, name: "a", color: 0 }] }))).toBeNull();
  });

  it("同じ番号のメンバーが2人いれば null", () => {
    const text = JSON.stringify({
      name: "a",
      members: [
        { id: 1, name: "a", color: 0, isOwner: true },
        { id: 1, name: "b", color: 1, isOwner: false },
      ],
    });
    expect(parseStoredGroup(text)).toBeNull();
  });
});

describe("pickColor：新しいメンバーの色（REQ-021、API と同じ選び方）", () => {
  it("使われていない色のうち、番号の小さい色", () => {
    expect(pickColor([])).toBe(0);
    expect(pickColor([0, 1, 3])).toBe(2);
  });

  it("10色とも使われていれば、使っている人が一番少ない色（同じなら番号の小さい色）", () => {
    expect(pickColor([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1])).toBe(2);
    expect(pickColor([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])).toBe(0);
  });
});

describe("joinDemoGroup：仮のグループに名前で参加する", () => {
  const g = {
    group: { name: "夏旅", manageBy: "everyone" as const, ownerOnly: false },
    members: [gm(1, "たろう", 1, true), gm(3, "Yu", 0)],
  };

  it("同じ名前がいなければ、一番大きい番号の次の番号で足す（色は使われていない一番小さい番号）", () => {
    const r = joinDemoGroup(g, "さくら");
    expect(r).toEqual({ status: "joined", memberId: 4, group: { ...g, members: [...g.members, gm(4, "さくら", 2)] } });
  });

  it("同じ名前（全角と半角、大文字と小文字の違いは同じとみなす）がいれば、足さずにその人を返す", () => {
    expect(joinDemoGroup(g, "ｙｕ")).toEqual({ status: "name_taken", memberId: 3, linked: false });
    expect(joinDemoGroup(g, "たろう")).toEqual({ status: "name_taken", memberId: 1, linked: false });
  });

  it("ひらがなとカタカナは別の名前として足す", () => {
    expect(joinDemoGroup(g, "タロウ").status).toBe("joined");
  });
});
