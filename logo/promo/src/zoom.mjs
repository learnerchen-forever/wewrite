/* 成品放大验收：把海报源码内联进来，用负偏移 + scale 取出局部，
 * 在**真实像素**下核对细节（而不是看被浏览器重采样过的缩略图）。
 *
 * 为什么必须这样验：把整张 2048 宽的海报读回来会被二次缩放，绿弧上的多边形棱、
 * 字标的轮廓毛边都会被抹平 —— 于是"看着没问题"和"确实没问题"就分不开了。
 *
 * 两条必须记住的坑：
 *  ① 必须把原页的 <style> 一起搬过来 —— 只从 <div id="poster"> 切片会丢掉全部绝对定位，
 *     页面照样能打开，只是所有元素挤在左上角。
 *  ② 「给人看的整页」和「给自己看的像素取证」要分成不同宽度：读回来的图会被二次缩放，
 *     取证页宽度控制在 ~700px，倍率才是真的。
 *
 * 用法：node logo/promo/src/zoom.mjs [海报html]
 * 产物落 src/.tmp/，只看不改，不进仓库。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shot, setOut } from './shot.mjs';
import { POSTER_HTML } from './verify.mjs';

const SRC = path.dirname(fileURLToPath(import.meta.url));
const OUT = setOut(path.join(SRC, '.tmp'));
const srcPath = process.argv[2] ? path.resolve(process.argv[2]) : POSTER_HTML;
const src = fs.readFileSync(srcPath, 'utf8');
const style = src.slice(src.indexOf('<style>'), src.indexOf('</style>') + '</style>'.length);
const body = src.slice(src.indexOf('<div id="poster">')).replace(/<\/body>[\s\S]*$/, '');
const PW = +src.match(/width:\s*(\d+)px/)[1], PH = +src.match(/height:\s*(\d+)px/)[1];

const win = (x, y, w, h, k) => `<div class="win" style="width:${(w * k).toFixed(0)}px;height:${(h * k).toFixed(0)}px">`
  + `<div class="stage" style="transform:scale(${k});left:${(-x * k).toFixed(0)}px;top:${(-y * k).toFixed(0)}px">${body}</div></div>`;

/* 参考图复制进 .tmp 才能被验收页引用（页面就在 .tmp 里加载，同目录省得写绝对路径）。
 * 裁到**墨迹框**（原图 474×282 里，墨迹在 x 103..371 / y 41..229）—— 不裁的话两边尺寸对不上，
 * 叠着看就没意义了。 */
fs.copyFileSync(path.resolve(SRC, 'assets/ref-label-shape.png'), path.join(OUT, '_ref.png'));
const REF_IMG = '<div class="win" style="width:268px;height:189px">'
  + '<div class="stage" style="left:-103px;top:-41px">'
  + '<img src="_ref.png" style="display:block;width:474px"></div></div>';

/* 取景框坐标是跟着 build.mjs 里的 L 常量表定的 —— 改了版式，这里要跟着调。
 * 当前铭牌墨迹框 = x 1246..1498、y 107..284（本体 214.67×124.6，外加小耳与外鼓）。 */
const PRINT = [
  { file: 'zoom-a.png', w: 1000, h: 1300, rows: [
    ['A-1 · 整条标题行：字标 + 贴右缘站住的 2.0 铭牌（1× 真实像素；两者中线要齐、中间那道缝要能看清）', win(540, 88, 975, 262, 1)],
    ['A-2 · 铭牌全貌：四角内凹 + 左右小耳 + 色带/白圈/本体 三层（2.6×）', win(1240, 100, 264, 196, 2.6)],
    ['A-3 · 左小耳特写：白圈要裹住小耳（耳尖里没有紫色本体），不能断、不能溢出（6×）', win(1241, 163, 64, 68, 6)],
  ] },
  { file: 'zoom-b.png', w: 780, h: 540, rows: [
    ['B · 手绘箭头与「发布到」的位置（1.6×）', win(1120, 545, 480, 300, 1.6)],
  ] },
  { file: 'zoom-c.png', w: 640, h: 360, rows: [
    ['C · 「发布到」的字形：应与「微信公众号」同族（Microsoft YaHei 600，4×）', win(1290, 660, 160, 90, 4)],
  ] },
  { file: 'zoom-d.png', w: 700, h: 360, rows: [
    ['D · 框内两个标志的等高关系（1×）', win(280, 520, 700, 300, 1)],
  ] },
  /* 形状拟合的验收图：上=用户给的参考图（1×，墨迹 268×189），下=成品铭牌按**同样墨迹高**摆。
   * 这是唯一能判断"拟合得对不对"的看法 —— 两张图高度一致时叠着看才有效，
   * 所以下窗的倍率 = 189/178（成品的墨迹高）。 */
  { file: 'zoom-e.png', w: 320, h: 480, rows: [
    ['E-1 · 参考图（用户给的，墨迹 268×189）', REF_IMG],
    ['E-2 · 成品铭牌，按同一墨迹高摆（1.062×）', win(1246, 107, 252, 178, 1.062)],
  ] },
];

for (const p of PRINT) {
  const html = `<!doctype html><meta charset="utf-8">${style}<style>
html,body{margin:0;padding:0;background:#8b8b93}
.win{position:relative;overflow:hidden;margin:10px;box-shadow:0 8px 24px rgba(0,0,0,.35)}
.stage{position:absolute;width:${PW}px;height:${PH}px;transform-origin:0 0}
h5{margin:10px 10px 0;font:600 13px/1.4 "Segoe UI",sans-serif;color:#fff;letter-spacing:.02em}
</style>
${p.rows.map(([t, w]) => `<h5>${t}</h5>${w}`).join('')}`;
  const name = p.file.replace('.png', '.html');
  fs.writeFileSync(path.join(OUT, name), html);
  shot(name, p.file, p.w, p.h, 1);
}
console.log(`放大验收图已生成于 ${path.relative(path.resolve(SRC, '..'), OUT).replace(/\\/g, '/')}/`);
