import { useId, useRef } from "react";
import { Sheet } from "./Sheet";

type Props = {
  url: string;
  groupName: string;
  // 作った直後か（見出しが「グループができました」になる。モックの openInvite(fresh)）
  fresh: boolean;
  onToast: (text: string) => void;
  onClose: () => void;
};

// 招待のシート（REQ-002・REQ-003、モックの openInvite）。招待URLとコピーのボタン、Web Share API が使えるときだけシェアのボタン、閉じる。
// コピーできない（navigator.clipboard がない、断られた）ときは、URL の文字を選んで、自分でコピーしてもらう（モックの selectUrl）
export function InviteSheet({ url, groupName, fresh, onToast, onClose }: Props) {
  const titleId = useId();
  const urlRef = useRef<HTMLElement>(null);
  const canShare = typeof navigator.share === "function";

  // URL の文字を選ぶ（中身は変えない。選んだ範囲だけを変える）
  const selectUrl = () => {
    const el = urlRef.current;
    const selection = window.getSelection();
    if (el && selection) {
      const range = document.createRange();
      range.selectNodeContents(el);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    onToast("リンクを選択しました");
  };

  // コピー。使えなければ（http の画面や古いブラウザでは clipboard がない）文字を選ぶ
  const copy = () => {
    if (!navigator.clipboard) {
      selectUrl();
      return;
    }
    navigator.clipboard.writeText(url).then(() => onToast("リンクをコピーしました"), selectUrl);
  };

  // シェア（スマホの共有の画面を開く）。やめたときも失敗になるので、何も出さない
  const share = () => {
    navigator.share({ url }).catch(() => {});
  };

  return (
    <Sheet labelledBy={titleId} onClose={onClose}>
      <h2 className="disp" id={titleId}>
        {fresh ? "グループができました" : "友達を招待"}
      </h2>
      <p className="sub">このリンクを送ると、名前を入れるだけで「{groupName}」に参加できます。</p>
      <div className="urlbox">
        <code ref={urlRef}>{url}</code>
        <button type="button" className="iconbtn" onClick={copy}>
          コピー
        </button>
      </div>
      {canShare && (
        <button type="button" className="primary ghost share" onClick={share}>
          シェア
        </button>
      )}
      <button type="button" className="primary" onClick={onClose}>
        閉じる
      </button>
    </Sheet>
  );
}
