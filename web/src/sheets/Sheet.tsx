import { useEffect, useRef, type ReactNode } from "react";

type Props = {
  // 見出しの id（読み上げで、何のシートかを読ませる）
  labelledBy: string;
  // 閉じる処理。null なら閉じられない（参加・グループ作成：名前を入れるまで閉じない。モックの openSheet(…, false)）
  onClose: (() => void) | null;
  children: ReactNode;
};

// 下から出るシートの入れ物（モックの openSheet）。背景を押すか Esc で閉じる（閉じられるときだけ）。
// 開いたら最初の入力欄に（なければシートに）キーボードの位置を移し、閉じたら開く前の場所に戻す
export function Sheet({ labelledBy, onClose, children }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);

  // Esc で閉じる。閉じられるシートが開いている間だけ、ページ全体のキーを聞く
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 開いたときにキーボードの位置を移し、閉じたら元のボタンに戻す（読み上げでもシートが開いたと分かるように）
  useEffect(() => {
    const before = document.activeElement;
    const sheet = sheetRef.current;
    (sheet?.querySelector("input") ?? sheet)?.focus();
    return () => {
      if (before instanceof HTMLElement) before.focus();
    };
  }, []);

  return (
    <>
      <div className="scrim" onClick={onClose ?? undefined} />
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={labelledBy} ref={sheetRef} tabIndex={-1}>
        <div className="grab" />
        {children}
      </div>
    </>
  );
}
