/* 「2.0」铭牌形状对照表：把**用户给的参考图**和几个候选参数并排渲染成同一「墨迹高」，
 * 一眼看哪个最像 —— 形状这东西只能看，参数名说明不了问题（"cap 半径 0.38" 谁也不知道长啥样）。
 *
 * 与 tools/labelprobe.mjs 的分工：labelprobe 是**数值拟合**（对不上就调参，不需要眼睛），
 * 这个是**给人挑**的 —— 形状对不对是眼睛的问题，"cap 半径 0.38" 这种数字看不出像不像。
 * ⚠️ 默认值不是"待挑的候选"，而是 labelprobe 拟合出来的最优解（OGEE）—— 表是给你做**微调**的，
 *    没有一眼看出毛病，就别动 OGEE。
 *
 * 画法刻意与 build.mjs 完全一致（贴轮廓描边 + 裁到轮廓内），所以这里看到的色带/白圈
 * 就是成品的宽度 —— 也顺便证明耳的尖不会被那一圈吃掉（旧做法会）。
 *
 * ⚠️ 参数一律相对**墨迹高**，和 build.mjs 的 L.tag、labelprobe 的输出同一口径。
 *
 * 用法：node logo/promo/src/tools/shapesheet.mjs [墨迹高=200]
 * 产物落 src/.tmp/shapesheet.png，只看不改，不进仓库。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shot, setOut } from '../shot.mjs';
import { labelPath, labelBox, OGEE } from './label.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = setOut(path.join(HERE, '../.tmp'));
const ASSETS = path.join(HERE, '../assets');
const SH = +(process.argv[2] || 200);              // 统一**墨迹高**，横向可比
const BAND = 0.037, RING = 0.031;                  // 与 build.mjs 相同的色带 / 白圈宽度
const n = (v) => +v.toFixed(2);
const NOW = { ...OGEE };                           // 拟合出来的定稿值
const INK_W = Math.round(SH * (2 * (OGEE.half + OGEE.boss)));

/** 一个候选：画布直接取 labelBox()（= 含小耳的墨迹盒），于是画布边界就是墨迹边界，
 *  几个候选的墨迹高天然一致，叠着看才有效。 */
function shapeSVG(i, k) {
  const o = { ...NOW, ...k };
  const b = labelBox(SH, o);
  const d = labelPath(SH, o);
  const boss = o.boss * SH, bodyW = b[2] - 2 * boss;
  const g = `<linearGradient id="g${i}" gradientUnits="userSpaceOnUse" `
    + `x1="${n(b[0])}" y1="0" x2="${n(b[0] + b[2])}" y2="${n(SH)}">`
    + `<stop offset="0" stop-color="#9B6BF8"/><stop offset="1" stop-color="#5B22C9"/></linearGradient>`;
  return `<svg width="${Math.round(b[2])}" height="${SH}" viewBox="${b.map(n).join(' ')}" `
    + `style="display:block"><defs>${g}<clipPath id="c${i}"><path d="${d}"/></clipPath></defs>`
    + `<path fill="url(#g${i})" d="${d}"/>`
    + `<g clip-path="url(#c${i})">`
    + `<path fill="none" stroke="#FFFFFF" stroke-width="${n(2 * (BAND + RING) * SH)}" d="${d}"/>`
    + `<path fill="none" stroke="url(#g${i})" stroke-width="${n(2 * BAND * SH)}" d="${d}"/>`
    + `</g>`
    + `<text x="${n(bodyW / 2)}" y="${n(SH / 2)}" text-anchor="middle" dominant-baseline="central" `
    + `font-family='Arial Black,"Segoe UI Black",sans-serif' font-weight="900" `
    + `font-size="${n(SH * 0.29)}" fill="#FFFFFF">2.0</text></svg>`;
}

const refPath = path.join(ASSETS, 'ref-label-shape.png');
const refImg = fs.existsSync(refPath)
  ? `<img src="data:image/png;base64,${fs.readFileSync(refPath).toString('base64')}" `
    + `style="height:${SH}px;display:block">`
  : '<span style="color:#c00">缺 assets/ref-label-shape.png</span>';

const V = (o) => ({ ...o });
const CAND = [
  { row: 'A · 顶端窄脊（cap 半径 R1）—— 越小脊越窄越"尖"', cells: [
    { cap: 'R1 0.26', ...V({ R1: 0.26 }) },
    { cap: 'R1 0.32', ...V({ R1: 0.32 }) },
    { cap: 'R1 0.379（定稿）', ...V({}) },
    { cap: 'R1 0.48', ...V({ R1: 0.48 }) }] },
  { row: 'B · 收腰深度（肩半径 R2）—— 越小腰收得越狠', cells: [
    { cap: 'R2 0.70', ...V({ R2: 0.70 }) },
    { cap: 'R2 0.82', ...V({ R2: 0.82 }) },
    { cap: 'R2 0.919（定稿）', ...V({}) },
    { cap: 'R2 1.10', ...V({ R2: 1.10 }) }] },
  { row: 'C · 四角外圆（角半径 R3）—— 与竖边相切', cells: [
    { cap: 'R3 0.10', ...V({ R3: 0.10 }) },
    { cap: 'R3 0.14', ...V({ R3: 0.14 }) },
    { cap: 'R3 0.167（定稿）', ...V({}) },
    { cap: 'R3 0.24', ...V({ R3: 0.24 }) }] },
  { row: 'D · 小耳（突出 boss / 半高 ear / 耳尖角由 kb 定）', cells: [
    { cap: '耳 0.085 突出', ...V({ boss: 0.085 }) },
    { cap: 'kb 0.45（更钝 90°）', ...V({ kb: 0.45 }) },
    { cap: 'kb 0.75（定稿 71°）', ...V({}) },
    { cap: 'kb 0.95（更尖 58°）', ...V({ kb: 0.95 }) }] },
];

let i = 0;
const rows = CAND.map((r) => `<h4>${r.row}</h4><div class="row">`
  + r.cells.map((k) => `<div class="c"><div class="st">${shapeSVG(++i, k)}</div>`
    + `<div class="cap">${k.cap}</div></div>`).join('') + '</div>').join('');

const CELL = INK_W + 56;
const BODY_W = 4 * CELL + 48;
const html = `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:#FBFAF7;color:#2E2544}
body{padding:24px;width:${BODY_W}px;box-sizing:border-box;
  font-family:"Segoe UI","Microsoft YaHei",sans-serif}
h4{margin:0 0 14px;font:600 14px/1.3 "Segoe UI";color:#8a8a93;letter-spacing:.03em}
.row{display:flex;margin-bottom:20px;padding-top:16px;border-top:1px solid #eceaf2}
.c{width:${CELL}px;flex:none;display:flex;flex-direction:column;align-items:center}
.st{height:${SH + 8}px;display:flex;align-items:center;justify-content:center}
.cap{font:600 13px/1.5 "Segoe UI";color:#5b5670;text-align:center;margin-top:4px}
</style>
<h4>参考图（用户给的原图，同墨迹高对照）· 墨迹宽高比实测 1.418</h4>
<div class="row"><div class="c"><div class="st">${refImg}</div><div class="cap">参考图</div></div></div>
${rows}`;

fs.writeFileSync(path.join(OUT, 'shapesheet.html'), html);
shot('shapesheet.html', 'shapesheet.png', BODY_W, 24 + (CAND.length + 1) * (SH + 60 + 62) + 40, 1);
console.log(`参考图 + ${i} 个候选（墨迹高统一 ${SH}）→ src/.tmp/shapesheet.png`);
