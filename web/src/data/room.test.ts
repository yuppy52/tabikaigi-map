// 部屋への接続のテスト。つなぎ直しの間隔と10回でやめること、届いたメッセージの読み取り、部屋の URL（ADR 0012、api の「部屋への接続」）と、
// WebSocket を差し替えて、最初にグループIDを送る・ready で「つながった」・5秒で帯・ready で帯を消す・2回目の ready で読み直す・ping を送る、を確かめる
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BANNER_DELAY_MS,
  connectRoom,
  MAX_FAILURES,
  parseRoomMessage,
  PING_INTERVAL_MS,
  reconnectDelay,
  roomKeyOf,
  roomUrl,
  type RoomHandlers,
  type RoomSocket,
} from "./room";

describe("reconnectDelay：つなぎ直すまでの待ち時間", () => {
  it("1・2・4・8・16・32秒、その後は60秒ごと", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map(reconnectDelay)).toEqual([1_000, 2_000, 4_000, 8_000, 16_000, 32_000, 60_000, 60_000, 60_000]);
  });

  it("続けて10回失敗したら、もうつながない（null）", () => {
    expect(MAX_FAILURES).toBe(10);
    expect(reconnectDelay(10)).toBeNull();
    expect(reconnectDelay(11)).toBeNull();
  });
});

describe("parseRoomMessage：届いたメッセージを読む", () => {
  it("ready・refetch・visit を読む", () => {
    expect(parseRoomMessage('{"type":"ready"}')).toEqual({ type: "ready" });
    expect(parseRoomMessage('{"type":"refetch"}')).toEqual({ type: "refetch" });
    expect(parseRoomMessage('{"type":"visit","memberId":3,"pref":13,"visited":true}')).toEqual({
      type: "visit",
      memberId: 3,
      pref: 13,
      visited: true,
    });
    expect(parseRoomMessage('{"type":"visit","memberId":3,"pref":47,"visited":false}')).toMatchObject({ visited: false });
  });

  it("pong、JSON でないもの、文字でないもの、知らない種類は捨てる", () => {
    for (const data of ["pong", "", "null", "[]", '"ready"', '{"type":"hello"}', '{"type":"READY"}', new ArrayBuffer(2), 1, null]) {
      expect(parseRoomMessage(data)).toBeNull();
    }
  });

  it("visit の中身の形が違えば捨てる（番号が正の整数でない、県が1〜47でない、visited が真偽でない）", () => {
    const bad = [
      { memberId: 0, pref: 13, visited: true },
      { memberId: 1.5, pref: 13, visited: true },
      { memberId: "3", pref: 13, visited: true },
      { memberId: 3, pref: 0, visited: true },
      { memberId: 3, pref: 48, visited: true },
      { memberId: 3, pref: 13, visited: 1 },
      { memberId: 3, pref: 13 },
    ];
    for (const b of bad) expect(parseRoomMessage(JSON.stringify({ type: "visit", ...b }))).toBeNull();
  });
});

