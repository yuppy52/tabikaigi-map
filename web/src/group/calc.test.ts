// グループの画面の計算のテスト。グループIDの形（screens の「API の応答と画面の動き」）、
// まとめの数え方（REQ-016・REQ-053・REQ-020）、県の詳細の並び（REQ-019）、送っている途中の表示（screens の「知らせ」）を確かめる
import { describe, expect, it } from "vitest";
import type { GroupMember, Visit } from "../data/types";
import {
  countVisitedByAnyone,
  defaultFocusMember,
  findMeId,
  initialOf,
  inviteUrl,
  isGroupId,
  memberFills,
  membersByCount,
  prefsOf,
  prefVisitors,
  REGIONS,
  rememberedIsMissing,
  shortPrefName,
  visitedByMember,
  withPending,
} from "./calc";
import { PREF_IDS } from "../map/colors";

const member = (id: number, name: string, extra: Partial<GroupMember> = {}): GroupMember => ({
  id,
  name,
  color: id % 10,
  isOwner: false,
  linked: false,
  isMe: false,
  ...extra,
});

const A = member(1, "あ");
const B = member(2, "い");
const C = member(3, "う");
const members = [A, B, C];
const visits: Visit[] = [
  { memberId: 1, pref: 13 },
  { memberId: 1, pref: 1 },
  { memberId: 2, pref: 13 },
  { memberId: 2, pref: 47 },
  { memberId: 2, pref: 2 },
];

describe("isGroupId：グループIDの形（英数字22文字）", () => {
  it("英数字22文字なら通す", () => {
    expect(isGroupId("abcdefghijABCDEFGHIJ01")).toBe(true);
    expect(isGroupId("0000000000000000000000")).toBe(true);
  });

  it("21文字・23文字・空は通さない", () => {
    expect(isGroupId("abcdefghijABCDEFGHIJ0")).toBe(false);
    expect(isGroupId("abcdefghijABCDEFGHIJ012")).toBe(false);
    expect(isGroupId("")).toBe(false);
  });

  it("英数字でない文字（記号、/、全角、空白）が入っていれば通さない", () => {
    expect(isGroupId("abcdefghijABCDEFGHIJ0-")).toBe(false);
    expect(isGroupId("abcdefghijABCDEFGHIJ0_")).toBe(false);
    expect(isGroupId("abcdefghijABCDEFGHI/01")).toBe(false);
    expect(isGroupId("abcdefghijABCDEFGHIJ0Ａ")).toBe(false);
    expect(isGroupId("abcdefghijABCDEFGHIJ0 ")).toBe(false);
  });

  it("後ろに改行が付いていても通さない（$ が改行の前で合うことを使わない）", () => {
    expect(isGroupId("abcdefghijABCDEFGHIJ01\n")).toBe(false);
  });
});

describe("shortPrefName：一覧の短い県名", () => {
  it("北海道はそのまま、都・府・県は取る", () => {
    expect(shortPrefName("北海道")).toBe("北海道");
    expect(shortPrefName("東京都")).toBe("東京");
    expect(shortPrefName("大阪府")).toBe("大阪");
    expect(shortPrefName("京都府")).toBe("京都");
    expect(shortPrefName("神奈川県")).toBe("神奈川");
  });
});

describe("REGIONS：地方ごとの一覧", () => {
  it("47県がちょうど1回ずつ、番号の順に入っている", () => {
    expect(REGIONS.flatMap((r) => r.prefs)).toEqual(PREF_IDS);
  });
});

describe("findMeId：自分のメンバー", () => {
  it("端末が覚えている番号がグループにいれば、その人", () => {
    expect(findMeId(members, 2)).toBe(2);
  });

  it("覚えていない、または覚えている番号がグループにいなければ null", () => {
    expect(findMeId(members, null)).toBeNull();
    expect(findMeId(members, 99)).toBeNull();
  });

  it("ログイン済みで紐づいたメンバー（isMe）がいれば、覚えている番号より先", () => {
    expect(findMeId([A, member(2, "い", { isMe: true }), C], 1)).toBe(2);
  });
});

describe("prefsOf・visitedByMember：メンバーごとの行った県", () => {
  it("その人の県だけを番号の順に、重なりなしで返す", () => {
    expect(prefsOf([...visits, { memberId: 1, pref: 13 }], 1)).toEqual([1, 13]);
  });

  it("メンバーの並びのまま返す。行った県がない人は空", () => {
    expect(visitedByMember(members, visits)).toEqual([[1, 13], [2, 13, 47], []]);
  });
});

describe("countVisitedByAnyone：誰かが行った県の数", () => {
  it("2人が行った県も1つと数える", () => {
    expect(countVisitedByAnyone(members, visits)).toBe(4);
  });

  it("グループにいないメンバーの「行った」は数えない", () => {
    expect(countVisitedByAnyone(members, [...visits, { memberId: 9, pref: 30 }])).toBe(4);
  });

  it("誰も行っていなければ0", () => {
    expect(countVisitedByAnyone(members, [])).toBe(0);
  });
});

