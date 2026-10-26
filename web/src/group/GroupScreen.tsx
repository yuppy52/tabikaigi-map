import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useLocation, useNavigate } from "react-router";
import { memberColor } from "../data/memberColors";
import { failureOf } from "../data/api";
import { applyVisit, fetchGroup, forgetMember, readRememberedMember, rememberMember, saveVisit } from "../data/store";
import type { GroupView } from "../data/types";
import { FooterLinks, MapCredit } from "../Footer";
import { connectRoom, type RoomConnection } from "../data/room";
import {
  backgroundLoadErrorOf,
  GROUP_DELETED,
  GROUP_FULL,
  LOAD_FAILED,
  loadErrorOf,
  LOST_MEMBER,
  memberRemovedText,
  NAME_NEEDS_LOGIN,
  REALTIME_DOWN,
  REALTIME_RELOAD,
  RELOAD,
  visitErrorOf,
} from "../messages";
import type { CreatedState } from "../sheets/CreateGroupScreen";
import { InviteSheet } from "../sheets/InviteSheet";
import { JoinSheet } from "../sheets/JoinSheet";
import { everyoneFills, gapPrefIds, heatFill } from "../map/colors";
import { PREFS } from "../map/geo";
import { JapanMap } from "../map/JapanMap";
import { Avatar } from "./Avatar";
import {
  countVisitedByAnyone,
  defaultFocusMember,
  inviteUrl,
  meRemoved,
  memberFills,
  membersByCount,
  prefsOf,
  REGIONS,
  resolveMe,
  RoomVisitLog,
  roomVisitAction,
  withRoomVisits,
  shortPrefName,
  visitedByMember,
  withPending,
} from "./calc";
import { PrefSheet } from "./PrefSheet";

type Tab = "mine" | "all" | "member";

// 読み終わったときの中身。notice：参加のシートの一番上に出す文（REQ-025 の「前回の名前が見つかりませんでした」、紐づいた・削除された）。
// toast：最初に出す知らせ（参加した直後）。invite：招待のシートを「グループができました」で開く（作った直後）
type Ready = { status: "ready"; view: GroupView; meId: number | null; notice: string | null; toast: string | null; invite: boolean };
// failed：エラーの画面（文と、「もう一度読み込む」を出すか）
type Loaded = { status: "loading" } | { status: "failed"; text: string; retry: boolean } | Ready;

// 招待のシートの状態。fresh は作った直後（見出しが「グループができました」）
type Invite = "fresh" | "normal" | null;

const PREF_NAMES = new Map(PREFS.map((p) => [p.id, p.name]));
const prefName = (id: number) => PREF_NAMES.get(id) ?? "";

// 知らせ（モックの toast）を出しておく時間
const TOAST_MS = 1800;

