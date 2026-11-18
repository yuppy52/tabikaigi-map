// draw.io の図（docs/**/*.drawio.svg）の絵を、ファイルの中の draw.io のデータ（content 属性の mxfile）から描き直す。
// 使い方：node tools/drawio-svg.mjs docs/design/wireframes.drawio.svg [ほかのファイル…]
//
// 考え方：.drawio.svg は「絵（SVG）」と「draw.io で開くためのデータ（mxfile）」を1つのファイルに持つ。
// 正本はデータの側で、図を直すときはデータ（mxCell）を直してから、このスクリプトで絵を作り直す。
// draw.io のアプリで開いて直したときは、draw.io が絵も書き出すので、このスクリプトは要らない。
// 描けるのは、この2つの図で使っている形だけ（角の丸い四角、文字、折れ線の矢印）。新しい形を使うなら、ここに足す。
import { readFileSync, writeFileSync } from "node:fs";

const decode = (s) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const encodeText = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const encodeAttr = (s) => encodeText(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
// 数の書き方：整数ならそのまま、そうでなければ小数1桁
const num = (v) => (Number.isInteger(v) ? String(v) : (Math.round(v * 10) / 10).toFixed(1));
const one = (v) => (Math.round(v * 10) / 10).toFixed(1);

function parseStyle(s) {
  const st = {};
  for (const kv of s.split(";")) {
    if (!kv) continue;
    const i = kv.indexOf("=");
    if (i < 0) st[kv] = "1";
    else st[kv.slice(0, i)] = kv.slice(i + 1);
  }
  return st;
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? m[1] : null;
}

// mxfile から、描く順に mxCell を取り出す
function parseCells(mx) {
  const cells = [];
  const re = /<mxCell\b([^>]*?)(\/>|>([\s\S]*?)<\/mxCell>)/g;
  for (const m of mx.matchAll(re)) {
    const head = m[1];
    const inner = m[3] ?? "";
    const id = attr(head, "id");
    if (id === "0" || id === "1") continue;
    const value = decode(attr(head, "value") ?? "");
    const style = parseStyle(decode(attr(head, "style") ?? ""));
    const edge = attr(head, "edge") === "1";
    if (edge) {
      const pt = (as) => {
        const p = inner.match(new RegExp(`<mxPoint x="([-\\d.]+)" y="([-\\d.]+)" as="${as}"\\s*/>`));
        return p ? [Number(p[1]), Number(p[2])] : null;
      };
      const arr = inner.match(/<Array as="points">([\s\S]*?)<\/Array>/);
      const mids = arr ? [...arr[1].matchAll(/<mxPoint x="([-\d.]+)" y="([-\d.]+)"\s*\/>/g)].map((p) => [Number(p[1]), Number(p[2])]) : [];
      cells.push({ id, value, style, edge: true, points: [pt("sourcePoint"), ...mids, pt("targetPoint")] });
    } else {
      const g = inner.match(/<mxGeometry([^>]*)\/?>/);
      const geo = (k) => Number(attr(g[1], k) ?? 0);
      cells.push({ id, value, style, edge: false, x: geo("x"), y: geo("y"), w: geo("width"), h: geo("height") });
    }
  }
  return cells;
}

// 文字の行（<br> で分ける。html=1 の値）
const lines = (value) => value.split(/<br\s*\/?>/i).map((l) => l.replace(/<[^>]+>/g, ""));
// 文字の幅の目安（ラベルの背景の四角に使う）：全角は1文字分、半角は0.55文字分
const textWidth = (s, fs) => [...s].reduce((w, ch) => w + (ch.charCodeAt(0) < 0x2000 ? fs * 0.55 : fs), 0);

function renderVertex(c) {
  const st = c.style;
  const out = [];
  const isText = "text" in st;
  const fill = st.fillColor ?? "#ffffff";
  const stroke = st.strokeColor ?? "#000000";
  if (!isText && !(fill === "none" && stroke === "none")) {
    let r = `<rect x="${num(c.x)}" y="${num(c.y)}" width="${num(c.w)}" height="${num(c.h)}"`;
    if (st.rounded === "1") {
      const rx = (Math.min(c.w, c.h) * Number(st.arcSize ?? 10)) / 100;
      r += ` rx="${num(Math.round(rx * 10) / 10)}"`;
    } else if (st.opacity) {
      r += ` rx="14"`;
    }
    r += ` fill="${fill}" stroke="${stroke}"`;
    if (st.dashed === "1") r += ` stroke-dasharray="5 3"`;
    if (st.opacity) r += ` opacity="${Number(st.opacity) / 100}"`;
    out.push(r + "/>");
  }
  if (c.value) {
    const fs = Number(st.fontSize ?? 11);
    const ls = lines(c.value);
    const lh = fs * 1.35;
    const align = st.align ?? "center";
    const left = Number(st.spacingLeft ?? 0);
    const right = Number(st.spacingRight ?? 0);
    const x = align === "left" ? c.x + left : align === "right" ? c.x + c.w - right : c.x + c.w / 2;
    const anchor = align === "left" ? "start" : align === "right" ? "end" : "middle";
    // 上ぞろえ（verticalAlign=top）は、上から4の余白の後に1行目を置く。ほかは真ん中にそろえる
    const top = st.verticalAlign === "top" ? c.y + 4 + fs - fs * 0.35 : c.y + c.h / 2 - (lh * ls.length) / 2 + lh / 2;
    const bold = Number(st.fontStyle ?? 0) & 1 ? ` font-weight="bold"` : "";
    const color = st.fontColor ?? "#222222";
    ls.forEach((l, i) => {
      const y = top + i * lh + fs * 0.35;
      const xs = align === "center" ? one(x) : num(x);
      out.push(`<text x="${xs}" y="${one(y)}" font-size="${fs}" fill="${color}" text-anchor="${anchor}"${bold}>${encodeText(l)}</text>`);
    });
  }
  return out;
}

function renderEdge(c) {
  const st = c.style;
  const pts = c.points;
  const out = [];
  let line = `<polyline points="${pts.map(([x, y]) => `${num(x)},${num(y)}`).join(" ")}" fill="none" stroke="${st.strokeColor ?? "#555555"}" stroke-width="1.3"`;
  if (st.dashed === "1") line += ` stroke-dasharray="5 3"`;
  out.push(line + ` marker-end="url(#arr)"/>`);
  if (c.value) {
    // ラベルは、いちばん長い区間の真ん中に置く（draw.io のアプリで開いたときの位置とは少し違うことがある）
    let best = 0;
    let at = [pts[0][0], pts[0][1]];
    for (let i = 1; i < pts.length; i++) {
      const [x1, y1] = pts[i - 1];
      const [x2, y2] = pts[i];
      const len = Math.hypot(x2 - x1, y2 - y1);
      if (len > best) {
        best = len;
        at = [(x1 + x2) / 2, (y1 + y2) / 2];
      }
    }
    const fs = Number(st.fontSize ?? 10);
    const ls = lines(c.value);
    const w = Math.max(...ls.map((l) => textWidth(l, fs))) + 8;
    const lh = fs * 1.35;
    const h = lh * ls.length + 2;
    out.push(`<rect x="${one(at[0] - w / 2)}" y="${one(at[1] - h / 2)}" width="${one(w)}" height="${one(h)}" fill="${st.labelBackgroundColor ?? "#ffffff"}"/>`);
    const top = at[1] - (lh * ls.length) / 2 + lh / 2;
    ls.forEach((l, i) => {
      out.push(`<text x="${one(at[0])}" y="${one(top + i * lh + fs * 0.35)}" font-size="${fs}" fill="#333333" text-anchor="middle">${encodeText(l)}</text>`);
    });
  }
  return out;
}

function render(file) {
  const src = readFileSync(file, "utf8");
  const head = src.match(/^<svg\b[^>]*?content='([^']*)'[^>]*>/);
  if (!head) throw new Error(`${file}: content 属性（draw.io のデータ）が見つかりません`);
  const mx = decode(head[1]);
  const cells = parseCells(mx);
  // 大きさは、いまの width・height を使う（図を広げるときは、svg の width・height・viewBox を直す）
  const width = Number(attr(head[0], "width"));
  const height = Number(attr(head[0], "height"));
  const body = [
    `<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>`,
    `<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#555555"/></marker></defs>`,
  ];
  // 線は箱の後ろに描かれると見えなくなるので、箱を先に、線を後に描く
  for (const c of cells) if (!c.edge) body.push(...renderVertex(c));
  for (const c of cells) if (c.edge) body.push(...renderEdge(c));
  const out = `${head[0]}${body.join("")}</svg>\n`;
  writeFileSync(file, out);
  console.log(`${file}：${cells.length} 個の形を描き直しました`);
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("使い方：node tools/drawio-svg.mjs <ファイル.drawio.svg> …");
  process.exit(1);
}
for (const f of files) render(f);