describe("membersByCount：メンバーごとの数と多い順", () => {
  it("多い順に並び、数が付く", () => {
    expect(membersByCount(members, visits).map((r) => [r.member.id, r.count])).toEqual([
      [2, 3],
      [1, 2],
      [3, 0],
    ]);
  });

  it("同じ数なら元の並びのまま", () => {
    const tie: Visit[] = [
      { memberId: 3, pref: 5 },
      { memberId: 1, pref: 6 },
    ];
    expect(membersByCount(members, tie).map((r) => r.member.id)).toEqual([1, 3, 2]);
  });
});

describe("prefVisitors：県の詳細の並び", () => {
  it("行った人が先、同じ側の中は元の並びのまま。行った人数を返す", () => {
    const { rows, count } = prefVisitors([C, A, B], visits, 13);
    expect(rows.map((r) => [r.member.id, r.visited])).toEqual([
      [1, true],
      [2, true],
      [3, false],
    ]);
    expect(count).toBe(2);
  });

  it("誰も行っていない県は0人で、全員が「まだ」", () => {
    const { rows, count } = prefVisitors(members, visits, 30);
    expect(count).toBe(0);
    expect(rows.every((r) => !r.visited)).toBe(true);
  });
});

describe("withPending：送っている途中の付け外しを重ねる", () => {
  it("付ける途中の県は、自分の「行った」に足して見せる", () => {
    const shown = withPending(visits, 1, new Map([[30, true]]));
    expect(prefsOf(shown, 1)).toEqual([1, 13, 30]);
  });

  it("外す途中の県は、自分の「行った」から消して見せる。ほかの人の同じ県は残す", () => {
    const shown = withPending(visits, 1, new Map([[13, false]]));
    expect(prefsOf(shown, 1)).toEqual([1]);
    expect(prefsOf(shown, 2)).toEqual([2, 13, 47]);
  });

  it("付けた県をもう一度付ける途中でも、2回は入らない", () => {
    const shown = withPending(visits, 1, new Map([[13, true]]));
    expect(shown.filter((v) => v.memberId === 1 && v.pref === 13)).toHaveLength(1);
  });

  it("途中のものがない、または自分がいなければ、保存できた「行った」のまま", () => {
    expect(withPending(visits, 1, new Map())).toEqual(visits);
    expect(withPending(visits, null, new Map([[30, true]]))).toEqual(visits);
  });

  it("元の一覧は書き換えない（失敗したら元に戻せるように）", () => {
    const before = structuredClone(visits);
    withPending(visits, 1, new Map([[13, false]]));
    expect(visits).toEqual(before);
  });
});

describe("defaultFocusMember：メンバー別の最初の人", () => {
  it("自分以外の最初の人", () => {
    expect(defaultFocusMember(members, 1)).toBe(2);
    expect(defaultFocusMember(members, 2)).toBe(1);
  });

  it("自分しかいなければ自分、自分がいなければ最初の人、誰もいなければ null", () => {
    expect(defaultFocusMember([A], 1)).toBe(1);
    expect(defaultFocusMember(members, null)).toBe(1);
    expect(defaultFocusMember([], null)).toBeNull();
  });
});

describe("memberFills：わたし・メンバー別の塗り", () => {
  it("行った県だけをその人の色で塗り、ほかの県は入れない（--land のまま）", () => {
    expect(memberFills([1, 13], "#E0692F")).toEqual({ 1: "#E0692F", 13: "#E0692F" });
  });

  it("1〜47 でない番号は塗らない", () => {
    expect(memberFills([0, 48, 5], "#000")).toEqual({ 5: "#000" });
  });
});

describe("initialOf：アイコンの1文字", () => {
  it("名前の最初の1文字。2つで1文字の絵文字も割らない", () => {
    expect(initialOf("たろう")).toBe("た");
    expect(initialOf("😀ゆう")).toBe("😀");
    expect(initialOf("")).toBe("");
  });
});

describe("rememberedIsMissing：覚えていたメンバーがグループにいないか（REQ-025）", () => {
  it("覚えていた番号がいなければ true（そのグループの覚えを忘れて、参加のシートに文を出す）", () => {
    expect(rememberedIsMissing(members, 9)).toBe(true);
  });

  it("いれば false。覚えていなければ（初めて開いたのと同じ）false", () => {
    expect(rememberedIsMissing(members, 2)).toBe(false);
    expect(rememberedIsMissing(members, null)).toBe(false);
  });
});

describe("inviteUrl：招待URL", () => {
  it("/g/グループID に、LINE の中から外部ブラウザで開かせる ?openExternalBrowser=1 を付ける", () => {
    expect(inviteUrl("https://tabikaigi.example", "abcdefghijABCDEFGHIJ01")).toBe(
      "https://tabikaigi.example/g/abcdefghijABCDEFGHIJ01?openExternalBrowser=1",
    );
    expect(inviteUrl("http://localhost:5173", "abcdefghijABCDEFGHIJ01")).toBe(
      "http://localhost:5173/g/abcdefghijABCDEFGHIJ01?openExternalBrowser=1",
    );
  });
});
