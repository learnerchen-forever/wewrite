/* 量一个第三方 SVG 的**真实墨迹包围盒**（viewBox 单位）。
 *
 * 为什么不能靠解析 d 字符串：官方文件里的路径混着相对命令（`c`/`a` 的参数是增量，
 * 还有圆的 7 参数写法），把数字按顺序两两配对求 min/max 会得到完全错误的结果 ——
 * obsidian-logo-gradient.svg 就这么算出过 -115 -187 1536 1536（比画布还大）。
 *
 * 做法：透明底渲染到 canvas → 解码 PNG → 取非透明像素的范围 → 换算回 viewBox 单位。
 * 结果缓存成 JSON，Poster 直接读。
 *
 * 用法：node measure-svg.mjs <svg 绝对路径> <缓存名> [渲染边长=1024]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG, sampler } from './png.mjs';
import { shot, setOut } from '../shot.mjs';

const B = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(B, '../assets');      // 量测缓存（<name>.box.json）落这里
const OUT = setOut(path.resolve(B, '../.tmp'));   // 渲染中间件落这里，不进仓库
const [src, name, sizeArg] = process.argv.slice(2);
if (!src || !name) { console.error('用法: node measure-svg.mjs <svg> <name> [size]'); process.exit(1); }
const S = +(sizeArg || 1024);

const svg = fs.readFileSync(src, 'utf8');
const vb = svg.match(/viewBox="([^"]+)"/)[1].split(/[\s,]+/).map(Number);
const bw = vb[2], bh = vb[3];
const scale = S / Math.max(bw, bh);
const w = Math.round(bw * scale), h = Math.round(bh * scale);

/* ⚠️ 必须先**摘掉** SVG 自带的 width/height 再注入 —— 否则标签里会出现两个同名属性，
 * 而 HTML 的规则是「第一个生效」，于是注入的尺寸被忽略、SVG 仍按原尺寸渲染，
 * 量出来的"viewBox 单位"会整体差一个 S/原宽 的倍数（本文件就在 wewrite-wordmark.svg 上
 * 踩过：报出 22.023 的"宽"，其实是 149.5px ÷ 6.79）。 */
const sized = svg.replace(/<svg([^>]*)>/, (_, at) =>
  `<svg${at.replace(/\s(?:width|height)="[^"]*"/g, '')} width="${w}" height="${h}" style="display:block">`);

fs.writeFileSync(`${OUT}/_measure.html`, `<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;padding:0;background:transparent}</style>
<div style="width:${w}px;height:${h}px">
${sized}
</div>`);

shot('_measure.html', '_measure.png', w, h, 1, { transparent: true });

const img = decodePNG(fs.readFileSync(`${OUT}/_measure.png`));
const px = sampler(img);
let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, hit = 0;
for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
  const [, , , a] = px(x, y);
  if (a > 16) {
    hit++;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
}
if (!hit) throw new Error('没量到任何墨迹 —— 是不是被 --default-background-color 干掉了？');

const box = [vb[0] + x0 / scale, vb[1] + y0 / scale, vb[0] + (x1 + 1) / scale, vb[1] + (y1 + 1) / scale];
/* 亚像素修正：阈值 16 会把 1px 抗锯齿边缘也算进来，各边各让 0.5px(canvas) 回去 */
const pad = 0.5 / scale;
const tight = [box[0] + pad, box[1] + pad, box[2] - pad, box[3] - pad];
/* 自检：墨迹应该铺满画布的大部分 —— 明显偏小说明尺寸注入没生效（见上面的坑），
 * 此时算出来的包围盒是"像素当 viewBox 用"，数值看着正常但整体不对，必须拦住。 */
const spanW = (x1 - x0 + 1) / img.w, spanH = (y1 - y0 + 1) / img.h;
if (Math.max(spanW, spanH) < 0.9) {
  throw new Error(`墨迹只铺了画布的 ${(spanW * 100).toFixed(0)}%×${(spanH * 100).toFixed(0)}% —— `
    + `尺寸注入大概没生效（SVG 自带的 width/height 抢先了），量出来的不是 viewBox 单位`);
}

const rec = {
  source: src, viewBox: vb, canvas: [w, h],
  box: tight.map((v) => +v.toFixed(3)),
  size: [+(tight[2] - tight[0]).toFixed(3), +(tight[3] - tight[1]).toFixed(3)],
  aspect: +((tight[2] - tight[0]) / (tight[3] - tight[1])).toFixed(4),
  coverage: +(hit / (img.w * img.h)).toFixed(4),
};
fs.writeFileSync(`${ASSETS}/${name}.box.json`, JSON.stringify(rec, null, 1) + '\n');
console.log(`渲染 ${w}×${h} @1x · 命中像素 ${hit}（占画布 ${(rec.coverage * 100).toFixed(1)}%）`);
console.log(`viewBox ${vb.join(' ')} → 墨迹盒 ${rec.box.join(' ')}`);
console.log(`墨迹尺寸 ${rec.size.join(' × ')} · 宽高比 ${rec.aspect}`);
