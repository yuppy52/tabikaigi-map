// 保存のところ。画面はここの関数だけを呼ぶ（中身を API に替えても、画面を変えずに済むように、どれも Promise を返す）。
// いま（Phase 2 の 3-5）は API につなぐ前なので、中身は localStorage と仮のグループ（demo.ts）にしてある。
// 端末が覚えるメンバー（グループIDごとに番号と名前）は本番と同じ形にする（auth-flow の「端末が覚えるもの」）。
// 失敗は Error の message に API の error の値（bad_name、bad_request など）を入れて返す。画面はこの値で文を決める
import { DEMO_GROUP, DEMO_VISITS } from "./demo";
import { newGroupId } from "./ids";
import { checkName, demoNameKey, GROUP_NAME_MAX, MEMBER_NAME_MAX } from "./names";
import type { CreatedGroup, GroupMember, GroupView, JoinResult, RememberedMember, Visit } from "./types";

// 端末が覚えるメンバーのキー。中身は { [グループID]: { memberId, name } }
const MEMBERS_KEY = "tabikaigi-members";
// 仮の「行った」のキー（API につないだら使わない）。グループIDごとに分ける
const demoVisitsKey = (groupId: string) => `tabikaigi-dev-visits:${groupId}`;
// 仮のグループ（グループ名とメンバー）のキー（API につないだら使わない）。作ったグループと、参加して人が増えたグループを置く
const demoGroupKey = (groupId: string) => `tabikaigi-dev-group:${groupId}`;

// 仮のグループの形（「行った」は別のキーに置く）
type DemoGroup = Omit<GroupView, "visits">;

// localStorage は読み書きに失敗することがある（Safari のプライベート、容量）。読めなければ null
function readItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

// 書けたら true
function writeItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

