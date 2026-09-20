/* 量两个标志的**墨迹面积**：并排等高渲染 → 数非透明像素。
 * 用于判断「等高排列」是否真的视觉平衡 —— 一高一宽的两个标志，等高不等于等重。
 * 用法：node inkarea.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shot, setOut } from '../shot.mjs';
import { decodePNG } from './png.mjs';

const B = path.dirname(fileURLToPath(import.meta.url));   // …/logo/promo/src/tools
const LOGO = path.resolve(B, '../../..');                 // …/logo（定稿的标志在这里）
const ASSETS = path.resolve(B, '../assets');
const OUT = setOut(path.resolve(B, '../.tmp'));

const OBB = JSON.parse(fs.readFileSync(`${ASSETS}/obsidian.box.json`, 'utf8')).box;
const OBS = fs.readFileSync(`${ASSETS}/obsidian-gradient.svg`, 'utf8');
const MARK = fs.readFileSync(`${LOGO}/wewrite-mark-tight.svg`, 'utf8');

const H = 400;                                  // 两边都用同一个墨迹高
const vb = (s) => s.match(/viewBox="([^"]+)"/)[1].split(/[\s,]+/).map(Number);
const inner = (s) => s.slice(s.indexOf('>') + 1).replace(/<\/svg>\s*$/, '');

function box(svg, x, y, h, viewBox) {
  const b = viewBox || vb(svg);
  const w = (h * (b[2] - b[0])) / (b[3] - b[1]);
  return { x, y, w, h,
    html: `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px">`
      + `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.join(' ')}" style="display:block;width:100%;height:100%">`
      + inner(svg).replace(/fill="currentColor"/g, 'fill="#000"') + '</svg></div>' };
}

const cw = box(OBS, 60, 30, H, OBB);
const mw = box(MARK, 560, 30, H);
const SPLIT = 500;
const CW = 1200, CH = 460;

fs.writeFileSync(`${OUT}/_ink.html`, `<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;background:transparent}#c{position:relative;width:${CW}px;height:${CH}px}</style>
<div id="c">${cw.html}${mw.html}</div>`);

shot('_ink.html', '_ink.png', CW, CH, 1, { transparent: true });

const img = decodePNG(fs.readFileSync(`${OUT}/_ink.png`));
const at = (x, y) => {
  const i = (y * img.w + x) * img.chans;
  return img.chans === 1 ? img.data[i] : img.data[i + (img.chans - 1)];
};
let a = 0, b2 = 0;
for (let y = 0; y < img.h; y++) {
  for (let x = 0; x < img.w; x++) {
    if (at(x, y) > 16) { if (x < SPLIT) a++; else b2++; }
  }
}
const area = (n, w, h) => n / (w * h);
const ratio = b2 / a;
console.log(`画布 ${img.w}×${img.h}  通道 ${img.chans}`);
console.log(`Obsidian 墨迹 ${a} px（占自身盒 ${(area(a, cw.w, cw.h) * 100).toFixed(1)}%）盒 ${cw.w.toFixed(1)}×${cw.h}`);
console.log(`WeWrite  墨迹 ${b2} px（占自身盒 ${(area(b2, mw.w, mw.h) * 100).toFixed(1)}%）盒 ${mw.w.toFixed(1)}×${mw.h}`);
console.log(`等高时面积比 WeWrite/Obsidian = ${ratio.toFixed(3)}`);
console.log(`→ 若要**等面积**，WeWrite 的墨迹高应取 Obsidian 的 ${(1 / Math.sqrt(ratio)).toFixed(3)} 倍`);
console.log(`→ 折中（几何平均：等高的 1 与等面积的 k 之间）建议取 ${((1 + 1 / Math.sqrt(ratio)) / 2).toFixed(3)} 倍`);
