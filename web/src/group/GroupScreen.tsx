import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { memberColor } from "../data/memberColors";
import { applyVisit, fetchGroup, readRememberedMember, saveVisit } from "../data/store";
import type { GroupView } from "../data/types";
import { FooterLinks, MapCredit } from "../Footer";
import { everyoneFills, gapPrefIds, heatFill } from "../map/colors";
import { PREFS } from "../map/geo";
import { JapanMap } from "../map/JapanMap";
import { Avatar } from "./Avatar";
import {
  countVisitedByAnyone,
  defaultFocusMember,
  findMeId,
  memberFills,
  membersByCount,
  prefsOf,
  REGIONS,
  shortPrefName,
  visitedByMember,
  withPending,
} from "./calc";
import { PrefSheet } from "./PrefSheet";

type Tab = "mine" | "all" | "member";

type Loaded = { status: "loading" } | { status: "failed" } | { status: "ready"; view: GroupView; meId: number | null };

const PREF_NAMES = new Map(PREFS.map((p) => [p.id, p.name]));
const prefName = (id: number) => PREF_NAMES.get(id) ?? "";

// 知らせ（モックの toast）を出しておく時間
const TOAST_MS = 1800;
// 表にない失敗の文（.claude/rules/web.md、screens の「知らせ」）
const SAVE_FAILED = "保存できませんでした。もう一度お試しください";
// グループを読めなかったときの仮の文（2026-10-22。API につなぐ項目で、削除された・いまは使えないと合わせて決め直す）
const LOAD_FAILED = "読み込めませんでした。もう一度お試しください";

// グループの画面（screens の「グループの画面の中身」。見た目と文はモックのまま）。
// グループと、端末が覚えているメンバーを読んでから描く。「行った」の付け外しは、押したらすぐ仮の表示にして保存し、
// 失敗したら最後に保存できた状態に戻す（screens の「知らせ」）
export function GroupScreen({ groupId }: { groupId: string }) {
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });

  // 開いたときに1回読む。読み終わる前に画面を離れたら（StrictMode の2回目も）、古い結果は捨てる
  useEffect(() => {
    let alive = true;
    Promise.all([fetchGroup(groupId), readRememberedMember(groupId)]).then(
      ([view, remembered]) => {
        if (alive) setLoaded({ status: "ready", view, meId: findMeId(view.members, remembered?.memberId ?? null) });
      },
      () => {
        if (alive) setLoaded({ status: "failed" });
      },
    );
    return () => {
      alive = false;
    };
  }, [groupId]);

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
        <p className="message">{LOAD_FAILED}</p>
        <p>
          <a href="/">トップへ</a>
        </p>
        <FooterLinks />
      </main>
    );
  }
  return (
    <GroupBody
      groupId={groupId}
      view={loaded.view}
      meId={loaded.meId}
      onSaved={(memberId, pref, visited) =>
        setLoaded((d) =>
          d.status === "ready" ? { ...d, view: { ...d.view, visits: applyVisit(d.view.visits, memberId, pref, visited) } } : d,
        )
      }
    />
  );
}

type BodyProps = {
  groupId: string;
  // 保存できた「行った」（失敗したらここに戻る）
  view: GroupView;
  meId: number | null;
  // 保存できたら、保存できた「行った」に入れる
  onSaved: (memberId: number, pref: number, visited: boolean) => void;
};

// 読み終わった後のグループの画面。タブ・まとめ・地図・凡例・全員まだの県・地方ごとの一覧・県の詳細のシート・知らせ
function GroupBody({ groupId, view, meId, onSaved }: BodyProps) {
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
  const [toast, setToast] = useState<{ text: string; key: number } | null>(null);

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

  // 自分の「行った」を付け外しする（モックの toggleMine）。送っている途中の県は押せない
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
      () => {
        done();
        showToast(SAVE_FAILED);
      },
    );
  };

  // 地図か一覧の県を押したとき（モックの onPref）：わたし なら付け外し、ほかは県の詳細
  const onPref = (pref: number) => {
    if (tab === "mine" && meId !== null) toggleMine(pref);
    else setSheetPref(pref);
  };
  const closeSheet = useCallback(() => setSheetPref(null), []);

  const fills =
    tab === "all"
      ? everyoneFills(byMember, showGap)
      : shownMember
        ? memberFills(prefsOf(shown, shownMember.id), memberColor(shownMember.color))
        : {};
  const outlined = tab === "all" && showGap ? new Set(gapIds) : undefined;

  return (
    <div className="wrap">
      <header className="top">
        <div className="gname disp">
          <small>グループ</small>
          <b>{view.group.name}</b>
        </div>
        <a className="iconbtn" href="/">
          トップへ
        </a>
        {/* 招待のシートは 3-5 で作る。それまでは押せない */}
        <button className="iconbtn" type="button" aria-label="招待リンクを表示" disabled>
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
