// 保存のところ。画面はここの関数だけを呼ぶ（中身を替えても、画面を変えずに済むように、どれも Promise を返す）。
// グループと「行った」は API（Hono＋D1。URL は docs/design/api.md の「一覧」）から毎回読み書きする。
// 端末が覚えるのは、グループIDごとのメンバー（番号と名前）だけで、localStorage に置く（auth-flow の「端末が覚えるもの」、Q-017）。
// 失敗は ApiError（中身は api.ts の Failure：状態コードと error の値、通信エラー、いまは使えない、429）で返す。
// 画面は messages.ts の関数で、失敗の種類から文と行き先を選ぶ
import { ApiError, BAD_RESPONSE, callApi, isRecord, refused, type ApiResult, type Failure } from "./api";
import { checkName, GROUP_NAME_MAX, MEMBER_NAME_MAX } from "./names";
import type { CreatedGroup, GroupMember, GroupView, JoinResult, RememberedMember, Visit } from "./types";

// 端末が覚えるメンバーのキー。中身は { [グループID]: { memberId, name } }
const MEMBERS_KEY = "tabikaigi-members";

// localStorage は読み書きに失敗することがある（Safari のプライベート、容量）。読めなければ null
function readItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

// 書けなくても止めない（覚えられないだけ）
function writeItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 何もしない
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

// 「行った」の一覧に1件付ける・外す（同じものは2回入れない）。保存できた「行った」に、成功した付け外しを入れるのに使う
export function applyVisit(visits: readonly Visit[], memberId: number, pref: number, visited: boolean): Visit[] {
  const rest = visits.filter((v) => !(v.memberId === memberId && v.pref === pref));
  return visited ? [...rest, { memberId, pref }] : rest;
}

// グループを開いたときの応答（api の「グループを開いたときの応答」）を確かめて読む。形が違えば null。
// API と画面の取り決めが食い違ったときに、画面の途中で止まらないように、使う値の型だけを見る
export function parseGroupView(body: unknown): GroupView | null {
  if (!isRecord(body) || !isRecord(body.group) || !Array.isArray(body.members) || !Array.isArray(body.visits)) return null;
  const { name, manageBy, ownerOnly } = body.group;
  if (typeof name !== "string" || (manageBy !== "everyone" && manageBy !== "owner") || typeof ownerOnly !== "boolean") return null;
  const members: GroupMember[] = [];
  for (const m of body.members as unknown[]) {
    if (!isRecord(m)) return null;
    const { id, name: mname, color, isOwner, linked, isMe } = m;
    if (!isPositiveInt(id) || typeof mname !== "string" || !Number.isInteger(color)) return null;
    if (typeof isOwner !== "boolean" || typeof linked !== "boolean" || typeof isMe !== "boolean") return null;
    members.push({ id, name: mname, color: color as number, isOwner, linked, isMe });
  }
  const visits: Visit[] = [];
  for (const v of body.visits as unknown[]) {
    if (!isRecord(v) || !isPositiveInt(v.memberId) || !isPref(v.pref)) return null;
    visits.push({ memberId: v.memberId, pref: v.pref });
  }
  return { group: { name, manageBy, ownerOnly }, members, visits };
}

// グループを作ったときの応答（201 { groupId, memberId }）を読む。形が違えば null
export function parseCreated(body: unknown): CreatedGroup | null {
  // グループIDの形（英数字22文字：data-model の groups.id）まで確かめる。localStorage のキーと URL にそのまま使うため
  if (!isRecord(body) || typeof body.groupId !== "string" || !/^[A-Za-z0-9]{22}$/.test(body.groupId) || !isPositiveInt(body.memberId))
    return null;
  return { groupId: body.groupId, memberId: body.memberId };
}

// 参加の応答を読む。201 { memberId } は入れた、409 name_taken { memberId, linked } は同じ名前の人がいた（api の「参加で同じ名前がいたとき」）。
// それ以外は失敗の種類のまま返す。成功の形が違えば、表にない値（bad_response）の失敗にする
export function parseJoined(r: ApiResult): { ok: true; result: JoinResult } | { ok: false; failure: Failure } {
  if (r.ok) {
    if (isRecord(r.body) && isPositiveInt(r.body.memberId)) return { ok: true, result: { status: "joined", memberId: r.body.memberId } };
    return { ok: false, failure: refused(r.status, BAD_RESPONSE) };
  }
  const f = r.failure;
  if (f.kind === "refused" && f.status === 409 && f.error === "name_taken") {
    const { memberId, linked } = f.body;
    if (isPositiveInt(memberId) && typeof linked === "boolean") return { ok: true, result: { status: "name_taken", memberId, linked } };
  }
  return { ok: false, failure: f };
}

