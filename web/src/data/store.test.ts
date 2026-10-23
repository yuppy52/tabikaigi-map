// 保存のところの、localStorage の中身を読む計算のテスト。壊れた・形の違う中身でも画面を止めず、
// 「覚えていない」として続けられるかを確かめる（.claude/rules/web.md、auth-flow の「端末が覚えるもの」）
import { describe, expect, it } from "vitest";
import { applyVisit, pickRememberedMember, withoutRememberedMember, withRememberedMember } from "./store";

const G1 = "abcdefghijABCDEFGHIJ01";
const G2 = "abcdefghijABCDEFGHIJ02";

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
