// 保存のところ。画面はここの関数だけを呼ぶ（中身を API に替えても、画面を変えずに済むように、どれも Promise を返す）。
// いま（Phase 2 の 3-4）は API につなぐ前なので、中身は localStorage と仮のグループ（demo.ts）にしてある。
// 端末が覚えるメンバー（グループIDごとに番号と名前）は本番と同じ形にする（auth-flow の「端末が覚えるもの」）
import { DEMO_GROUP, DEMO_ME, DEMO_VISITS } from "./demo";
import type { GroupView, RememberedMember, Visit } from "./types";

// 端末が覚えるメンバーのキー。中身は { [グループID]: { memberId, name } }
const MEMBERS_KEY = "tabikaigi-members";
// 仮の「行った」のキー（API につないだら使わない）。グループIDごとに分ける
const demoVisitsKey = (groupId: string) => `tabikaigi-dev-visits:${groupId}`;

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

// 「行った」の一覧に1件付ける・外す（同じものは2回入れない）
export function applyVisit(visits: readonly Visit[], memberId: number, pref: number, visited: boolean): Visit[] {
  const rest = visits.filter((v) => !(v.memberId === memberId && v.pref === pref));
  return visited ? [...rest, { memberId, pref }] : rest;
}

const demoMemberIds = () => DEMO_GROUP.members.map((m) => m.id);

// いまの仮の「行った」。保存がなければ、または読めなければ最初の状態
function currentDemoVisits(groupId: string): Visit[] {
  return parseStoredVisits(readItem(demoVisitsKey(groupId)), demoMemberIds()) ?? [...DEMO_VISITS];
}

// グループを読む（API の「グループを開く」に当たる）。いまは形が正しいグループIDなら、どれでも仮のグループを返す
export function fetchGroup(groupId: string): Promise<GroupView> {
  return Promise.resolve({
    group: { ...DEMO_GROUP.group },
    members: DEMO_GROUP.members.map((m) => ({ ...m })),
    visits: currentDemoVisits(groupId),
  });
}

// 自分の「行った」を付ける・外す（API の PUT・DELETE …/visits/{pref} に当たる）。保存できなければ失敗で返す
export function saveVisit(groupId: string, memberId: number, pref: number, visited: boolean): Promise<void> {
  if (!demoMemberIds().includes(memberId) || !isPref(pref)) return Promise.reject(new Error("bad_request"));
  const next = applyVisit(currentDemoVisits(groupId), memberId, pref, visited);
  return writeItem(demoVisitsKey(groupId), JSON.stringify(next)) ? Promise.resolve() : Promise.reject(new Error("save_failed"));
}

// 端末が覚えているメンバーを読む。いまは、何も覚えていなければ仮のメンバー（たろう）として参加したことにして書く。
// 書けなければ「覚えていない」（null）として続ける
export function readRememberedMember(groupId: string): Promise<RememberedMember | null> {
  const text = readItem(MEMBERS_KEY);
  const remembered = pickRememberedMember(text, groupId);
  if (remembered) return Promise.resolve(remembered);
  const wrote = writeItem(MEMBERS_KEY, withRememberedMember(text, groupId, DEMO_ME));
  return Promise.resolve(wrote ? { ...DEMO_ME } : null);
}
