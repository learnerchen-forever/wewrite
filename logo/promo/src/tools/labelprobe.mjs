/* 把 tools/label.mjs 画出来的轮廓，和参考图（assets/ref-label-shape.png）的剪影**逐行对拍**。
 *
 * 为什么需要它：参考图是一张水彩稿，边缘有洇染、内部涂色还是碎的，肉眼（更别说这个模型）
 * 看不出参数该调多少。唯一的客观办法是：把候选参数渲染成图 → 提取剪影 → 按「墨迹高」归一化
 * → 与参考图同一批行高上比左右边界，报出偏差。调参就是把偏差调小，不靠感觉。
 *
 * ⚠️ 它在**旧**（抛物线 + 挖角圆）和新（cap/shoulder/corner 弧链）两套轮廓下都能量：
 * 只要 label.mjs 的 labelPath/labelBox 还在，这里就跟着用。形状换了几何模型之后，
 * 这个对拍是唯一能说明"新的更像参考图"的证据。
 *
 * 做法：
 *   ① 用 labelBox() 拿到轮廓的**墨迹盒**，直接当 viewBox 渲染 —— 这样画布边界就是墨迹边界，
 *      量出来的行列索引天然归一化，不用再去找墨迹盒。
 *   ② 候选图按参考图的 4 倍高渲染（抗锯齿更细腻），与参考图各自按「墨迹高」归一化后比较。
 *   ③ 参考图是粉彩、候选图是黑：两边的「墨迹」判定各自适配（参考图看色偏，候选图看暗度）。
 *
 * 用法：node logo/promo/src/tools/labelprobe.mjs [R1=0.379 R2=0.92 ...]
 *      不带参数 = 用 label.mjs 里 OGEE 的实测值。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shot, setOut } from '../shot.mjs';
import { decodePNG, sampler } from './png.mjs';
import { labelPath, labelBox, OGEE } from './label.mjs';

const B = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(B, '../assets');
const OUT = setOut(path.resolve(B, '../.tmp'));
const REF = path.join(ASSETS, 'ref-label-shape.png');
const ROWS = 46;                        // 与 .tmp/refascii.mjs 的行数一致，便于直接对照

/* 覆盖项用 k=v 传，省得记位置；见 OGEE 的字段说明。 */
const O = { ...OGEE };
let QUIET = false;
for (const a of process.argv.slice(2)) {
  if (a === 'quiet') { QUIET = true; continue; }
  const [k, v] = a.split('=');
  if (k in O && Number.isFinite(+v)) O[k] = +v; else console.warn(`忽略参数 ${a}（可用：${Object.keys(O).join(' ')}）`);
}

/* ---------- 剪影：每一行取左右边界（相对墨迹盒，按墨迹高归一化） ---------- */
function boundary(img, isInk) {
  const px = sampler(img);                 // 只建一次 —— 放进循环里会把每个像素都重新包一遍
  let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) if (isInk(px(x, y))) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) throw new Error('没量到墨迹 —— 判定阈值不对');
  const IH = y1 - y0 + 1;
  const out = [];
  for (let r = 0; r < ROWS; r++) {
    const ya = y0 + Math.floor((IH * r) / ROWS), yb = y0 + Math.floor((IH * (r + 1)) / ROWS);
    let l = 1e9, rr = -1;
    for (let y = ya; y < yb; y++) for (let x = x0; x <= x1; x++) if (isInk(px(x, y))) {
      if (x < l) l = x; if (x > rr) rr = x;
    }
    out.push(l > x1 ? null : { l: (l - x0) / IH, r: (x1 - rr) / IH });
  }
  return { rows: out, ink: [x1 - x0 + 1, IH], aspect: (x1 - x0 + 1) / IH };
}

/* ---------- 参考图 ---------- */
const refImg = decodePNG(fs.readFileSync(REF));
const ref = boundary(refImg, (c) => {
  const mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]);
  return mx - mn > 18 && mx < 250;
});

/* ---------- 候选：按墨迹盒渲染，画布边界即墨迹边界 ---------- */
const inkH = 600;                                   // 墨迹高（= labelBox 的高度），其他尺寸都由它推
const box = labelBox(inkH, O);
const sc = 4;                                      // 与参考图同量级、但更细腻
const cw = Math.round(box[2] * sc), ch = Math.round(box[3] * sc);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.join(' ')}" `
  + `style="display:block;width:${cw}px;height:${ch}px">`
  + `<path fill="#000" d="${labelPath(inkH, O)}"/></svg>`;
fs.writeFileSync(path.join(OUT, '_labelprobe.html'),
  `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#fff}</style>${svg}`);
shot('_labelprobe.html', '_labelprobe.png', cw, ch, 1);
const can = boundary(decodePNG(fs.readFileSync(path.join(OUT, '_labelprobe.png'))),
  (c) => c[0] < 128 && c[1] < 128 && c[2] < 128);

/* ---------- 对拍 ---------- */
console.log(`参数（× 墨迹高） half=${O.half} boss=${O.boss} R1=${O.R1} R2=${O.R2} R3=${O.R3} th=${O.th}° ear=${O.ear} kb=${O.kb}`);
console.log(`参考图 墨迹 ${ref.ink.join('×')} 宽高比 ${ref.aspect.toFixed(3)}`
  + ` | 候选 墨迹 ${can.ink.join('×')} 宽高比 ${can.aspect.toFixed(3)}`);
console.log('\n   t     参考L   候选L   ΔL      参考R   候选R   ΔR');
let sL = 0, sR = 0, n = 0, worst = 0;
for (let r = 0; r < ROWS; r++) {
  const a = ref.rows[r], b = can.rows[r];
  if (!a || !b) continue;
  const dL = b.l - a.l, dR = b.r - a.r;
  if (r >= 2 && r <= ROWS - 3) { sL += Math.abs(dL); sR += Math.abs(dR); n++; worst = Math.max(worst, Math.abs(dL), Math.abs(dR)); }
  const mark = Math.abs(dL) > 0.03 || Math.abs(dR) > 0.03 ? '  <<' : '';
  if (!QUIET) console.log(`  ${(r / ROWS).toFixed(2)}   ${a.l.toFixed(3)}   ${b.l.toFixed(3)}  ${dL >= 0 ? '+' : ''}${dL.toFixed(3)}`
    + `    ${a.r.toFixed(3)}   ${b.r.toFixed(3)}  ${dR >= 0 ? '+' : ''}${dR.toFixed(3)}${mark}`);
}
if (QUIET) console.log(`  耳区(0.33..0.67) 平均偏差 ` + (() => {
  let s = 0, m = 0;
  for (let r = Math.ceil(0.33 * ROWS); r <= Math.floor(0.67 * ROWS); r++) {
    const a = ref.rows[r], b = can.rows[r];
    if (a && b) { s += (Math.abs(b.l - a.l) + Math.abs(b.r - a.r)) / 2; m++; }
  }
  return `${(s / m).toFixed(4)}（${m} 行）`;
})());
console.log(`\n中段（t=0.04..0.96）平均偏差 L ${(sL / n).toFixed(4)}  R ${(sR / n).toFixed(4)}`
  + `  最大 ${worst.toFixed(4)}  —— 单位是「墨迹高」，0.01 ≈ 1.9px（参考图）`);
console.log('偏差为正 = 候选比参考更"缩进"（更窄）。');
