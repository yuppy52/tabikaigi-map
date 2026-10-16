// 国土数値情報 N03（行政区域、都道府県単位）から、gen-map.mjs が読む japan.topojson を作る。
// 考え方：島ごとに分かれた形を県コードでまとめ、県の境目を共有する TopoJSON にしてから線を間引く
// （境目を共有しているので、間引いても隣の県とすき間ができない）。
import fs from 'fs';
import * as tsv from 'topojson-server';
import * as ts from 'topojson-simplify';
import * as d3 from 'd3-geo';

const SRC = new URL('./n03/N03-20250101_prefecture.geojson', import.meta.url);
const src = JSON.parse(fs.readFileSync(SRC));

// 県コード（N03_007 の先頭2桁）ごとに、島の形を1つの MultiPolygon に集める
const byPref = new Map();
for (const f of src.features) {
  const id = Number(f.properties.N03_007.slice(0, 2));
  const g = f.geometry;
  if (!byPref.has(id)) byPref.set(id, { name: f.properties.N03_001, polys: [] });
  byPref.get(id).polys.push(...(g.type === 'Polygon' ? [g.coordinates] : g.coordinates));
}
// 全国の地図で見えない小さな島は先に捨てる（gen-map.mjs と同じ基準。県の形が1つも残らないときは一番大きい形を残す）
const MIN_AREA = 2e-6;
for (const x of byPref.values()) {
  const area = (p) => d3.geoArea({ type: 'Polygon', coordinates: p });
  const kept = x.polys.filter((p) => area(p) > MIN_AREA);
  x.polys = kept.length ? kept : [x.polys.reduce((a, b) => (area(a) >= area(b) ? a : b))];
}
const japan = {
  type: 'FeatureCollection',
  features: [...byPref].sort((a, b) => a[0] - b[0]).map(([id, x]) => ({
    type: 'Feature',
    properties: { id, nam_ja: x.name },
    geometry: { type: 'MultiPolygon', coordinates: x.polys },
  })),
};
if (japan.features.length !== 47) throw new Error(`県の数が47ではない：${japan.features.length}`);

// 座標を丸めて TopoJSON にし、細かすぎる点を落とす（gen-map.mjs でさらに間引く）
let t = tsv.topology({ japan }, 1e5);
t = ts.presimplify(t);
t = ts.simplify(t, ts.quantile(t, 0.03));
fs.writeFileSync(new URL('./japan.topojson', import.meta.url), JSON.stringify(t));
console.log('japan.topojson', fs.statSync(new URL('./japan.topojson', import.meta.url)).size, 'bytes');
