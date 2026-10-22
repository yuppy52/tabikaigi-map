// 画面が受け取るデータの形。API の「グループを開いたときの応答」（docs/design/api.md、api/src/groups.ts の GroupView）と同じにする。
// api/ の型をそのまま読み込まないのは、api/ が Workers の型（D1Database など）に頼っていて、画面の型の設定では読めないため。
// API の形を変えたら、ここも同じ変更の中で直す

export type GroupMember = {
  id: number;
  name: string;
  // 10色の番号（0〜9）。色の文字列は memberColor で引く
  color: number;
  isOwner: boolean;
  linked: boolean;
  // ログイン済みの人に紐づいたメンバーか（ログインなしの人では、いつも false）
  isMe: boolean;
};

export type Visit = { memberId: number; pref: number };

export type GroupView = {
  group: { name: string; manageBy: "everyone" | "owner"; ownerOnly: boolean };
  members: GroupMember[];
  visits: Visit[];
};

// 端末が覚えているメンバー（auth-flow の「端末が覚えるもの」：グループIDごとに番号と名前だけ）
export type RememberedMember = { memberId: number; name: string };

// グループを作ったときの応答（API の POST /api/groups の 201 と同じ）
export type CreatedGroup = { groupId: string; memberId: number };

// 参加したときの結果。入れた（API の 201）か、同じ名前の人がいた（API の 409 name_taken。その人の番号と、紐づいているか）
export type JoinResult = { status: "joined"; memberId: number } | { status: "name_taken"; memberId: number; linked: boolean };
