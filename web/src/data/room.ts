// リアルタイムの部屋（/api/rooms/{room_key} の WebSocket）につなぐところ。画面の部品は WebSocket を直接作らず、ここの connectRoom を使う。
// 部屋の取り決めは docs/design/api.md の「部屋への接続」、配るものは architecture の「部屋が配るもの」、数字は ADR 0012。
//
// 考え方：
// - URL にはグループIDを入れず、グループIDの SHA-256（room_key）だけを入れる。グループIDは、つないだ後の最初のメッセージで送る
// - {"type":"ready"} が来たら「つながった」。それまでに届くものはない（部屋が配らない）
// - 切れたら、だんだん長く待ってつなぎ直す（1・2・4・8・16・32秒、その後60秒ごと）。続けて10回失敗したらやめる。
//   切られた番号（1008 など）や 429 では区別しない（ブラウザには理由が見えないことが多いので、どれも失敗として数える）
// - つながっていない状態が5秒続いたら、帯を出すように知らせる。つながったら消す
// - グループIDは console.log・エラーの文に入れない（NFR-005）
// 計算（間隔、届いたものの読み取り、URL）は関数に分けてテストする。つなぎ直しの動きも、WebSocket を差し替えてテストする

/** つなぎ直す間隔（ミリ秒。ADR 0012）。ここを使い切ったら、その後は LATER_DELAY_MS ごと */
export const RECONNECT_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 32_000] as const;
export const LATER_DELAY_MS = 60_000;
/** 続けてこの回数だけ失敗したら、自動でつなぎ直すのをやめる（ADR 0012） */
export const MAX_FAILURES = 10;
/** つながっていない状態がこれだけ続いたら帯を出す（ADR 0012） */
export const BANNER_DELAY_MS = 5_000;
/** 生きているかの確認（ping）を送る間隔（ADR 0012。部屋が自動で pong を返す） */
export const PING_INTERVAL_MS = 30_000;

/** 部屋から届くもののうち、画面が使うもの。ready は確かめが済んだ印 */
export type RoomEvent = { type: "ready" } | { type: "visit"; memberId: number; pref: number; visited: boolean } | { type: "refetch" };

/**
 * 続けて failures 回失敗した後、次につなぐまでの待ち時間（ミリ秒）。もうつながないなら null。
 * 1回目の失敗の後は1秒、2回目は2秒…6回目は32秒、7〜9回目は60秒。10回目でやめる
 */
export function reconnectDelay(failures: number): number | null {
  if (failures >= MAX_FAILURES) return null;
  if (failures < 1) return 0;
  return RECONNECT_DELAYS_MS[failures - 1] ?? LATER_DELAY_MS;
}

const isPositiveInt = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0;
const isPref = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 47;

/** 届いたメッセージを読む。形の違うもの（pong、文字でないもの、知らない種類）は null（捨てる） */
export function parseRoomMessage(data: unknown): RoomEvent | null {
  if (typeof data !== "string") return null;
  let msg: unknown;
  try {
    msg = JSON.parse(data) as unknown;
  } catch {
    return null;
  }
  if (typeof msg !== "object" || msg === null || Array.isArray(msg)) return null;
  const m = msg as Record<string, unknown>;
  if (m.type === "ready") return { type: "ready" };
  if (m.type === "refetch") return { type: "refetch" };
  if (m.type === "visit" && isPositiveInt(m.memberId) && isPref(m.pref) && typeof m.visited === "boolean") {
    return { type: "visit", memberId: m.memberId, pref: m.pref, visited: m.visited };
  }
  return null;
}

/** グループIDの SHA-256 の16進64文字（部屋の URL に入れる：data-model の groups.room_key） */
export async function roomKeyOf(groupId: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(groupId));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** 同じオリジンの部屋の URL（https の画面なら wss、http なら ws） */
export function roomUrl(location: { protocol: string; host: string }, key: string): string {
  return `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/rooms/${key}`;
}

/** WebSocket のうち、ここで使うところだけ（テストで差し替える） */
export type RoomSocket = {
  readonly readyState: number;
  onopen: ((ev: Event) => void) | null;
  onmessage: ((ev: MessageEvent) => void) | null;
  onclose: ((ev: CloseEvent) => void) | null;
  onerror: ((ev: Event) => void) | null;
  send(data: string): void;
  close(code?: number): void;
};

/** 部屋から届いたものと、帯を出すかを、画面に知らせる */
export type RoomHandlers = {
  /** 「行った」の付け外しが届いた */
  onVisit: (memberId: number, pref: number, visited: boolean) => void;
  /** グループを読み直してほしい（「取り直して」が届いた、つなぎ直してつながった） */
  onRefetch: () => void;
  /** 帯を出すか（つながっていない状態が5秒続いたら true、つながったら false） */
  onBanner: (show: boolean) => void;
};

