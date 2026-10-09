// リアルタイムの共有を2つのタブやスマホで確かめるための、小さな画面（試作）。
// 本番の画面は Phase 2 で React で作る。ここでは「つなぎ方」だけを試す：
// - つながったとき・画面に戻ったときに、全体を取り直す（取りこぼしを防ぐ）
// - 切れたら、少しずつ間をあけてつなぎ直す
// - つながらない状態が続いたら、画面が見えている間だけ10秒ごとに問い合わせる（予備）

const PREFS = "北海道 青森 岩手 宮城 秋田 山形 福島 茨城 栃木 群馬 埼玉 千葉 東京 神奈川 新潟 富山 石川 福井 山梨 長野 岐阜 静岡 愛知 三重 滋賀 京都 大阪 兵庫 奈良 和歌山 鳥取 島根 岡山 広島 山口 徳島 香川 愛媛 高知 福岡 佐賀 長崎 熊本 大分 宮崎 鹿児島 沖縄".split(" ");

type Member = { id: number; name: string };
type State = { group: { name: string }; members: Member[]; visits: { memberId: number; pref: number }[] };

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const groupId = location.pathname.match(/^\/g\/([A-Za-z0-9]+)/)?.[1] ?? "";
const meKey = `tabikaigi-spike-me-${groupId}`;

let state: State | null = null;
let me: number | null = Number(localStorage.getItem(meKey)) || null;
let ws: WebSocket | null = null;
let failures = 0;
let retryTimer: number | undefined;
let pollTimer: number | undefined;

function log(text: string) {
  const li = document.createElement("li");
  li.textContent = `${new Date().toLocaleTimeString()} ${text}`;
  $("#log").prepend(li);
}
function setStatus(text: string) {
  $("#status").textContent = text;
}

async function api<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

async function roomKey(id: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(id));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---- 全体を取り直す ----
async function refetch(reason: string) {
  state = await api<State>("groups/state", { groupId });
  log(`全体を取り直した（${reason}）`);
  render();
}

// ---- WebSocket ----
async function connect() {
  clearTimeout(retryTimer);
  if (ws && ws.readyState <= WebSocket.OPEN) return;
  setStatus("つないでいます…");
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  const sock = new WebSocket(`${scheme}://${location.host}/api/rooms/${await roomKey(groupId)}/ws`);
  ws = sock;
  sock.onopen = () => sock.send(JSON.stringify({ groupId }));
  sock.onmessage = (e) => {
    if (e.data === "pong") return;
    const msg = JSON.parse(e.data as string);
    if (msg.type === "ready") {
      failures = 0;
      stopPolling();
      setStatus("リアルタイム：つながっている");
      void refetch("つながった");
    } else if (msg.type === "visit" && state) {
      // 知らないメンバー（あとから参加した人）の変更なら、全体を取り直す（参加は配らないため）
      if (!state.members.some((m) => m.id === msg.memberId)) {
        void refetch("知らないメンバーの変更が届いた");
        return;
      }
      state.visits = state.visits.filter((v) => !(v.memberId === msg.memberId && v.pref === msg.pref));
      if (msg.visited) state.visits.push({ memberId: msg.memberId, pref: msg.pref });
      log(`届いた：${nameOf(msg.memberId)} が ${PREFS[msg.pref - 1]} を${msg.visited ? "付けた" : "外した"}`);
      render();
    }
  };
  sock.onclose = (e) => {
    if (ws !== sock) return;
    ws = null;
    failures++;
    setStatus(`切れた（${e.code}）`);
    log(`切れた（コード ${e.code}）`);
    if (failures >= 3) startPolling();
    if (document.visibilityState === "visible") {
      const wait = Math.min(15000, 1000 * 2 ** (failures - 1));
      retryTimer = window.setTimeout(connect, wait);
      log(`${wait / 1000}秒後につなぎ直す`);
    }
  };
}

function startPolling() {
  if (pollTimer) return;
  setStatus("予備：10秒ごとに問い合わせ中");
  pollTimer = window.setInterval(() => {
    if (document.visibilityState === "visible") void refetch("10秒ごとの問い合わせ");
  }, 10000);
}
function stopPolling() {
  clearInterval(pollTimer);
  pollTimer = undefined;
}

// 画面に戻ったら、全体を取り直し、切れていればすぐつなぎ直す（スマホで画面を消して戻ったとき）
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || !groupId) return;
  void refetch("画面に戻った");
  if (!ws) void connect();
});
// 生きているかの確認（部屋は起こさずに自動で pong を返す）
setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send("ping"), 30000);

// ---- 表示 ----
function nameOf(id: number) {
  return state?.members.find((m) => m.id === id)?.name ?? `#${id}`;
}

function render() {
  if (!state) return;
  $("#group-name").textContent = state.group.name;
  const select = $<HTMLSelectElement>("#me");
  select.innerHTML = `<option value="">（自分を選ぶ）</option>` + state.members.map((m) => `<option value="${m.id}">${escape(m.name)}</option>`).join("");
  select.value = me ? String(me) : "";
  const grid = $("#prefs");
  grid.innerHTML = "";
  PREFS.forEach((name, i) => {
    const pref = i + 1;
    const who = state!.visits.filter((v) => v.pref === pref).map((v) => v.memberId);
    const btn = document.createElement("button");
    btn.textContent = `${name} ${who.length || ""}`;
    btn.className = who.includes(me ?? -1) ? "mine" : who.length ? "others" : "";
    btn.title = who.map(nameOf).join("、");
    btn.onclick = () => toggle(pref, !who.includes(me ?? -1));
    grid.append(btn);
  });
}

async function toggle(pref: number, visited: boolean) {
  if (!me) return alert("先に「自分」を選ぶか、参加してください");
  const r = await api<{ notified: number }>("visits", { groupId, memberId: me, pref, visited });
  log(`送った：${PREFS[pref - 1]} を${visited ? "付けた" : "外した"}（${r.notified}人に配った）`);
}

function escape(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// ---- 始める ----
$("#me").addEventListener("change", (e) => {
  me = Number((e.target as HTMLSelectElement).value) || null;
  localStorage.setItem(meKey, String(me ?? ""));
  render();
});
$("#join").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $<HTMLInputElement>("#join-name");
  try {
    const r = await api<{ memberId: number }>("groups/join", { groupId, name: input.value });
    me = r.memberId;
    localStorage.setItem(meKey, String(me));
    input.value = "";
    await refetch("参加した");
  } catch (err) {
    alert(`参加できなかった：${(err as Error).message}`);
  }
});
$("#create").addEventListener("submit", async (e) => {
  e.preventDefault();
  const r = await api<{ groupId: string; memberId: number }>("groups", { groupName: "試作の会議", name: $<HTMLInputElement>("#create-name").value });
  localStorage.setItem(`tabikaigi-spike-me-${r.groupId}`, String(r.memberId));
  location.href = `/g/${r.groupId}`;
});

if (groupId) {
  $("#create").hidden = true;
  void refetch("開いた").then(connect, (err) => setStatus(`グループが見つからない（${err.message}）`));
} else {
  $("#room").hidden = true;
}
