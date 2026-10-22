import { useEffect, useId, useRef } from "react";
import { memberColor } from "../data/memberColors";
import type { GroupMember, Visit } from "../data/types";
import { prefVisitors } from "./calc";
import { Avatar } from "./Avatar";

type Props = {
  pref: number;
  prefName: string;
  members: readonly GroupMember[];
  // 画面に出している「行った」（送っている途中の付け外しも重ねたもの）
  visits: readonly Visit[];
  // 自分のメンバーの番号。いなければ（端末が覚えていない）付け外しのボタンを出さない（モックと同じ）
  meId: number | null;
  // その県の付け外しを送っている途中か（途中はボタンを押せない）
  busy: boolean;
  onToggle: () => void;
  onClose: () => void;
};

// 県の詳細のシート（モックの openPrefSheet）。「N人中M人」と、行った人が先の名前の一覧、自分の「行った」の付け外し。
// 背景を押すか Esc で閉じる（モックの openSheet）。開いたらシートに、閉じたら開く前の場所に、キーボードの位置を移す
export function PrefSheet({ pref, prefName, members, visits, meId, busy, onToggle, onClose }: Props) {
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const { rows, count } = prefVisitors(members, visits, pref);
  const mine = meId !== null && visits.some((v) => v.memberId === meId && v.pref === pref);

  // Esc で閉じる。開いている間だけ、ページ全体のキーを聞く
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 開いたときにシートへキーボードの位置を移し、閉じたら元のボタンに戻す（読み上げでもシートが開いたと分かるように）
  useEffect(() => {
    const before = document.activeElement;
    sheetRef.current?.focus();
    return () => {
      if (before instanceof HTMLElement) before.focus();
    };
  }, []);

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={sheetRef} tabIndex={-1}>
        <div className="grab" />
        <h2 className="disp" id={titleId}>
          {prefName}
        </h2>
        <p className="sub">
          {count ? `${members.length}人中 ${count}人が行ったことがあります` : "全員まだ行ったことがありません。旅行先の候補にどうですか？"}
        </p>
        <div className="who">
          {rows.map(({ member, visited }) => (
            <div key={member.id} className={visited ? "row yes" : "row"}>
              <Avatar name={member.name} color={memberColor(member.color)} size={26} />
              {member.name}
              {member.id === meId ? "（自分）" : ""}
              <span className="st">{visited ? "行った" : "まだ"}</span>
            </div>
          ))}
        </div>
        {meId !== null && (
          <button type="button" className={mine ? "primary ghost" : "primary"} onClick={onToggle} disabled={busy}>
            {mine ? "自分の「行った」を外す" : "自分も行ったことがある"}
          </button>
        )}
      </div>
    </>
  );
}
