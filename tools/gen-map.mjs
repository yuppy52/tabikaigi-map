import fs from 'fs';
import * as tc from 'topojson-client';
import * as ts from 'topojson-simplify';
import * as d3 from 'd3-geo';
let t=JSON.parse(fs.readFileSync(new URL('./japan.topojson', import.meta.url)));
t=ts.presimplify(t);
t=ts.simplify(t, ts.quantile(t, 0.12));
const fc=tc.feature(t,t.objects.japan);
function filt(f){
  const g=f.geometry; const polys=g.type==='Polygon'?[g.coordinates]:g.coordinates;
  const id=f.properties.id;
  const kept=polys.filter(p=>{
    const poly={type:'Polygon',coordinates:p};
    const [lon,lat]=d3.geoCentroid(poly); const a=d3.geoArea(poly);
    if(id===13 && lat<34.9) return false;
    if(id===46 && lat<30) return false;
    return a>2e-6;
  });
  return {...f,geometry:{type:'MultiPolygon',coordinates:kept.length?kept:[polys[0]]}};
}
const feats=fc.features.map(filt);
const W=1000,H=1000;
const main={type:'FeatureCollection',features:feats.filter(f=>f.properties.id!==47)};
const oki={type:'FeatureCollection',features:feats.filter(f=>f.properties.id===47)};
const pm=d3.geoMercator().fitExtent([[10,10],[W-10,H-10]],main);
const po=d3.geoMercator().fitExtent([[40,90],[300,300]],oki);
const out={};
for(const f of feats){
  const p=d3.geoPath(f.properties.id===47?po:pm).digits(1);
  const c=(f.properties.id===47?po:pm)(d3.geoCentroid(f));
  out[f.properties.id]={n:f.properties.nam_ja,d:p(f),c:c.map(v=>Math.round(v))};
}
// bounds for okinawa inset box
const b=d3.geoPath(po).bounds(oki);
fs.writeFileSync(new URL('./paths.json', import.meta.url),JSON.stringify({W,H,okiBox:b.flat().map(Math.round),p:out}));
console.log(fs.statSync('paths.json').size, b, d3.geoPath(pm).bounds(main));