export type RoomConnection = {
  /** つなぎ直しの回数を数え直して、すぐにつなぐ（帯の「読み直す」、画面に戻ったとき）。つながっている・つないでいる途中なら何もしない */
  reconnectNow: () => void;
  /** いまつながっているか（ready が届いてから、切れるまで）。画面に戻ったときに、読み直すかを決める */
  isConnected: () => boolean;
  /** 切って、もうつながない（画面を離れたとき） */
  close: () => void;
};

export type RoomOptions = {
  /** WebSocket を作る（テストで差し替える） */
  createSocket?: (url: string) => RoomSocket;
  /** 画面の場所（URL を作るため。テストで差し替える） */
  location?: { protocol: string; host: string };
  /** room_key を作る（テストで差し替える。ブラウザの crypto.subtle は Promise の外で計算するので、テストの時計では待てない） */
  roomKey?: (groupId: string) => Promise<string>;
};

const OPEN = 1; // WebSocket.OPEN
const CLOSE_NORMAL = 1000;

/** 部屋につなぐ。つないだら最初にグループIDを送り、ready が来たら「つながった」とする。切れたらつなぎ直す */
export function connectRoom(groupId: string, handlers: RoomHandlers, options: RoomOptions = {}): RoomConnection {
  const createSocket = options.createSocket ?? ((url: string) => new WebSocket(url));
  let closed = false;
  let socket: RoomSocket | null = null;
  // 続けて失敗した回数（ready が来たら0に戻す）
  let failures = 0;
  // いまの接続に ready が届いているか
  let connected = false;
  // 1回でも ready が来たか（2回目以降の ready では読み直す）
  let everReady = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let bannerTimer: ReturnType<typeof setTimeout> | null = null;
  let bannerShown = false;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let url: string | null = null;

  const stopPing = () => {
    if (pingTimer !== null) clearInterval(pingTimer);
    pingTimer = null;
  };
  const stopRetry = () => {
    if (retryTimer !== null) clearTimeout(retryTimer);
    retryTimer = null;
  };
  const stopBannerTimer = () => {
    if (bannerTimer !== null) clearTimeout(bannerTimer);
    bannerTimer = null;
  };

  // つながっていない：5秒たっても変わらなければ帯を出す（もう数えている・出ているなら、そのまま）
  const markDown = () => {
    if (bannerShown || bannerTimer !== null) return;
    bannerTimer = setTimeout(() => {
      bannerTimer = null;
      bannerShown = true;
      handlers.onBanner(true);
    }, BANNER_DELAY_MS);
  };

  // つながった：帯を消し、回数を数え直し、ping を始める。開いた直後の最初の ready 以外では読み直す
  const markReady = (ws: RoomSocket) => {
    failures = 0;
    connected = true;
    stopBannerTimer();
    if (bannerShown) {
      bannerShown = false;
      handlers.onBanner(false);
    }
    stopPing();
    pingTimer = setInterval(() => {
      if (ws.readyState === OPEN) ws.send("ping");
    }, PING_INTERVAL_MS);
    if (everReady) handlers.onRefetch();
    everReady = true;
  };

  // 切れた（つながらなかった）：失敗を数え、待ってからつなぎ直す。10回続いたらやめる
  const onDown = () => {
    socket = null;
    connected = false;
    stopPing();
    failures++;
    markDown();
    const delay = reconnectDelay(failures);
    if (delay === null) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      open();
    }, delay);
  };

  const open = () => {
    if (closed || url === null || socket !== null) return;
    let ws: RoomSocket;
    try {
      ws = createSocket(url);
    } catch {
      // URL の誤りなどで作れなかったときも、失敗として数える
      onDown();
      return;
    }
    socket = ws;
    ws.onopen = () => {
      if (socket !== ws) return;
      ws.send(JSON.stringify({ groupId }));
    };
    ws.onmessage = (ev) => {
      if (socket !== ws) return;
      const msg = parseRoomMessage(ev.data);
      if (msg === null) return;
      if (msg.type === "ready") markReady(ws);
      else if (msg.type === "visit") handlers.onVisit(msg.memberId, msg.pref, msg.visited);
      else handlers.onRefetch();
    };
    ws.onclose = () => {
      if (socket !== ws) return;
      onDown();
    };
    // エラーの後には必ず close が来るので、ここでは何もしない
    ws.onerror = () => {};
  };

  // 開いたときは、つながるまで「つながっていない」として数える
  markDown();
  (options.roomKey ?? roomKeyOf)(groupId).then(
    (key) => {
      url = roomUrl(options.location ?? window.location, key);
      open();
    },
    () => {
      // ハッシュを計算できない（古いブラウザ、http の別の名前で開いた）ときは、つながないまま帯を出す
    },
  );

  return {
    reconnectNow: () => {
      if (closed) return;
      failures = 0;
      stopRetry();
      open();
    },
    isConnected: () => connected,
    close: () => {
      closed = true;
      connected = false;
      stopRetry();
      stopPing();
      stopBannerTimer();
      const ws = socket;
      socket = null;
      if (ws) {
        try {
          ws.close(CLOSE_NORMAL);
        } catch {
          // もう閉じていれば何もしない
        }
      }
    },
  };
}
