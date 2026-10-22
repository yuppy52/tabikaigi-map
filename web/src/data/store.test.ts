// 保存のところの、localStorage の中身を読む計算のテスト。壊れた・形の違う中身でも画面を止めず、
// 「覚えていない」「最初の状態」として続けられるかを確かめる（.claude/rules/web.md、auth-flow の「端末が覚えるもの」）
import { describe, expect, it } from "vitest";
import { applyVisit, parseStoredVisits, pickRememberedMember, withRememberedMember } from "./store";

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
