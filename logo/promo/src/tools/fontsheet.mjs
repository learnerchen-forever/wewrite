/* 候选字体对照表：把一串字体名渲染成一张可供**肉眼挑选**的样张。
 *
 * 存在的理由：`fontAvailable()` 只能回答"这个字体装没装"，回答不了"哪个好看/哪个
 * 和版式是一路的"。挑字体这一步必须看字形 —— 尤其是手写体，名字听着都差不多，
 * 实际一个像毛笔一个像圆珠笔。同一张表里还能顺手看出"写错名字被静默回退"：
 * 回退的几行会长得一模一样。
 *
 * 用法：
 *   node fontsheet.mjs "发布到" FZShuTi STXingkai KaiTi STKaiti [字号]
 *   node fontsheet.mjs "WeWrite 2.0" "Segoe Script" "Ink Free" "Lucida Handwriting" 42
 *
 * 产物落 src/.tmp/fontsheet.png，只看不改，不进仓库。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shot, setOut } from '../shot.mjs';

const OUT = setOut(path.join(path.dirname(fileURLToPath(import.meta.url)), '../.tmp'));

const [sample, ...rest] = process.argv.slice(2);
if (!sample || rest.length === 0) {
  console.error('用法: node fontsheet.mjs "<样张文字>" <字体名> [字体名 ...] [字号]');
  process.exit(1);
}
const last = +rest[rest.length - 1];
const size = Number.isFinite(last) ? +rest.pop() : 46;
const families = rest;

const W = 1000, ROW = Math.round(size * 1.9);
const rows = families.map((f) => `<div class="r">`
  + `<span class="nm">${f}</span>`
  + `<span class="s" style="font-family:'${f}';font-size:${size}px">${sample}</span>`
  + `<span class="s2" style="font-family:'${f}';font-size:${Math.round(size * 0.7)}px">${sample}</span>`
  + `</div>`).join('');

const html = `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:#fff}
body{padding:16px 18px;width:${W}px;box-sizing:border-box}
h4{margin:0 0 10px;font:600 13px/1 "Segoe UI";color:#8a8a93;letter-spacing:.03em}
.r{display:flex;align-items:baseline;gap:18px;padding:8px 0;border-bottom:1px solid #eceaf2}
.nm{width:190px;flex:none;font:400 14px/1.5 "Segoe UI";color:#b3202e;word-break:break-all}
.s{color:#16161a;line-height:1.25;white-space:pre}
.s2{color:#16161a;line-height:1.25;white-space:pre;opacity:.55}
</style>
<h4>样张「${sample}」 · 大字 ${size}px / 小字 ${Math.round(size * 0.7)}px · 回退的几行会一模一样</h4>
${rows}`;

fs.writeFileSync(path.join(OUT, 'fontsheet.html'), html);
shot('fontsheet.html', 'fontsheet.png', W, 16 + 34 + families.length * ROW + 24, 1);
console.log(`${families.length} 个候选 → src/.tmp/fontsheet.png（用 Read 看图挑字形）`);
