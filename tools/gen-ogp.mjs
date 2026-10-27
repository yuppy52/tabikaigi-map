// OGP の画像（招待URLを LINE などで送ったときのカード、1200×630）を作る。
// 考え方：paths.json の日本地図を塗った HTML を作り、Mac の Chrome をヘッドレスで開いて PNG に撮る。
// 文字は Mac に入っているヒラギノを使う（外のフォントを読まないので、オフラインでも同じ絵になる）。
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = new URL('../assets/ogp.png', import.meta.url);
// 画面のビルド（dist/）で /ogp.png として配る写し。Vite は web/public/ の中身をそのまま dist/ に写すので、ここにも置く。
// 作り直したときに2つがずれないように、撮った後に毎回ここへ写す（正本は assets/ogp.png）
const PUBLIC_COPY = new URL('../web/public/ogp.png', import.meta.url);
const { W, H, okiBox, p } = JSON.parse(fs.readFileSync(new URL('./paths.json', import.meta.url)));

// 見本として塗る県（都道府県コード → 行った人数の段階 1〜4。モックの濃さの色に合わせる）
const HEAT = { 1: 2, 4: 1, 12: 2, 13: 4, 14: 3, 17: 1, 20: 2, 22: 2, 23: 1, 26: 4, 27: 3, 29: 1, 34: 1, 40: 2, 46: 1, 47: 3 };
const SHADE = { 1: '#D5E5F4', 2: '#98BFE6', 3: '#5890CE', 4: '#23579E' };

const paths = Object.entries(p)
  .map(([id, x]) => `<path d="${x.d}" fill="${SHADE[HEAT[id]] || '#FFFFFF'}"/>`)
  .join('');
const [x0, y0, x1, y1] = okiBox;
const pad = 12;

const html = `<!doctype html><meta charset="utf-8">
<style>
html,body{margin:0;width:1200px;height:630px;overflow:hidden}
body{background:#E6EDF1;font-family:"Hiragino Maru Gothic ProN","Hiragino Sans",sans-serif;color:#1B2630;position:relative}
.text{position:absolute;left:64px;top:0;bottom:0;width:520px;display:flex;flex-direction:column;justify-content:center}
h1{margin:0;font-size:80px;line-height:1.15;letter-spacing:.02em;color:#23579E}
p{margin:28px 0 0;font-size:33px;line-height:1.5;color:#1B2630}
svg{position:absolute;right:16px;top:15px;width:600px;height:600px}
path{stroke:#A9B8C2;stroke-width:1.2;stroke-linejoin:round}
</style>
<div class="text"><h1>旅会議マップ</h1><p>友達と行った都道府県を塗って、<br>次の旅行先を決めよう</p></div>
<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<rect x="${x0 - pad}" y="${y0 - pad}" width="${x1 - x0 + pad * 2}" height="${y1 - y0 + pad * 2}" rx="10" fill="none" stroke="#A9B8C2" stroke-width="2"/>
${paths}</svg>`;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogp-'));
const src = path.join(dir, 'ogp.html');
fs.writeFileSync(src, html);
fs.mkdirSync(new URL('../assets/', import.meta.url), { recursive: true });
execFileSync(CHROME, [
  '--headless', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
  '--window-size=1200,630', `--screenshot=${OUT.pathname}`, `file://${src}`,
], { stdio: 'ignore' });
fs.rmSync(dir, { recursive: true });
fs.copyFileSync(OUT, PUBLIC_COPY);
console.log(OUT.pathname, fs.statSync(OUT).size, 'bytes');
console.log(PUBLIC_COPY.pathname, '（写し）');
