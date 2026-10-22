import { useId } from "react";
import { memberColor } from "../data/memberColors";
import type { GroupMember, Visit } from "../data/types";
import { Sheet } from "../sheets/Sheet";
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
// 背景を押すか Esc で閉じる（入れ物は Sheet。モックの openSheet）
export function PrefSheet({ pref, prefName, members, visits, meId, busy, onToggle, onClose }: Props) {
  const titleId = useId();
  const { rows, count } = prefVisitors(members, visits, pref);
  const mine = meId !== null && visits.some((v) => v.memberId === meId && v.pref === pref);

  return (
    <Sheet labelledBy={titleId} onClose={onClose}>
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
    </Sheet>
  );
}
