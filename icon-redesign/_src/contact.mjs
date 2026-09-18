// contact.mjs — 生成核对用的密排对照页（只给自己看，不是交付物）。
// 运行：node icon-redesign/_src/contact.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const data = JSON.parse(fs.readFileSync(path.join(HERE, 'data.json'), 'utf8'));

const cell = (svgStr, px) =>
  '<span class="c" style="--p:' + px + 'px">' + svgStr + '</span>';

const FROM = Number(process.argv[2] || 0);
const TO = Number(process.argv[3] || data.rows.length);
const view = data.rows.slice(FROM, TO);

const rows = view
  .map(
    (r) =>
      '<tr><td class="id">' + r.id.replace('wewrite-', '') + '</td>' +
      '<td>' + [32, 24, 16].map((p) => cell(r.old, p)).join('') + '</td>' +
      '<td class="sep"></td>' +
      '<td>' + [32, 24, 16].map((p) => cell(r.next, p)).join('') + '</td></tr>'
  )
  .join('');

const stripNew = data.rows.map((r) => cell(r.next, '16')).join('');
const stripOld = data.rows.map((r) => cell(r.old, '16')).join('');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;padding:14px;background:#fff;color:#111;
 font:12px/1.4 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif}
table{border-collapse:collapse;table-layout:fixed}
td{padding:2px 6px;border-bottom:1px solid #eee;vertical-align:middle}
td.id{width:130px;font-family:monospace;font-size:10.5px;color:#666}
td.sep{width:14px;border:0}
.c{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;vertical-align:middle}
.c svg{width:var(--p);height:var(--p);display:block;stroke:#111;fill:none}
h4{margin:14px 0 6px;font-size:12px;color:#444}
.strip{display:flex;flex-wrap:wrap;gap:5px;padding:8px;border:1px solid #eee;border-radius:6px}
.strip .c{width:26px;height:26px}
</style></head><body>
<h4>16px 密排 · 旧</h4><div class="strip">${stripOld}</div>
<h4>16px 密排 · 新</h4><div class="strip">${stripNew}</div>
<h4>逐枚 32 / 24 / 16 —— 左旧 · 右新</h4>
<table>${rows}</table>
</body></html>`;

fs.writeFileSync(path.join(HERE, 'contact.html'), html, 'utf8');
console.log('contact.html ok');
