/* 量一张成品 PNG 的「内容包围盒」和「逐行墨迹段」。
 *
 * 为什么要量而不是按版式常量推：框带 box-shadow、画布上还有一层很淡的紫色光晕，
 * 「哪几行算内容」靠推常量会把阴影和光晕漏掉（或反过来把它们算进去）。
 * 判据是"离底色足够远"，所以**底色要显式给**，而且要扫多个阈值看边界稳不稳
 * （阈值太小会把光晕算进来 —— 海报上 thr 8 会得到 y 0..1002，thr 14~30 稳定在 107..977）。
 *
 * 用法（CLI）：node contentbox.mjs <png> [bgHex] [thr]
 * 用法（模块）：import { contentBox } from './contentbox.mjs'
 */
import fs from 'node:fs';
import { decodePNG, sampler } from './png.mjs';

/** 内容包围盒（像素坐标，含端点）。thr 默认 20 —— 在本项目的成品上是稳定区间。 */
export function contentBox(png, { bg = 'FBFAF7', thr = 20 } = {}) {
  const img = decodePNG(Buffer.isBuffer(png) ? png : fs.readFileSync(png));
  const px = sampler(img);
  const B = [0, 2, 4].map((i) => parseInt(bg.slice(i, i + 2), 16));
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    const [r, g, b] = px(x, y);
    if (Math.max(Math.abs(r - B[0]), Math.abs(g - B[1]), Math.abs(b - B[2])) > thr) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x0 === Infinity) throw new Error(`没量到任何内容（bg #${bg} thr ${thr}）—— 底色给错了吧？`);
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  return { x0, y0, x1, y1, w, h, aspect: w / h, canvas: [img.w, img.h] };
}

/** 逐行墨迹段：把连续有墨迹的行并成段，用来区分「标题行 / 主体行」这种结构。 */
export function rowSegments(png, { bg = 'FBFAF7', thr = 20 } = {}) {
  const img = decodePNG(Buffer.isBuffer(png) ? png : fs.readFileSync(png));
  const px = sampler(img);
  const B = [0, 2, 4].map((i) => parseInt(bg.slice(i, i + 2), 16));
  const on = [];
  for (let y = 0; y < img.h; y++) {
    let hit = 0;
    for (let x = 0; x < img.w; x++) {
      const [r, g, b] = px(x, y);
      if (Math.max(Math.abs(r - B[0]), Math.abs(g - B[1]), Math.abs(b - B[2])) > thr) { hit++; break; }
    }
    on.push(!!hit);
  }
  const segs = [];
  let s = -1;
  for (let y = 0; y <= on.length; y++) {
    if (y < on.length && on[y] && s < 0) s = y;
    if ((y >= on.length || !on[y]) && s >= 0) { segs.push([s, y - 1]); s = -1; }
  }
  return segs;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const [png, bg = 'FBFAF7', thrArg] = process.argv.slice(2);
  if (!png) { console.error('用法: node contentbox.mjs <png> [bgHex] [thr]'); process.exit(1); }
  const buf = fs.readFileSync(png);
  console.log(`${png.split(/[\\/]/).pop()}`);
  for (const t of [8, 14, 20, 30, 45, 70]) {
    const b = contentBox(buf, { bg, thr: t });
    console.log(`  thr ${String(t).padStart(3)}  x ${b.x0}..${b.x1}  y ${b.y0}..${b.y1}`
      + `   ${b.w}×${b.h}  宽高比 ${b.aspect.toFixed(4)}`);
  }
  const T = +(thrArg || 20);
  console.log(`\n阈值 ${T} 的连续段：`);
  for (const [a, b] of rowSegments(buf, { bg, thr: T })) console.log(`  y ${a}..${b}   高 ${b - a + 1}`);
}
