// 地図の形（tools/paths.json）を画面で使う形にする。元のデータは tools/ の1か所だけに置く（web/ にコピーしない）
import paths from "../../../tools/paths.json";

// paths.json の形。c（県の中心の位置）は画面では使わない
type MapData = {
  W: number;
  H: number;
  // 沖縄の囲みの範囲 [左, 上, 右, 下]
  okiBox: readonly number[];
  p: Record<string, { n: string; d: string }>;
};

// 型を当てるだけでなく確かめる（paths.json の形が変わったら npm run typecheck で気づく）
const data: MapData = paths;

export type Pref = { id: number; name: string; d: string };

export const MAP_WIDTH = data.W;
export const MAP_HEIGHT = data.H;
export const OKINAWA_BOX = data.okiBox;

// 県の一覧（番号の順）
export const PREFS: readonly Pref[] = Object.entries(data.p)
  .map(([id, v]) => ({ id: Number(id), name: v.n, d: v.d }))
  .sort((a, b) => a.id - b.id);
