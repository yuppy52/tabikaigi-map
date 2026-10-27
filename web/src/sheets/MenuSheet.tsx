import { useId } from "react";
import { Sheet } from "./Sheet";

type Props = {
  groupName: string;
  // 自分のメンバーの名前（「（名前） として参加中」）
  myName: string;
  onSettings: () => void;
  onClose: () => void;
};

// メニューのシート（screens の「メニューの中身」、ワイヤーフレームの 7）。ヘッダーの自分の名前のボタンから開く。
// 見出しはグループ名、その下に「（名前） として参加中」。項目はグループ設定・トップ・プライバシーポリシー・お問い合わせ。
// 「ログイン」「グループ一覧」「マイページ」は、ログインの画面と一緒に Phase 3 で足す（2026-10-28）。
// 背景を押すか Esc で閉じる（入れ物は Sheet）。リンクの行き先は一番下のリンク（Footer）と同じ
export function MenuSheet({ groupName, myName, onSettings, onClose }: Props) {
  const titleId = useId();
  return (
    <Sheet labelledBy={titleId} onClose={onClose}>
      <h2 className="disp" id={titleId}>
        {groupName}
      </h2>
      <p className="sub">{myName} として参加中</p>
      <nav className="menu" aria-labelledby={titleId}>
        <button type="button" onClick={onSettings}>
          グループ設定
        </button>
        <a href="/">トップ</a>
        <a href="/privacy">プライバシーポリシー</a>
        <a href="/contact">お問い合わせ</a>
      </nav>
    </Sheet>
  );
}