// グループの画面（screens の「グループの画面の中身」。見た目と文はモックのまま）。
// グループ（API）と、端末が覚えているメンバーを読んでから描く。「行った」の付け外しは、押したらすぐ仮の表示にして保存し、
// 失敗したら最後に保存できた状態に戻す（screens の「知らせ」）。
// 端末がこのグループのメンバーを覚えていなければ、上に参加のシートを出す（後ろの画面は押せない。モックの onboarding）。
// 覚えていたメンバーがグループにいなければ、その覚えを忘れて、参加のシートに「前回の名前が見つかりませんでした」を出す（REQ-025）。
// 開けなかったとき（削除された、満員、通信エラー、いまは使えない）はエラーの画面（文と行き先は messages の loadErrorOf）
export function GroupScreen({ groupId }: { groupId: string }) {
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });
  // 「もう一度読み込む」を押した回数。変わったら読み直す
  const [attempt, setAttempt] = useState(0);
  const location = useLocation();
  const navigate = useNavigate();
  // グループ作成の画面から来たときの、作ったメンバーの番号（最初に開いたときの1回だけ使う）。
  // 端末に書けなかったときも、作った人として開けるように、覚えの代わりに使う（開いたグループにいるときだけ：calc の resolveMe）
  const [createdMemberId] = useState<number | null>(() => {
    const state = location.state as Partial<CreatedState> | null;
    return typeof state?.createdMemberId === "number" ? state.createdMemberId : null;
  });

  // 作った直後の印は、読み直し（再読み込み）でまた「グループができました」と出ないように、履歴から消しておく
  useEffect(() => {
    if (location.state !== null) void navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [location.state, location.pathname, location.search, navigate]);

  // 開けなかった・読み直せなかったときは、エラーの画面にする。削除されていたら、端末の覚えを忘れる
  const showLoadError = useCallback(
    (e: unknown) => {
      const err = loadErrorOf(failureOf(e));
      if (err.forget) void forgetMember(groupId);
      setLoaded({ status: "failed", text: err.text, retry: err.retry });
    },
    [groupId],
  );

  // 開いたときに1回読む（「もう一度読み込む」でも読む）。読み終わる前に画面を離れたら（StrictMode の2回目も）、古い結果は捨てる
  useEffect(() => {
    let alive = true;
    Promise.all([fetchGroup(groupId), readRememberedMember(groupId)]).then(
      ([view, remembered]) => {
        if (!alive) return;
        const { meId, lostMember } = resolveMe(view.members, remembered?.memberId ?? null, createdMemberId);
        if (lostMember) void forgetMember(groupId);
        setLoaded({
          status: "ready",
          view,
          meId,
          notice: lostMember ? LOST_MEMBER : null,
          toast: null,
          invite: createdMemberId !== null && meId === createdMemberId,
        });
      },
      (e: unknown) => {
        if (alive) showLoadError(e);
      },
    );
    return () => {
      alive = false;
    };
  }, [groupId, createdMemberId, attempt, showLoadError]);

  // 参加できたら、グループを読み直して（新しいメンバーを入れるため）、そのメンバーとして「わたし」を開く。
  // 読み直したときにその人が消えていた・紐づいていた（「続ける」を押すまでの間に、ほかの端末で起きた）ときは、参加のシートに戻す。
  // 端末に覚える名前は、API に保存された名前にそろえる（入れた名前と全角・半角などが違うことがある）
  const onJoined = (memberId: number, toast: string) => {
    fetchGroup(groupId).then((view) => {
      const { meId, lostMember } = resolveMe(view.members, memberId, null);
      const me = view.members.find((m) => m.id === meId);
      if (me) void rememberMember(groupId, { memberId: me.id, name: me.name });
      else void forgetMember(groupId);
      const notice = meId !== null ? null : lostMember ? LOST_MEMBER : NAME_NEEDS_LOGIN;
      setLoaded({ status: "ready", view, meId, notice, toast: meId !== null ? toast : null, invite: false });
    }, showLoadError);
  };

  // 参加できないと分かったとき：削除された（覚えを忘れる）、満員
  const onGone = (why: "deleted" | "full") => {
    if (why === "deleted") void forgetMember(groupId);
    setLoaded({ status: "failed", text: why === "deleted" ? GROUP_DELETED : GROUP_FULL, retry: false });
  };

  // 付け外しで、自分のメンバーが紐づいた・削除されたと分かったとき：覚えを忘れて、参加のシートに文を出す。
  // 参加のシートの「参加中」に消された人が残らないように、グループを読み直して入れ替える（読めなければ、いまの一覧のまま）
  const onRejoin = (text: string) => {
    void forgetMember(groupId);
    setLoaded((d) => (d.status === "ready" ? { ...d, meId: null, notice: text, toast: null, invite: false } : d));
    fetchGroup(groupId).then(
      (view) => setLoaded((d) => (d.status === "ready" && d.meId === null ? { ...d, view } : d)),
      () => {},
    );
  };

  // 付け外しで、グループが削除されたと分かったとき：覚えを忘れて、エラーの画面
  const onDeleted = () => onGone("deleted");

  // 付け外しが画面の不具合で断られたとき：グループを読み直す（読めなければエラーの画面）
  const onReload = () => {
    fetchGroup(groupId).then((view) => setLoaded((d) => (d.status === "ready" ? { ...d, view } : d)), showLoadError);
  };

  // ---- リアルタイム（部屋）。参加した後（自分のメンバーが決まっている）だけつなぎ、画面を離れたら・参加のシートに戻ったら切る ----
  // 帯（つながっていない状態が5秒続いた）を出すか
  const [banner, setBanner] = useState(false);
  // 部屋から届いたときに、いまの中身を見るための写し（届くのは描画の外なので）
  const loadedRef = useRef(loaded);
  useEffect(() => {
    loadedRef.current = loaded;
  }, [loaded]);
  // 裏の読み直しの番号。後から始めた読み直しの結果だけを使う（応答の順番が入れ替わっても、古い中身で上書きしない）
  const reloadSeq = useRef(0);
  // 読み直しが飛んでいる間に部屋から届いた付け外し（届いた順）。読み直しは、始めた後に届いた分を結果に入れ直す
  // （読み直しの中身は、その付け外しより前に D1 を読んだものかもしれず、そのまま使うと届いた変更が消えるため）
  const visitLog = useRef(new RoomVisitLog());
  const roomRef = useRef<RoomConnection | null>(null);

  // 裏でグループを読み直す（「取り直して」、知らないメンバーの変更、つなぎ直し、画面に戻った、帯の「読み直す」）。
  // 自分のメンバーがいなくなっていたら、覚えを忘れて参加のシートに「（名前）さんはグループから削除されました」。
  // グループが削除されていたら、覚えを忘れてエラーの画面。それ以外の失敗は、いまの画面のまま（screens の「リアルタイムで読み直したときの失敗」）。
  // 返す値：その失敗（いまの画面のまま）なら false。帯の「読み直す」は、false のときに知らせを出す
  const reloadQuietly = useCallback((): Promise<boolean> => {
    const seq = ++reloadSeq.current;
    const mark = visitLog.current.start();
    return fetchGroup(groupId).then(
      (fetched) => {
        const view = withRoomVisits(fetched, visitLog.current.finish(mark));
        if (seq !== reloadSeq.current) return true;
        const d = loadedRef.current;
        if (d.status === "ready" && meRemoved(view.members, d.meId)) {
          const name = d.view.members.find((m) => m.id === d.meId)?.name ?? "";
          void forgetMember(groupId);
          setLoaded((cur) =>
            cur.status === "ready" && cur.meId === d.meId
              ? { ...cur, view, meId: null, notice: memberRemovedText(name), toast: null, invite: false }
              : cur,
          );
        } else {
          setLoaded((cur) => (cur.status === "ready" ? { ...cur, view } : cur));
        }
        return true;
      },
      (e: unknown) => {
        visitLog.current.finish(mark);
        if (seq !== reloadSeq.current) return true;
        if (backgroundLoadErrorOf(failureOf(e)) === "quiet") return false;
        if (loadedRef.current.status === "ready") {
          void forgetMember(groupId);
          setLoaded({ status: "failed", text: GROUP_DELETED, retry: false });
        }
        return true;
      },
    );
  }, [groupId]);

  // 部屋から「行った」の付け外しが届いたとき：知っているメンバーなら、最後に保存できた「行った」に入れる
  // （送っている途中の県でも入れる。失敗して戻すときに、届いた変更が消えないように：screens の「行った」の付け外し）。知らないメンバーなら読み直す
  const onRoomVisit = useCallback(
    (memberId: number, pref: number, visited: boolean) => {
      const d = loadedRef.current;
      if (d.status !== "ready") return;
      visitLog.current.record({ memberId, pref, visited });
      if (roomVisitAction(d.view.members, memberId) === "refetch") {
        void reloadQuietly();
        return;
      }
      setLoaded((cur) =>
        cur.status === "ready" ? { ...cur, view: { ...cur.view, visits: applyVisit(cur.view.visits, memberId, pref, visited) } } : cur,
      );
    },
    [reloadQuietly],
  );

  // 参加した後だけ部屋につなぐ。画面に戻ったとき（visibilitychange で visible）は、つながっていれば読み直し、切れていればすぐにつなぐ
  const meIdNow = loaded.status === "ready" ? loaded.meId : null;
  useEffect(() => {
    if (meIdNow === null) return;
    const room = connectRoom(groupId, { onVisit: onRoomVisit, onRefetch: () => void reloadQuietly(), onBanner: setBanner });
    roomRef.current = room;
    // つながっていれば読み直す。切れていれば、すぐにつなぐだけ（つながったとき＝2回目以降の ready で読み直されるので、2回読まない）
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (room.isConnected()) void reloadQuietly();
      else room.reconnectNow();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      room.close();
      roomRef.current = null;
      setBanner(false);
    };
  }, [groupId, meIdNow, onRoomVisit, reloadQuietly]);

  // 帯の「読み直す」：グループを読み直し、つなぎ直しの回数を数え直してすぐにつなぐ。読み直しが失敗したら false（画面が知らせを出す）
  const onBannerReload = (): Promise<boolean> => {
    roomRef.current?.reconnectNow();
    return reloadQuietly();
  };

  if (loaded.status === "loading") {
    return (
      <main className="wrap">
        <p className="message">読み込み中…</p>
      </main>
    );
  }
  if (loaded.status === "failed") {
    return (
      <main className="wrap">
        <p className="message">{loaded.text}</p>
        {loaded.retry && (
          <p>
            <button
              className="primary"
              type="button"
              onClick={() => {
                setLoaded({ status: "loading" });
                setAttempt((n) => n + 1);
              }}
            >
              {RELOAD}
            </button>
          </p>
        )}
        <p>
          <a href="/">トップへ</a>
        </p>
        <FooterLinks />
      </main>
    );
  }
  const joining = loaded.meId === null;
  return (
    <>
      {/* key に自分の番号を渡すのは、参加した後に「わたし」から始め直すため（タブなどの表示を作り直す） */}
      <GroupBody
        key={loaded.meId ?? "guest"}
        groupId={groupId}
        view={loaded.view}
        meId={loaded.meId}
        inert={joining}
        initialToast={loaded.toast}
        initialInvite={loaded.invite ? "fresh" : null}
        banner={banner}
        onBannerReload={onBannerReload}
        onSaved={(memberId, pref, visited) =>
          setLoaded((d) =>
            d.status === "ready" ? { ...d, view: { ...d.view, visits: applyVisit(d.view.visits, memberId, pref, visited) } } : d,
          )
        }
        onRejoin={onRejoin}
        onDeleted={onDeleted}
        onReload={onReload}
      />
      {joining && (
        <JoinSheet
          groupId={groupId}
          groupName={loaded.view.group.name}
          members={loaded.view.members}
          notice={loaded.notice}
          onJoined={onJoined}
          onGone={onGone}
        />
      )}
    </>
  );
}

