import { useMemo, useState } from "react";
import { everyoneFills, gapPrefIds } from "./map/colors";
import { DEMO_MEMBERS } from "./map/demo";
import { PREFS } from "./map/geo";
import { JapanMap } from "./map/JapanMap";

// アプリの画面の一番外側の部品。いまは地図の部品を確かめるだけ（3-4 でグループの画面に置き換える）。
// 仮の3人の「行った」を「みんな」の塗りで出し、全員まだの県を強調する。押した県の名前を地図の下に出す
export function App() {
  const [selected, setSelected] = useState<number | null>(null);
  const visitedByMember = useMemo(() => DEMO_MEMBERS.map((m) => m.visited), []);
  const fills = useMemo(() => everyoneFills(visitedByMember, true), [visitedByMember]);
  const outlined = useMemo(() => new Set(gapPrefIds(visitedByMember)), [visitedByMember]);
  const selectedName = PREFS.find((p) => p.id === selected)?.name;

  return (
    <main className="wrap">
      <h1>旅会議マップ</h1>
      <div className="mapcard">
        <JapanMap fills={fills} outlined={outlined} onSelect={setSelected} />
      </div>
      {selectedName && <p>{selectedName}を押しました</p>}
      <p className="credit">
        地図：「国土数値情報（行政区域データ）」（国土交通省）を加工して作成（
        <a href="https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2025.html">国土交通省国土数値情報ダウンロードサイト</a>）
      </p>
    </main>
  );
}
