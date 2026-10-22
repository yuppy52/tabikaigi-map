import { initialOf } from "./calc";

// メンバーの丸いアイコン（モックの avatar）。その人の色の丸に、名前の最初の1文字を出す。
// 名前は横に書いてあるので、読み上げでは読ませない
export function Avatar({ name, color, size }: { name: string; color: string; size?: number }) {
  return (
    <span className="dot" style={{ background: color, ...(size ? { width: size, height: size } : {}) }} aria-hidden="true">
      {initialOf(name)}
    </span>
  );
}