// グループIDとメンバーの番号を URL に入れる形にする（グループIDは画面が形を確かめてある。念のため符号にする）
const groupPath = (groupId: string) => `/api/groups/${encodeURIComponent(groupId)}`;

// 端末にそのグループのメンバーを覚える（auth-flow の「覚えるとき」）。書けなくても画面は止めない（覚えられないだけ）
function remember(groupId: string, member: RememberedMember): void {
  writeItem(MEMBERS_KEY, withRememberedMember(readItem(MEMBERS_KEY), groupId, member));
}

// グループを読む（GET /api/groups/{groupId}：REQ-002・REQ-017〜REQ-020）
export async function fetchGroup(groupId: string): Promise<GroupView> {
  const r = await callApi("GET", groupPath(groupId));
  if (!r.ok) throw new ApiError(r.failure);
  const view = parseGroupView(r.body);
  if (!view) throw new ApiError(refused(r.status, BAD_RESPONSE));
  return view;
}

// グループを作る（POST /api/groups：REQ-001）。作れたら、端末が作ったメンバー（番号と、送った名前）を覚える。
// 名前が決まりに合わないと分かっていれば、API を呼ばずに bad_name で失敗する（入力の手助け。正本は API）。
// turnstileToken はボット対策のトークン（1回しか使えない）
export async function createGroup(groupName: string, name: string, turnstileToken: string): Promise<CreatedGroup> {
  const gname = checkName(groupName, GROUP_NAME_MAX);
  const mname = checkName(name, MEMBER_NAME_MAX);
  if (gname === null || mname === null) throw new ApiError(refused(400, "bad_name"));
  const r = await callApi("POST", "/api/groups", { groupName: gname, name: mname, turnstileToken });
  if (!r.ok) throw new ApiError(r.failure);
  const created = parseCreated(r.body);
  if (!created) throw new ApiError(refused(r.status, BAD_RESPONSE));
  remember(created.groupId, { memberId: created.memberId, name: mname });
  return created;
}

// 新しいメンバーとして参加する（POST /api/groups/{groupId}/members：REQ-004）。入れたら、端末がそのメンバーを覚える。
// 同じ名前の人がいれば（409 name_taken）、入れずにその人の番号と、紐づいているかを返す（画面が REQ-012・REQ-013 の文を出す）。
// turnstileToken はボット対策のトークン（1回しか使えない）
export async function joinGroup(groupId: string, name: string, turnstileToken: string): Promise<JoinResult> {
  const mname = checkName(name, MEMBER_NAME_MAX);
  if (mname === null) throw new ApiError(refused(400, "bad_name"));
  const r = parseJoined(await callApi("POST", `${groupPath(groupId)}/members`, { name: mname, turnstileToken }));
  if (!r.ok) throw new ApiError(r.failure);
  if (r.result.status === "joined") remember(groupId, { memberId: r.result.memberId, name: mname });
  return r.result;
}

// 同じ名前の確認で「続ける」を選んだとき、そのメンバーとして端末に覚える（API は呼ばない：REQ-012、api の「参加で同じ名前がいたとき」）
export function rememberMember(groupId: string, member: RememberedMember): Promise<void> {
  remember(groupId, member);
  return Promise.resolve();
}

// 端末が覚えているそのグループのメンバーを忘れる（覚えていたメンバーが合わない：REQ-025、グループが削除された、など）。書けなくても止めない
export function forgetMember(groupId: string): Promise<void> {
  writeItem(MEMBERS_KEY, withoutRememberedMember(readItem(MEMBERS_KEY), groupId));
  return Promise.resolve();
}

// ログインなしのメンバーの「行った」を付ける・外す（PUT・DELETE /api/groups/{groupId}/members/{memberId}/visits/{pref}：REQ-016・REQ-023）
export async function saveVisit(groupId: string, memberId: number, pref: number, visited: boolean): Promise<void> {
  const r = await callApi(visited ? "PUT" : "DELETE", `${groupPath(groupId)}/members/${memberId}/visits/${pref}`);
  if (!r.ok) throw new ApiError(r.failure);
}

// 端末が覚えているメンバーを読む。覚えていなければ（読めなければ）null
export function readRememberedMember(groupId: string): Promise<RememberedMember | null> {
  return Promise.resolve(pickRememberedMember(readItem(MEMBERS_KEY), groupId));
}
