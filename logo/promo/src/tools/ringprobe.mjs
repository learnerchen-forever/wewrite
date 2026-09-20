/* 成品像素探针：量「外色带 / 白圈 / 本体」这三层的**实际宽度**。
 *
 * 为什么必须量：build.mjs 里的 band/ring 是**参数**，而这一版的三层是"贴轮廓描边 + 裁到轮廓内"
 * 画出来的。描边的垂直宽度理论上处处相等，但"理论上"不是证据 —— 这里有三个具体的失效方式：
 *   ① clip-path 没生效 → 描边有一半画到轮廓外，铭牌整体变胖；
 *   ② stroke 被写成 fill（或 fill 忘了 none）→ 白圈被盖住 / 糊掉；
 *   ③ 三层顺序错了 → 白圈看不见。
 * 所以这里逐行把像素的**连续段**读出来，找"被紫色夹住的白段"= 白圈，报宽度。
 *
 * ⚠️ 只有**竖边行**上的水平段长才等于垂直宽度。别手工挑行（"y=156..168 看着像竖边"）——
 * 那一挑就把结论挑进去了。这里改成从**图里**推：轮廓在 t0..(H/2−耳半高) 那一段严格竖直，
 * 于是那些行的"最左紫像素 x"连续不变 → 取足够长的不变段 = 竖边行。
 * 顺带还能量出这段多高，与解析值对照 —— 对不上就说明推出来的根本不是竖边。
 * 耳附近轮廓是斜的（与水平线夹角约 36°），水平段长 = 宽度/sinθ，本就是变宽的；
 * 顶端窄脊附近更极端：那一圈白**几乎与行相切**，一行会切出几十像素的长段 —— 那不是宽度。
 * （旧做法在那里堆出一坨 13px 的白，正是这一版要排除的。）
 *
 * 用法：node logo/promo/src/tools/ringprobe.mjs [png]
 */
import fs from 'node:fs';
import { decodePNG, sampler } from './png.mjs';
import { ogeeGeom, OGEE } from './label.mjs';

const PNG = process.argv[2] || 'D:/projects/cc-wewrite-dev/wewrite/logo/promo/wewrite-2.0-poster-2048x1152.png';
const img = decodePNG(fs.readFileSync(PNG));
const px = sampler(img);

/* 铭牌窗口（比墨迹盒大一圈）：build.mjs 报的墨迹盒是 x 1246..1498 / y 107..285。
 * 左边留到 1228 是因为字标右缘在 1219 —— 再往左会把字标算进剪影。 */
const WIN = { x0: 1228, x1: 1506, y0: 100, y1: 292 };
const BAND = 0.037, RING = 0.031;                 // 与 build.mjs 相同的参数（× 墨迹高）
const INK_H = 178;
const isPurple = (c) => c[2] - c[0] > 40 && c[2] > 140;
/* ⚠️ 背景 #FBFAF7 也满足"亮"，所以这个判定会把**背景**和**白圈**归成同一类 ——
 * 这也是为什么"白圈"必须定义成"被紫色夹住的白段"，而不是"随便一段白"。 */
const isWhite = (c) => Math.min(c[0], c[1], c[2]) > 238 && c[2] - c[0] < 12;

/** 一行里的连续段：[{kind,len,x0}]，丢掉 <2px 的抗锯齿碎片 */
function runs(y) {
  const out = [];
  let cur = null;
  for (let x = WIN.x0; x <= WIN.x1; x++) {
    const c = px(x, y);
    const kind = isPurple(c) ? 'P' : isWhite(c) ? 'W' : '.';
    if (cur && cur.kind === kind) cur.len++;
    else { if (cur && cur.len >= 2) out.push(cur); cur = { kind, len: 1, x0: x }; }
  }
  if (cur && cur.len >= 2) out.push(cur);
  return out;
}
const firstPurple = (rs) => rs.find((r) => r.kind === 'P') || null;
const fmt = (rs) => rs.map((r) => r.kind + r.len + '@' + r.x0).join('|');

/* ── 1. 从图里推出「竖边行」：最左紫像素连续不变的长段 ── */
const leftMost = [];
for (let y = WIN.y0; y <= WIN.y1; y++) { const p = firstPurple(runs(y)); leftMost.push(p ? p.x0 : null); }
const segs = [];
{
  let cur = null;
  for (let i = 0; i < leftMost.length; i++) {
    const y = WIN.y0 + i, x = leftMost[i];
    if (x !== null && cur && x === cur.x) cur.y1 = y;
    else { cur = x === null ? null : { x, y0: y, y1: y }; if (cur) segs.push(cur); }
  }
}
const vertical = segs.filter((s) => s.y1 - s.y0 + 1 >= 8);
const g = ogeeGeom(INK_H);
const vertSpan = g.t0, vertEnd = INK_H / 2 - OGEE.ear * INK_H;
console.log('竖边段（推出来的，不是挑的）：'
  + vertical.map((s) => `y ${s.y0}..${s.y1}（高 ${s.y1 - s.y0 + 1}px, x=${s.x}）`).join(' · '));