type BodyProps = {
  groupId: string;
  // 保存できた「行った」（失敗したらここに戻る）
  view: GroupView;
  meId: number | null;
  // 参加のシートが出ている間は、後ろの画面を押せないようにする（キーボードでも届かない）
  inert: boolean;
  // 最初に出す知らせ（参加した直後）
  initialToast: string | null;
  // 最初に開いておく招待のシート（作った直後は fresh）
  initialInvite: Invite;
  // 保存できたら、保存できた「行った」に入れる
  onSaved: (memberId: number, pref: number, visited: boolean) => void;
  // 付け外しが断られたとき：自分のメンバーが紐づいた・削除された（参加のシートに文）、グループが削除された、画面の不具合（読み直す）
  onRejoin: (text: string) => void;
  onDeleted: () => void;
  onReload: () => void;
  // リアルタイムの帯を出すか、帯の「読み直す」（失敗したら false）
  banner: boolean;
  onBannerReload: () => Promise<boolean>;
};

// 読み終わった後のグループの画面。タブ・まとめ・地図・凡例・全員まだの県・地方ごとの一覧・県の詳細のシート・知らせ
function GroupBody({
  groupId,
  view,
  meId,
  inert,
  initialToast,
  initialInvite,
  onSaved,
  onRejoin,
  onDeleted,
  onReload,
  banner,
  onBannerReload,
}: BodyProps) {
  const { members } = view;
  // 自分がいなければ（端末が覚えていない）、わたし は選べないので みんな から始める（モックの最初の画面と同じ）
  const [tab, setTab] = useState<Tab>(meId !== null ? "mine" : "all");
  const [focusPick, setFocusPick] = useState<number | null>(null);
  const [showGap, setShowGap] = useState(true);
  // 送っている途中の付け外し（県 → 付けるか）。画面にはこれを重ねて出す
  const [pending, setPending] = useState<ReadonlyMap<number, boolean>>(new Map());
  // 送っている途中の県。続けて押されたとき、描き直しを待たずに断るために、描画とは別に持つ
  const inFlight = useRef(new Set<number>());
  const [sheetPref, setSheetPref] = useState<number | null>(null);
  const [toast, setToast] = useState<{ text: string; key: number } | null>(initialToast !== null ? { text: initialToast, key: 1 } : null);
  const [invite, setInvite] = useState<Invite>(initialInvite);

  const shown = useMemo(() => withPending(view.visits, meId, pending), [view.visits, meId, pending]);
  const me = members.find((m) => m.id === meId) ?? null;
  // メンバー別で選んでいる人。選んだ人がいなければ、自分以外の最初の人（モックの focusMember）
  const focusId = focusPick !== null && members.some((m) => m.id === focusPick) ? focusPick : defaultFocusMember(members, meId);
  const focus = members.find((m) => m.id === focusId) ?? null;
  // わたし・メンバー別で地図と一覧に出す人
  const shownMember = tab === "mine" ? me : tab === "member" ? focus : null;
  const byMember = useMemo(() => visitedByMember(members, shown), [members, shown]);
  const gapIds = useMemo(() => gapPrefIds(byMember), [byMember]);

  const showToast = (text: string) => setToast((t) => ({ text, key: (t?.key ?? 0) + 1 }));

  // 知らせは少したったら消す。新しい知らせが出たら、そこから数え直す
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  // 付け外しが失敗したときの文と行き先（messages の visitErrorOf）。文に入れる名前は自分のメンバーの名前
  const myName = me?.name ?? "";
  const onSaveFailed = (e: unknown) => {
    const action = visitErrorOf(failureOf(e), myName);
    if (action.kind === "toast") {
      showToast(action.text);
      if (action.reload) onReload();
    } else if (action.kind === "rejoin") {
      onRejoin(action.text);
    } else {
      onDeleted();
    }
  };

  // 自分の「行った」を付け外しする（モックの toggleMine）。送っている途中の県は押せない。
  // 失敗したら仮の表示を戻し（保存できた「行った」は変えていない）、onSaveFailed で文と行き先を選ぶ
  const toggleMine = (pref: number) => {
    if (meId === null || inFlight.current.has(pref)) return;
    const visited = !shown.some((v) => v.memberId === meId && v.pref === pref);
    inFlight.current.add(pref);
    setPending((p) => new Map(p).set(pref, visited));
    showToast(visited ? `${prefName(pref)} に行った！` : `${prefName(pref)} を外しました`);
    const done = () => {
      inFlight.current.delete(pref);
      setPending((p) => {
        const next = new Map(p);
        next.delete(pref);
        return next;
      });
    };
    saveVisit(groupId, meId, pref, visited).then(
      () => {
        onSaved(meId, pref, visited);
        done();
      },
      (e: unknown) => {
        done();
        onSaveFailed(e);
      },
    );
  };

  // 地図か一覧の県を押したとき（モックの onPref）：わたし なら付け外し、ほかは県の詳細
  const onPref = (pref: number) => {
    if (tab === "mine" && meId !== null) toggleMine(pref);
    else setSheetPref(pref);
  };
  const closeSheet = useCallback(() => setSheetPref(null), []);
  const closeInvite = useCallback(() => setInvite(null), []);

  const fills =
    tab === "all"
      ? everyoneFills(byMember, showGap)
      : shownMember
        ? memberFills(prefsOf(shown, shownMember.id), memberColor(shownMember.color))
        : {};
  const outlined = tab === "all" && showGap ? new Set(gapIds) : undefined;

  return (
    <div className="wrap" inert={inert}>
      {/* リアルタイムの帯（screens の「知らせ」。見た目は Phase 3 で整える）。読み直せなかったら知らせ「読み込めませんでした…」（仮の動き 2026-10-26） */}
      {banner && (
        <div className="rtbanner" role="status">
          <span>{REALTIME_DOWN}</span>
          <button
            type="button"
            onClick={() => {
              void onBannerReload().then((ok) => {
                if (!ok) showToast(LOAD_FAILED);
              });
            }}
          >
            {REALTIME_RELOAD}
          </button>
        </div>
      )}
      <header className="top">
        <div className="gname disp">
          <small>グループ</small>
          <b>{view.group.name}</b>
        </div>
        <a className="iconbtn" href="/">
          トップへ
        </a>
        <button className="iconbtn" type="button" aria-label="招待リンクを表示" onClick={() => setInvite("normal")}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
            <path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
          </svg>
          招待
        </button>
      </header>

      <main>
        <div className="tabs" role="tablist">
          {(
            [
              ["mine", "わたし"],
              ["all", "みんな"],
              ["member", "メンバー別"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              type="button"
              aria-selected={tab === key}
              disabled={key === "mine" && meId === null}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <Summary tab={tab} view={view} visits={shown} meId={meId} focusId={focusId} onFocus={setFocusPick} />

        <div className="mapcard">
          <JapanMap fills={fills} outlined={outlined} onSelect={onPref} />
          <Legend tab={tab} total={members.length} showGap={showGap} color={shownMember ? memberColor(shownMember.color) : null} />
        </div>
        <p className="hint">{hintText(tab, meId !== null)}</p>

        {tab === "all" && (
          <section className="gapcard">
            <div className="gaphead">
              <b className="disp">全員まだ行っていない県 {gapIds.length}</b>
              <button type="button" className="switch" aria-pressed={showGap} onClick={() => setShowGap((v) => !v)}>
                地図で強調
              </button>
            </div>
            <div className="chips">
              {gapIds.length ? (
                gapIds.map((id) => (
                  <button key={id} type="button" className="pchip gapc" onClick={() => setSheetPref(id)}>
                    {shortPrefName(prefName(id))}
                  </button>
                ))
              ) : (
                <span className="muted">全県だれかが行っています</span>
              )}
            </div>
          </section>
        )}

        <section>
          {REGIONS.map((region) => (
            <div key={region.name} className="region">
              <h3>{region.name}</h3>
              <div className="chips">
                {region.prefs.map((id) => {
                  const label = shortPrefName(prefName(id));
                  if (shownMember) {
                    const on = shown.some((v) => v.memberId === shownMember.id && v.pref === id);
                    return (
                      <button
                        key={id}
                        type="button"
                        className={on ? "pchip on" : "pchip"}
                        style={{ "--pc": memberColor(shownMember.color) } as CSSProperties}
                        aria-pressed={on}
                        disabled={tab === "mine" && pending.has(id)}
                        onClick={() => onPref(id)}
                      >
                        {label}
                      </button>
                    );
                  }
                  const n = byMember.filter((prefs) => prefs.includes(id)).length;
                  return (
                    <button key={id} type="button" className="pchip" onClick={() => onPref(id)}>
                      <span className="sw" style={{ background: heatFill(n, members.length) }} />
                      {label}
                      <em>
                        {n}/{members.length}
                      </em>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      </main>

      <footer className="foot">
        <FooterLinks />
        <MapCredit />
      </footer>

      {sheetPref !== null && (
        <PrefSheet
          pref={sheetPref}
          prefName={prefName(sheetPref)}
          members={members}
          visits={shown}
          meId={meId}
          busy={pending.has(sheetPref)}
          onToggle={() => toggleMine(sheetPref)}
          onClose={closeSheet}
        />
      )}

      {invite !== null && (
        <InviteSheet
          url={inviteUrl(window.location.origin, groupId)}
          groupName={view.group.name}
          fresh={invite === "fresh"}
          onToast={showToast}
          onClose={closeInvite}
        />
      )}

      {/* 知らせ。見た目の知らせは出し入れするが、読み上げ用の入れ物（role="status"）はいつも見えない形で置いておき、中身だけを変える
          （hidden で隠した入れ物は読み上げの対象から外れ、中身が変わっても読まれないことがあるため） */}
      <div className="toast" aria-hidden="true" hidden={!toast}>
        {toast?.text}
      </div>
      <div className="sr-only" role="status">
        {toast?.text}
      </div>
    </div>
  );
}

// 地図の下のヒントの文（モックの renderSummary の hint）。わたし は自分がいるときだけ
function hintText(tab: Tab, hasMe: boolean): string {
  if (tab === "mine") return hasMe ? "地図か下の一覧をタップすると「行った」を付け外しできます。" : "";
  if (tab === "all") return "色が濃いほど、行ったことのある人が多い県です。タップすると誰が行ったか見られます。";
  return "メンバーを選ぶと、その人が行った都道府県だけに色が付きます。";
}

type SummaryProps = {
  tab: Tab;
  view: GroupView;
  visits: GroupView["visits"];
  meId: number | null;
  focusId: number | null;
  onFocus: (id: number) => void;
};

// まとめ（モックの renderSummary）。わたし：自分の数。みんな：誰かが行った数と、メンバーごとの数（多い順）。メンバー別：人を選ぶボタンとその人の数
function Summary({ tab, view, visits, meId, focusId, onFocus }: SummaryProps) {
  const { members } = view;
  const me = members.find((m) => m.id === meId);
  if (tab === "mine" && me) {
    const n = prefsOf(visits, me.id).length;
    return (
      <section className="summary">
        <div className="big disp">
          <span className="n">{n}</span>
          <span className="of">/ 47 都道府県に行った</span>
        </div>
        <div className="bar">
          <i style={{ width: `${(n / 47) * 100}%`, background: memberColor(me.color) }} />
        </div>
      </section>
    );
  }
  if (tab === "all") {
    return (
      <section className="summary">
        <div className="big disp">
          <span className="n">{countVisitedByAnyone(members, visits)}</span>
          <span className="of">/ 47 誰かが行った（{members.length}人）</span>
        </div>
        <div className="members">
          {membersByCount(members, visits).map(({ member, count }) => (
            <div key={member.id} className="mrow">
              <span className="nm">
                <Avatar name={member.name} color={memberColor(member.color)} />
                {member.name}
                {member.id === meId && <small className="muted">（自分）</small>}
              </span>
              <div className="bar">
                <i style={{ width: `${(count / 47) * 100}%`, background: memberColor(member.color) }} />
              </div>
              <span className="cnt">{count} / 47</span>
            </div>
          ))}
        </div>
      </section>
    );
  }
  const focus = members.find((m) => m.id === focusId);
  return (
    <section className="summary">
      <div className="chips" role="group" aria-label="表示するメンバー">
        {members.map((m) => (
          <button
            key={m.id}
            type="button"
            className="mchip"
            style={{ "--c": memberColor(m.color) } as CSSProperties}
            aria-pressed={m.id === focusId}
            onClick={() => onFocus(m.id)}
          >
            <Avatar name={m.name} color={memberColor(m.color)} />
            {m.name}
          </button>
        ))}
      </div>
      {focus && (
        <div className="big disp">
          <span className="n">{prefsOf(visits, focus.id).length}</span>
          <span className="of">/ 47 {focus.name}さんが行った</span>
        </div>
      )}
    </section>
  );
}

type LegendProps = { tab: Tab; total: number; showGap: boolean; color: string | null };

// 色の凡例（モックの renderLegend）。みんな：人数と濃さ。わたし・メンバー別：その人の色と「まだ」
function Legend({ tab, total, showGap, color }: LegendProps) {
  if (tab === "all") {
    return (
      <div className="legend">
        <span>
          <i style={{ background: "var(--h4)" }} />
          全員（{total}人）
        </span>
        <span>
          <i style={{ background: "var(--h3)" }} />
          多い
        </span>
        <span>
          <i style={{ background: "var(--h1)" }} />
          少ない
        </span>
        <span>
          <i style={showGap ? { background: "var(--gap-fill)", borderColor: "var(--gap-line)" } : { background: "var(--land)" }} />
          全員まだ
        </span>
      </div>
    );
  }
  if (!color) return null;
  return (
    <div className="legend">
      <span>
        <i style={{ background: color }} />
        行った
      </span>
      <span>
        <i style={{ background: "var(--land)" }} />
        まだ
      </span>
    </div>
  );
}