describe("roomKeyOf・roomUrl：部屋の URL", () => {
  it("room_key は SHA-256 の16進64文字（小文字）", async () => {
    expect(await roomKeyOf("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(await roomKeyOf("AAAAAAAAAAAAAAAAAAAAAA")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("同じオリジンの /api/rooms/<room_key>。https の画面なら wss、http なら ws", () => {
    expect(roomUrl({ protocol: "https:", host: "example.com" }, "ab")).toBe("wss://example.com/api/rooms/ab");
    expect(roomUrl({ protocol: "http:", host: "localhost:5173" }, "ab")).toBe("ws://localhost:5173/api/rooms/ab");
  });
});

// 差し替えの WebSocket。送ったものを覚え、テストから開く・届ける・閉じるを起こす
class FakeSocket implements RoomSocket {
  readyState = 0;
  sent: string[] = [];
  closedWith: number | undefined | null = null;
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  constructor(readonly url: string) {}
  send(data: string) {
    this.sent.push(data);
  }
  close(code?: number) {
    this.closedWith = code;
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.({} as Event);
  }
  receive(data: string) {
    this.onmessage?.({ data } as MessageEvent);
  }
  drop() {
    this.readyState = 3;
    this.onclose?.({} as CloseEvent);
  }
}

const GROUP_ID = "AbCdEfGhIjKlMnOpQrStUv";
// GROUP_ID の room_key（下の beforeAll で本物の計算で作る）
let KEY = "";

describe("connectRoom：つなぐ・つなぎ直す", () => {
  let sockets: FakeSocket[];
  let handlers: { [K in keyof RoomHandlers]: ReturnType<typeof vi.fn<RoomHandlers[K]>> };
  const last = () => sockets[sockets.length - 1];
  const start = async () => {
    const room = connectRoom(GROUP_ID, handlers, {
      createSocket: (url) => {
        const s = new FakeSocket(url);
        sockets.push(s);
        return s;
      },
      location: { protocol: "https:", host: "example.com" },
      roomKey: () => Promise.resolve(KEY),
    });
    await vi.advanceTimersByTimeAsync(0); // room_key の計算（Promise）を待つ
    return room;
  };
  // 接続を開いて ready を返す
  const connect = (s: FakeSocket) => {
    s.open();
    s.receive('{"type":"ready"}');
  };

  beforeAll(async () => {
    KEY = await roomKeyOf(GROUP_ID);
  });
  beforeEach(() => {
    vi.useFakeTimers();
    sockets = [];
    handlers = { onVisit: vi.fn(), onRefetch: vi.fn(), onBanner: vi.fn() };
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("URL にはグループIDを入れず room_key だけ。開いたら最初にグループIDを送る", async () => {
    await start();
    expect(sockets).toHaveLength(1);
    expect(last().url).toBe(`wss://example.com/api/rooms/${KEY}`);
    expect(KEY).toMatch(/^[0-9a-f]{64}$/);
    expect(last().url).not.toContain(GROUP_ID);
    last().open();
    expect(last().sent).toEqual([JSON.stringify({ groupId: GROUP_ID })]);
  });

  it("届いた visit と refetch を知らせる。pong や形の違うものは捨てる。開いた直後の最初の ready では読み直さない", async () => {
    await start();
    connect(last());
    expect(handlers.onRefetch).not.toHaveBeenCalled();
    last().receive('{"type":"visit","memberId":2,"pref":13,"visited":true}');
    last().receive("pong");
    last().receive('{"type":"visit","memberId":2}');
    last().receive('{"type":"refetch"}');
    expect(handlers.onVisit).toHaveBeenCalledExactlyOnceWith(2, 13, true);
    expect(handlers.onRefetch).toHaveBeenCalledOnce();
  });

  it("ready の後、30秒ごとに ping を送る", async () => {
    await start();
    connect(last());
    await vi.advanceTimersByTimeAsync(PING_INTERVAL_MS - 1);
    expect(last().sent).not.toContain("ping");
    await vi.advanceTimersByTimeAsync(1);
    expect(last().sent.filter((m) => m === "ping")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(PING_INTERVAL_MS);
    expect(last().sent.filter((m) => m === "ping")).toHaveLength(2);
  });

  it("つながらないまま5秒たったら帯を出す。つながったら消す", async () => {
    await start();
    await vi.advanceTimersByTimeAsync(BANNER_DELAY_MS - 1);
    expect(handlers.onBanner).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(handlers.onBanner).toHaveBeenLastCalledWith(true);
    connect(last());
    expect(handlers.onBanner).toHaveBeenLastCalledWith(false);
  });

  it("5秒より前につながれば、帯は出さない", async () => {
    await start();
    await vi.advanceTimersByTimeAsync(BANNER_DELAY_MS - 1);
    connect(last());
    await vi.advanceTimersByTimeAsync(BANNER_DELAY_MS * 2);
    expect(handlers.onBanner).not.toHaveBeenCalled();
  });

  it("切れたら1・2・4…秒待ってつなぎ直し、つながったら（2回目の ready）読み直す", async () => {
    await start();
    connect(last());
    last().drop();
    expect(sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(sockets).toHaveLength(2);
    last().drop(); // 2回目の失敗
    await vi.advanceTimersByTimeAsync(1_999);
    expect(sockets).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets).toHaveLength(3);
    connect(last());
    expect(handlers.onRefetch).toHaveBeenCalledOnce();
    // ready で回数が0に戻るので、次に切れたら また1秒
    last().drop();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(sockets).toHaveLength(4);
  });

  it("続けて10回失敗したら、もうつながない（帯は出たまま）", async () => {
    await start();
    for (let i = 1; i <= MAX_FAILURES; i++) {
      last().drop();
      await vi.advanceTimersByTimeAsync(60_000);
    }
    expect(sockets).toHaveLength(MAX_FAILURES);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(sockets).toHaveLength(MAX_FAILURES);
    expect(handlers.onBanner).toHaveBeenLastCalledWith(true);
  });

  it("やめた後に reconnectNow を呼ぶと、すぐにつなぎ、回数も数え直す（失敗したらまた1秒後）", async () => {
    const room = await start();
    for (let i = 1; i <= MAX_FAILURES; i++) {
      last().drop();
      await vi.advanceTimersByTimeAsync(60_000);
    }
    expect(sockets).toHaveLength(MAX_FAILURES);
    room.reconnectNow();
    expect(sockets).toHaveLength(MAX_FAILURES + 1);
    last().drop();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(sockets).toHaveLength(MAX_FAILURES + 2);
  });

  it("つながっている・つないでいる途中に reconnectNow を呼んでも、2本目は作らない", async () => {
    const room = await start();
    room.reconnectNow();
    expect(sockets).toHaveLength(1);
    connect(last());
    room.reconnectNow();
    expect(sockets).toHaveLength(1);
  });

  it("待っている途中に reconnectNow を呼ぶと、待たずにつなぐ（待ちの分は作らない）", async () => {
    const room = await start();
    last().drop();
    room.reconnectNow();
    expect(sockets).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sockets).toHaveLength(2);
  });

  it("close で切ったら、もうつながず、帯も ping も止める。古い接続から届いたものは捨てる", async () => {
    const room = await start();
    const s = last();
    connect(s);
    room.close();
    expect(s.closedWith).toBe(1000);
    s.receive('{"type":"refetch"}');
    s.drop();
    room.reconnectNow();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(sockets).toHaveLength(1);
    expect(s.sent.filter((m) => m === "ping")).toHaveLength(0);
    expect(handlers.onRefetch).not.toHaveBeenCalled();
    expect(handlers.onBanner).not.toHaveBeenCalled();
  });

  it("room_key を計算し終わる前に close したら、つながない", async () => {
    const room = connectRoom(GROUP_ID, handlers, {
      createSocket: (url) => {
        const s = new FakeSocket(url);
        sockets.push(s);
        return s;
      },
      location: { protocol: "https:", host: "example.com" },
      roomKey: () => Promise.resolve(KEY),
    });
    room.close();
    await vi.advanceTimersByTimeAsync(BANNER_DELAY_MS);
    expect(sockets).toHaveLength(0);
    expect(handlers.onBanner).not.toHaveBeenCalled();
  });
});

describe("connectRoom：いまつながっているか（画面に戻ったときに読み直すかを決める）", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("ready が届くまでは false、届いたら true、切れたら false、つなぎ直して ready で true、close で false", async () => {
    const sockets: FakeSocket[] = [];
    const room = connectRoom(
      GROUP_ID,
      { onVisit: () => {}, onRefetch: () => {}, onBanner: () => {} },
      {
        createSocket: (url) => {
          const s = new FakeSocket(url);
          sockets.push(s);
          return s;
        },
        location: { protocol: "https:", host: "example.com" },
        roomKey: () => Promise.resolve("ab"),
      },
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(room.isConnected()).toBe(false);
    sockets[0].open();
    expect(room.isConnected()).toBe(false); // 開いただけでは、まだ確かめが済んでいない
    sockets[0].receive('{"type":"ready"}');
    expect(room.isConnected()).toBe(true);
    sockets[0].drop();
    expect(room.isConnected()).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    sockets[1].open();
    sockets[1].receive('{"type":"ready"}');
    expect(room.isConnected()).toBe(true);
    room.close();
    expect(room.isConnected()).toBe(false);
  });
});