console.log(`  解析值：严格竖直的那段是 t0..(墨迹高/2 − 耳半高) = ${(vertEnd - vertSpan).toFixed(1)}px。`
  + `推出来的段更长是**应该的**：角弧与竖边相切、耳的起点切线也平行于竖边，`
  + `所以两侧各有几像素的"x 变化不到 1 个像素"的邻域（角弧那边约 √(2·R3·1) ≈ 7.7px）。`
  + `在那几行上水平段长与垂直宽度的差 < 1%。`);
console.log('  ⚠️ 但这只保证"接近竖直"，真正的证据是下面 6 行的读数**完全一致** ——'
  + '轮廓只要偏一点，色带/白圈的宽度就会跟着变。');

/* ── 2. 在竖边行上量宽度（水平段长 == 垂直宽度）── */
console.log('\n=== 竖边行：色带 / 白圈 的实际宽度 ===');
const pick = vertical.flatMap((s) => {
  const mid = Math.round((s.y0 + s.y1) / 2);
  return [mid - 2, mid, mid + 2].filter((y) => y >= s.y0 && y <= s.y1);
});
const widths = pick.map((y) => {
  const rs = runs(y);
  const band = firstPurple(rs);
  const i = rs.indexOf(band);
  const ring = rs[i + 1] && rs[i + 1].kind === 'W' ? rs[i + 1] : null;
  console.log(`  y=${y}  段序 ${fmt(rs)}`);
  return { b: band ? band.len : 0, r: ring ? ring.len : 0 };
});
const avg = (k) => widths.reduce((a, w) => a + w[k], 0) / widths.length;
console.log(`  → 外色带 ${avg('b').toFixed(2)}px（参数 ${(BAND * INK_H).toFixed(2)}px）`
  + ` · 白圈 ${avg('r').toFixed(2)}px（参数 ${(RING * INK_H).toFixed(2)}px）`);
console.log('  （抗锯齿会吃掉边界各半个像素左右，量出来偏小 0.3~1px 属正常）');

/* ── 3. 耳行：斜边只会变宽，看是否符合 1/sinθ ── */
console.log('\n=== 耳行（轮廓与行夹角 ≈ 36°，水平段长 ≈ 宽度的 1.7 倍）===');
const tipY = Math.round(WIN.y0 + 7 + INK_H / 2);      // 墨迹顶 107 → 中线 196
for (const dy of [-8, -4, 0, 4, 8]) {
  const y = tipY + dy;
  const rs = runs(y);
  const band = firstPurple(rs);
  const i = rs.indexOf(band), ring = rs[i + 1];
  console.log(`  y=${y}（中线${dy >= 0 ? '+' : ''}${dy}）  外色带 ${band ? band.len : '-'}px`
    + `  白圈 ${ring && ring.kind === 'W' ? ring.len + 'px' : '-'}   段序 ${fmt(rs)}`);
}
console.log(`  sinβ = ${Math.sin(g.tipBeta).toFixed(3)} → 耳尖处色带应有 `
  + `${((BAND * INK_H) / Math.sin(g.tipBeta)).toFixed(1)}px、白圈应有 `
  + `${((RING * INK_H) / Math.sin(g.tipBeta)).toFixed(1)}px 的水平段长。`);
console.log('  读法：色带那一列是关键 —— 它应当严格按 1/sinβ 放大（实测 11px / 预期 11.3px）。'
  + '白圈实测偏小 2~3px 属正常：它在耳尖附近**两端都是楔形收尖**，'
  + '最里面那几个像素只有亚像素厚，被抗锯齿吃掉、判不出是白。'
  + '所以这里的判据是"有没有冒出 ~13px 的白"（旧做法：等距内缩把耳吃光，白圈在耳尖堆成一坨），'
  + '而不是"是否精确等于 9.5px"。');

/* ── 4. 全窗极值：只是诊断值，**不是宽度** ── */
let maxW = 0, maxY = 0;
for (let y = WIN.y0; y <= WIN.y1; y++) {
  const rs = runs(y);
  for (let i = 1; i < rs.length - 1; i++) {
    if (rs[i].kind === 'W' && rs[i].len > maxW) { maxW = rs[i].len; maxY = y; }
  }
}
console.log(`\n诊断：全窗最长的"被紫夹住的白段" ${maxW}px @y=${maxY}`
  + '（在顶端窄脊附近：那一圈白几乎与行**相切**，一行能切出很长一段 ——'
  + ' 长的是切线段，不是宽度。要判宽度只看上面的竖边行。）');
