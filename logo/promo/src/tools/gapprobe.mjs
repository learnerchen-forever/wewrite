/* 成品像素探针：在**交付的 PNG** 上量「字标 ↔ 2.0 徽标」之间的实际视觉缝隙。
 *
 * 为什么需要：build.mjs 的 gap 是**参数**，量的是旋转后外接盒之间的距离；
 * 真正落到像素上时，旋转、圆角、抗锯齿都会让肉眼看到的缝和参数不是一回事。
 * 这一步补一条独立通道 —— 直接问"图上这两个紫色物体之间，到底隔了几个背景像素"。
 *
 * 做法（刻意不依赖任何版式常量）：
 *   ① 逐行判断"这一行有没有紫色像素"，从第一行往下的**第一段连续墨迹行** = 标题行；
 *      不能偷懒用"上半幅"—— 紫框里的两个标志(y≈554 起)、箭头(562 起)、公众号标(573 起)
 *      都会探进 y<576，那样量到的"最大缝"其实是徽标右侧到公众号标之间的空白。
 *   ② 在标题行的行范围内，逐列判断有没有紫色像素；
 *   ③ 第一个/最后一个墨迹列之间，找**最长的一段全背景列** = 字标与徽标之间的缝；
 *      顺带把前几长的空列段打出来 —— 字标内部字母间也有细缝，要能分辨出来。
 *
 * 用法：node logo/promo/src/tools/gapprobe.mjs [png]
 */
import fs from 'node:fs';
import { decodePNG, sampler } from './png.mjs';

const PNG = process.argv[2] || 'D:/projects/cc-wewrite-dev/wewrite/logo/promo/wewrite-2.0-poster-2048x1152.png';
const img = decodePNG(fs.readFileSync(PNG));
const px = sampler(img);

/* 紫族判定：字标渐变 (#A78BFA→#6C31E3) 与徽标渐变 (#9B6BF8→#5B22C9) 都满足，
 * 背景 #FBFAF7（b−r = −4）、淡紫框 #F1EAFC（b−r = 11）、框边 #E3D6F9（22）都不满足。 */
const isInk = (c) => c[2] - c[0] > 40 && c[2] > 140;
const rowHasInk = (y) => { for (let x = 0; x < img.w; x++) if (isInk(px(x, y))) return true; return false; };

/* 标题行 = 从顶往下的第一段连续墨迹行（中间允许几行小空档，字母上下沿会留缝） */
let r0 = 0;
while (r0 < img.h && !rowHasInk(r0)) r0++;
const yTop = r0, GAP_ROWS = 24;
let yBot = r0, blank = 0;
for (let y = r0; y < img.h; y++) {
  if (rowHasInk(y)) { yBot = y; blank = 0; } else if (++blank >= GAP_ROWS) break;
}
console.log(`画布 ${img.w}×${img.h} · 标题行行范围 y ${yTop}..${yBot}（自动推出，不写死）`);
const inked = [];
for (let x = 0; x < img.w; x++) {
  let hit = false;
  for (let y = yTop; y <= yBot && !hit; y++) if (isInk(px(x, y))) hit = true;
  inked.push(hit);
}
const firstX = inked.indexOf(true), lastX = inked.lastIndexOf(true);
if (firstX < 0) { console.log('标题行里没有任何紫色像素 —— 画布或判定阈值不对。'); process.exit(1); }

/* 第一个/最后一个墨迹列之间的空列段 */
const runs = [];
let st = -1;
for (let x = firstX; x <= lastX; x++) {
  if (!inked[x]) { if (st < 0) st = x; } else if (st >= 0) { runs.push([st, x - 1]); st = -1; }
}
if (st >= 0) runs.push([st, lastX]);
const byLen = runs.slice().sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]));

console.log(`标题行墨迹列 ${firstX}..${lastX}（宽 ${lastX - firstX + 1}）`);
console.log(`\n空列段（长→短，最多 6 段）：`);
for (const [a, b] of byLen.slice(0, 6)) {
  console.log(`  x ${a}..${b}  宽 ${b - a + 1}px   左侧物体右缘 ${a - 1} / 右侧物体左缘 ${b + 1}`);
}

const gap = byLen.length ? byLen[0][1] - byLen[0][0] + 1 : 0;
const gapAt = byLen.length ? byLen[0] : null;
console.log(`\n最宽的缝 = 字标 ↔ 徽标：${gap}px${gapAt ? `（x ${gapAt[0]}..${gapAt[1]}）` : ''}`);
console.log(`  看得见的缝（8–40px）  ：${gap >= 8 && gap <= 40 ? '✔' : '✘ ' + (gap < 8 ? '贴住了 / 太窄' : '太宽，两边不成组')}`);
console.log(`  缝在字标右侧（位置合理）：${gapAt && gapAt[0] > (firstX + lastX) / 2 ? '✔' : '✘ 不在右半边'}`);
