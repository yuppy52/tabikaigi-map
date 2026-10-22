// API につなぐまでの仮のグループ（Phase 2 の 3-4）。モックの demo() の「夏旅2026」と3人、「行った」をそのまま写した。
// 色はモックの COLORS[1]〜[3] と同じく、10色の表の番号 1・2・3。API につないだら、このファイルは消す
import type { GroupView, RememberedMember, Visit } from "./types";

const DEMO_VISITED: readonly { id: number; name: string; color: number; prefs: readonly number[] }[] = [
  { id: 1, name: "たろう", color: 1, prefs: [1, 2, 4, 8, 11, 12, 13, 14, 19, 20, 22, 23, 26, 27, 28, 34, 40, 47] },
  { id: 2, name: "はなこ", color: 2, prefs: [4, 7, 9, 10, 11, 12, 13, 14, 17, 22, 24, 26, 27, 29, 33, 37, 42, 43, 47] },
  { id: 3, name: "けんじ", color: 3, prefs: [1, 11, 12, 13, 14, 15, 20, 21, 23, 25, 26, 27, 28, 31, 32, 35, 40, 41, 44, 46] },
];

// グループ名とメンバー（「行った」以外）。作成者はたろうにしておく（画面ではまだ使わない）
export const DEMO_GROUP: Omit<GroupView, "visits"> = {
  group: { name: "夏旅2026", manageBy: "everyone", ownerOnly: false },
  members: DEMO_VISITED.map((m) => ({ id: m.id, name: m.name, color: m.color, isOwner: m.id === 1, linked: false, isMe: false })),
};

// 「行った」の最初の状態
export const DEMO_VISITS: readonly Visit[] = DEMO_VISITED.flatMap((m) => m.prefs.map((pref) => ({ memberId: m.id, pref })));

// 初めて開いたときに、端末が覚えるメンバー
export const DEMO_ME: RememberedMember = { memberId: 1, name: "たろう" };