// JSON として読めなければ undefined
function parseJson(text: string | null): unknown {
  if (text === null) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

const isPref = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 47;
const isPositiveInt = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0;
const isColor = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 9;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

// 保存してある仮の「行った」を読む。形が違えば（壊れている、ほかの版が書いた）null を返し、呼ぶ側は最初の状態にする
export function parseStoredVisits(text: string | null, memberIds: readonly number[]): Visit[] | null {
  const data = parseJson(text);
  if (!Array.isArray(data)) return null;
  const visits: Visit[] = [];
  for (const item of data as unknown[]) {
    if (typeof item !== "object" || item === null) return null;
    const { memberId, pref } = item as Record<string, unknown>;
    if (!isPositiveInt(memberId) || !memberIds.includes(memberId) || !isPref(pref)) return null;
    if (!visits.some((v) => v.memberId === memberId && v.pref === pref)) visits.push({ memberId, pref });
  }
  return visits;
}

// 保存してある仮のグループを読む。形が違えば null（呼ぶ側は、いまの仮のグループ「夏旅2026」にする）。
// 書くのは名前・メンバーの番号・名前・色・作成者かだけ。管理の設定と紐づきは、仮の保存ではいつも「誰でも」「紐づいていない」
export function parseStoredGroup(text: string | null): DemoGroup | null {
  const data = parseJson(text);
  if (!isRecord(data) || typeof data.name !== "string" || !Array.isArray(data.members) || data.members.length === 0) return null;
  const members: GroupMember[] = [];
  for (const item of data.members as unknown[]) {
    if (!isRecord(item)) return null;
    const { id, name, color, isOwner } = item;
    if (!isPositiveInt(id) || typeof name !== "string" || !isColor(color) || typeof isOwner !== "boolean") return null;
    if (members.some((m) => m.id === id)) return null;
    members.push({ id, name, color, isOwner, linked: false, isMe: false });
  }
  return { group: { name: data.name, manageBy: "everyone", ownerOnly: false }, members };
}

// 仮のグループを保存する形にする（parseStoredGroup で読み戻せる形）
export function serializeGroup(g: DemoGroup): string {
  return JSON.stringify({
    name: g.group.name,
    members: g.members.map((m) => ({ id: m.id, name: m.name, color: m.color, isOwner: m.isOwner })),
  });
}

// 端末が覚えているメンバーの一覧から、そのグループの分を取り出す。形が違えば「覚えていない」（null）
export function pickRememberedMember(text: string | null, groupId: string): RememberedMember | null {
  const data = parseJson(text);
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  if (!Object.hasOwn(data, groupId)) return null;
  const entry = (data as Record<string, unknown>)[groupId];
  if (typeof entry !== "object" || entry === null) return null;
  const { memberId, name } = entry as Record<string, unknown>;
  if (!isPositiveInt(memberId) || typeof name !== "string") return null;
  return { memberId, name };
}

// 一覧にそのグループの分を書き足した JSON を作る。読めない一覧は作り直す（ほかのグループの分は、読めなければ失う）
export function withRememberedMember(text: string | null, groupId: string, member: RememberedMember): string {
  const data = parseJson(text);
  const base = typeof data === "object" && data !== null && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
  return JSON.stringify({ ...base, [groupId]: { memberId: member.memberId, name: member.name } });
}

// 一覧からそのグループの分だけを除いた JSON を作る（ほかのグループの分は残す）。読めない一覧は空にする
export function withoutRememberedMember(text: string | null, groupId: string): string {
  const data = parseJson(text);
  const base = isRecord(data) ? { ...data } : {};
  if (Object.hasOwn(base, groupId)) delete base[groupId];
  return JSON.stringify(base);
}

// 「行った」の一覧に1件付ける・外す（同じものは2回入れない）
export function applyVisit(visits: readonly Visit[], memberId: number, pref: number, visited: boolean): Visit[] {
  const rest = visits.filter((v) => !(v.memberId === memberId && v.pref === pref));
  return visited ? [...rest, { memberId, pref }] : rest;
}

// 新しいメンバーの色（API の PICK_COLOR と同じ：REQ-021）。0〜9 のうち、使っている人が少ない順、同じなら番号の小さい順
export function pickColor(colors: readonly number[]): number {
  let best = 0;
  let bestCount = Infinity;
  for (let c = 0; c <= 9; c++) {
    const count = colors.filter((x) => x === c).length;
    if (count < bestCount) {
      best = c;
      bestCount = count;
    }
  }
  return best;
}

// 仮のグループに名前で参加する。同じ名前（仮の比べ方：demoNameKey）の人がいればその人を返し、いなければ新しいメンバーを足す。
// 番号はいまの一番大きい番号の次（API では D1 が振る）
export function joinDemoGroup(
  g: DemoGroup,
  name: string,
): { status: "joined"; group: DemoGroup; memberId: number } | { status: "name_taken"; memberId: number; linked: boolean } {
  const key = demoNameKey(name);
  const same = g.members.find((m) => demoNameKey(m.name) === key);
  if (same) return { status: "name_taken", memberId: same.id, linked: same.linked };
  const memberId = Math.max(0, ...g.members.map((m) => m.id)) + 1;
  const member: GroupMember = {
    id: memberId,
    name,
    color: pickColor(g.members.map((m) => m.color)),
    isOwner: false,
    linked: false,
    isMe: false,
  };
  return { status: "joined", group: { ...g, members: [...g.members, member] }, memberId };
}

// いまの仮のグループ。作った・参加したグループは保存したものを、それ以外の形の正しいグループIDは「夏旅2026」を返す
function currentDemoGroup(groupId: string): DemoGroup {
  return (
    parseStoredGroup(readItem(demoGroupKey(groupId))) ?? {
      group: { ...DEMO_GROUP.group },
      members: DEMO_GROUP.members.map((m) => ({ ...m })),
    }
  );
}

// 保存がないときの「行った」の最初の状態（「夏旅2026」の分）。作ったグループは、作ったときに空の一覧を書いておく
const firstVisits = (memberIds: readonly number[]) => DEMO_VISITS.filter((v) => memberIds.includes(v.memberId));

// いまの仮の「行った」。保存がなければ、または読めなければ最初の状態
function currentDemoVisits(groupId: string, memberIds: readonly number[]): Visit[] {
  return parseStoredVisits(readItem(demoVisitsKey(groupId)), memberIds) ?? firstVisits(memberIds);
}

// 端末にそのグループのメンバーを覚える（auth-flow の「覚えるとき」）。書けなくても画面は止めない（覚えられないだけ）
function remember(groupId: string, member: RememberedMember): void {
  writeItem(MEMBERS_KEY, withRememberedMember(readItem(MEMBERS_KEY), groupId, member));
}

// グループを読む（API の「グループを開く」に当たる）。いまは仮のグループを返す
export function fetchGroup(groupId: string): Promise<GroupView> {
  const g = currentDemoGroup(groupId);
  return Promise.resolve({
    ...g,
    visits: currentDemoVisits(
      groupId,
      g.members.map((m) => m.id),
    ),
  });
}

// グループを作る（API の POST /api/groups に当たる：REQ-001）。作った人は作成者のメンバー（色は0番）。
// 作れたら、端末がそのメンバーを覚える。名前が決まりに合わなければ bad_name、保存できなければ save_failed で失敗する。
// turnstileToken はボット対策のトークン（1回しか使えない）。いまは仮の保存なので受け取るだけ（4-2 で API に送る）
export function createGroup(groupName: string, name: string, turnstileToken: string): Promise<CreatedGroup> {
  void turnstileToken;
  const gname = checkName(groupName, GROUP_NAME_MAX);
  const mname = checkName(name, MEMBER_NAME_MAX);
  if (gname === null || mname === null) return Promise.reject(new Error("bad_name"));
  const groupId = newGroupId();
  const memberId = 1;
  const g: DemoGroup = {
    group: { name: gname, manageBy: "everyone", ownerOnly: false },
    members: [{ id: memberId, name: mname, color: 0, isOwner: true, linked: false, isMe: false }],
  };
  if (!writeItem(demoGroupKey(groupId), serializeGroup(g)) || !writeItem(demoVisitsKey(groupId), "[]")) {
    return Promise.reject(new Error("save_failed"));
  }
  remember(groupId, { memberId, name: mname });
  return Promise.resolve({ groupId, memberId });
}

// 新しいメンバーとして参加する（API の POST /api/groups/{groupId}/members に当たる：REQ-004）。
// 入れたら、端末がそのメンバーを覚える。同じ名前の人がいれば、入れずにその人の番号を返す（画面が REQ-012 の確認を出す）。
// 満員（REQ-005）と、紐づいたメンバーと同じ名前（REQ-013）は、API とログインの項目で作る。
// turnstileToken はボット対策のトークン（1回しか使えない）。いまは仮の保存なので受け取るだけ（4-2 で API に送る）
export function joinGroup(groupId: string, name: string, turnstileToken: string): Promise<JoinResult> {
  void turnstileToken;
  const mname = checkName(name, MEMBER_NAME_MAX);
  if (mname === null) return Promise.reject(new Error("bad_name"));
  const result = joinDemoGroup(currentDemoGroup(groupId), mname);
  if (result.status === "name_taken") return Promise.resolve(result);
  if (!writeItem(demoGroupKey(groupId), serializeGroup(result.group))) return Promise.reject(new Error("save_failed"));
  remember(groupId, { memberId: result.memberId, name: mname });
  return Promise.resolve({ status: "joined", memberId: result.memberId });
}

// 同じ名前の確認で「続ける」を選んだとき、そのメンバーとして端末に覚える（API は呼ばない：REQ-012、api の「参加で同じ名前がいたとき」）
export function rememberMember(groupId: string, member: RememberedMember): Promise<void> {
  remember(groupId, member);
  return Promise.resolve();
}

// 端末が覚えているそのグループのメンバーを忘れる（覚えていたメンバーが合わない：REQ-025 など）。書けなくても止めない
export function forgetMember(groupId: string): Promise<void> {
  writeItem(MEMBERS_KEY, withoutRememberedMember(readItem(MEMBERS_KEY), groupId));
  return Promise.resolve();
}

// 自分の「行った」を付ける・外す（API の PUT・DELETE …/visits/{pref} に当たる）。保存できなければ失敗で返す
export function saveVisit(groupId: string, memberId: number, pref: number, visited: boolean): Promise<void> {
  const memberIds = currentDemoGroup(groupId).members.map((m) => m.id);
  if (!memberIds.includes(memberId) || !isPref(pref)) return Promise.reject(new Error("bad_request"));
  const next = applyVisit(currentDemoVisits(groupId, memberIds), memberId, pref, visited);
  return writeItem(demoVisitsKey(groupId), JSON.stringify(next)) ? Promise.resolve() : Promise.reject(new Error("save_failed"));
}

// 端末が覚えているメンバーを読む。覚えていなければ（読めなければ）null
export function readRememberedMember(groupId: string): Promise<RememberedMember | null> {
  return Promise.resolve(pickRememberedMember(readItem(MEMBERS_KEY), groupId));
}
