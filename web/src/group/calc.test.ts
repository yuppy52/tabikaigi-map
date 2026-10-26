// グループの画面の計算のテスト。グループIDの形（screens の「API の応答と画面の動き」）、
// まとめの数え方（REQ-016・REQ-053・REQ-020）、県の詳細の並び（REQ-019）、送っている途中の表示（screens の「知らせ」）を確かめる
import { describe, expect, it } from "vitest";
import type { GroupMember, GroupView, Visit } from "../data/types";
import {
  countVisitedByAnyone,
  defaultFocusMember,
  findMeId,
  initialOf,
  inviteUrl,
  isGroupId,
  meRemoved,
  memberFills,
  membersByCount,
  prefsOf,
  prefVisitors,
  REGIONS,
  rememberedIsMissing,
  resolveMe,
  RoomVisitLog,
  roomVisitAction,
  shortPrefName,
  visitedByMember,
  withPending,
  withRoomVisits,
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

describe("resolveMe：グループを開いたときの自分のメンバー", () => {
  it("覚えている番号が紐づいていないメンバーなら、その人", () => {
    expect(resolveMe(members, 2, null)).toEqual({ meId: 2, lostMember: false });
  });

  it("覚えている番号がいなければ、自分はいなくて、覚えを忘れる（REQ-025）", () => {
    expect(resolveMe(members, 9, null)).toEqual({ meId: null, lostMember: true });
  });

  it("覚えている番号のメンバーが紐づいていれば、覚えを消さずに参加のシート（2026-10-23 の仮の動き）", () => {
    expect(resolveMe([A, member(2, "い", { linked: true }), C], 2, null)).toEqual({ meId: null, lostMember: false });
  });

  it("ログイン済みで紐づいたメンバー（isMe）がいれば、覚えている番号より先", () => {
    expect(resolveMe([A, member(2, "い", { linked: true, isMe: true }), C], 9, null)).toEqual({ meId: 2, lostMember: false });
  });

  it("覚えていなければ、作ったメンバーの番号を使う。グループにいない・紐づいているときは使わない", () => {
    expect(resolveMe(members, null, 1)).toEqual({ meId: 1, lostMember: false });
    expect(resolveMe(members, null, 9)).toEqual({ meId: null, lostMember: false });
    expect(resolveMe([member(1, "あ", { linked: true })], null, 1)).toEqual({ meId: null, lostMember: false });
  });

  it("覚えていなくて、作ったメンバーの番号もなければ、自分はいない（初めて開いたのと同じ）", () => {
    expect(resolveMe(members, null, null)).toEqual({ meId: null, lostMember: false });
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

describe("roomVisitAction・meRemoved：部屋から届いたとき（architecture の「部屋が配るもの」、screens の「知らせ」）", () => {
  const members = [member(1, "ゆう"), member(2, "あき")];

  it("知っているメンバーの付け外しは反映、知らないメンバー（あとから参加した人）は読み直す", () => {
    expect(roomVisitAction(members, 2)).toBe("apply");
    expect(roomVisitAction(members, 3)).toBe("refetch");
    expect(roomVisitAction([], 1)).toBe("refetch");
  });

  it("読み直したグループに自分がいなければ、削除された。参加の前（自分がいない）なら false", () => {
    expect(meRemoved(members, 1)).toBe(false);
    expect(meRemoved(members, 3)).toBe(true);
    expect(meRemoved(members, null)).toBe(false);
  });
});

describe("withRoomVisits：読み直しの結果に、その間に届いた付け外しを入れ直す", () => {
  const view = (visits: Visit[]): GroupView => ({
    group: { name: "旅", manageBy: "everyone", ownerOnly: false },
    members: [member(1, "ゆう"), member(2, "あき")],
    visits,
  });

  it("届いた順に入れる（付けて外したら外れたまま、外して付けたら付いたまま）", () => {
    const got = withRoomVisits(view([{ memberId: 1, pref: 13 }]), [
      { memberId: 2, pref: 1, visited: true },
      { memberId: 2, pref: 1, visited: false },
      { memberId: 1, pref: 13, visited: false },
      { memberId: 1, pref: 13, visited: true },
      { memberId: 1, pref: 47, visited: true },
    ]);
    expect(got.visits).toEqual(
      expect.arrayContaining([
        { memberId: 1, pref: 13 },
        { memberId: 1, pref: 47 },
      ]),
    );
    expect(got.visits).toHaveLength(2);
  });

  it("結果のグループにいないメンバーの分は入れない", () => {
    expect(withRoomVisits(view([]), [{ memberId: 9, pref: 13, visited: true }]).visits).toEqual([]);
  });

  it("届いたものがなければ、結果をそのまま返す", () => {
    const v = view([{ memberId: 1, pref: 13 }]);
    expect(withRoomVisits(v, [])).toBe(v);
  });
});

describe("RoomVisitLog：読み直しが飛んでいる間に届いた付け外しを覚える", () => {
  const a = { memberId: 1, pref: 1, visited: true };
  const b = { memberId: 1, pref: 2, visited: true };
  const c = { memberId: 2, pref: 3, visited: false };

  it("読み直しを始めた後に届いた分だけを返す。飛んでいないときに届いた分は覚えない", () => {
    const log = new RoomVisitLog();
    log.record(a);
    const mark = log.start();
    log.record(b);
    log.record(c);
    expect(log.finish(mark)).toEqual([b, c]);
  });

  it("読み直しが重なったら、それぞれ自分が始めた後の分を返す（戻る順が入れ替わっても）", () => {
    const log = new RoomVisitLog();
    const first = log.start();
    log.record(a);
    const second = log.start();
    log.record(b);
    expect(log.finish(second)).toEqual([b]);
    log.record(c);
    expect(log.finish(first)).toEqual([a, b, c]);
  });

  it("飛んでいる読み直しがなくなったら覚えを捨て、次の読み直しには前の分を入れない", () => {
    const log = new RoomVisitLog();
    const m1 = log.start();
    log.record(a);
    expect(log.finish(m1)).toEqual([a]);
    log.record(b); // 飛んでいないので覚えない
    const m2 = log.start();
    log.record(c);
    expect(log.finish(m2)).toEqual([c]);
  });
});
