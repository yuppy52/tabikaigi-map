// tools/template.html に地図データ(paths.json)を埋め込んで ../index.html を作る
import fs from 'fs';
const dir = new URL('./', import.meta.url);
const j = JSON.parse(fs.readFileSync(new URL('paths.json', dir)));
const p = {};
for (const [k, v] of Object.entries(j.p)) p[k] = { n: v.n, d: v.d };
const data = JSON.stringify({ box: j.okiBox, p });
const body = fs.readFileSync(new URL('template.html', dir), 'utf8').replace('__PATHS__', () => data);
const head = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>body{margin:0}[hidden]{display:none!important}:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}</style>
`;
fs.writeFileSync(new URL('../index.html', dir), head + body.replace(/<\/style>\n/, '</style>\n</head>\n<body>\n') + '</body>\n</html>\n');
console.log('wrote index.html');
