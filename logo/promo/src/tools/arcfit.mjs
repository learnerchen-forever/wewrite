/* 从参考图里把**外轮廓**量出来，并按「相切的圆弧链」做最小二乘拟合。
 *
 * 为什么不是"左右边界 + 目测"：参考图是水彩，内部涂色是碎的（同一个阈值下中部会裂成十几个段），
 * 但外轮廓是稳定的（refcrest.mjs 扫过 TH=6..40 都不动）。外轮廓可以直接当成"真实形状"来拟合。
 *
 * 为什么拟合成**圆弧链**而不是三次曲线：参考图的过渡是"缓"的 —— 从顶点到竖边要经过
 * 凸(窄脊) → 凹(收腰) → 凸(圆角) 三次换向，三段圆弧能把每一处曲率都拟出来
 * （残差 0.0029·墨迹高 ≈ 0.5px）。抛物线 + 挖角圆那套只对得上顶端，肩部一整段是错的。
 *
 * ⚠️ 弧链**不再**是"白圈要均匀"的前提：那一圈现在是"贴轮廓描边 + 裁到轮廓内"画出来的，
 * 描边的垂直宽度天生处处相等（见 build.mjs 的 tagSVG 与 label.mjs 的文件头）。
 * 所以别因为"想换三次曲线"就放弃弧链，也别因为"弧链内缩方便"把描边改回等距内缩
 * —— 耳是二次曲线，等距内缩没有解析解，会把它整个吃光。
 *
 * 用法：node logo/promo/src/tools/arcfit.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG, sampler } from './png.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const img = decodePNG(fs.readFileSync(path.resolve(HERE, '../assets/ref-label-shape.png')));
const px = sampler(img);
const isInk = (c) => { const mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]); return mx - mn > 10 && mx < 250; };

let bx0 = 1e9, bx1 = -1, by0 = 1e9, by1 = -1;
for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) if (isInk(px(x, y))) {
  if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
}
const IW = bx1 - bx0 + 1, IH = by1 - by0 + 1;
console.log(`墨迹 ${IW}×${IH}  宽高比 ${(IW / IH).toFixed(4)}`);

/* 逐行外轮廓（不做分块 —— 分块会把顶端曲率最快的部分糊掉） */
const prof = [];
for (let y = by0; y <= by1; y++) {
  let l = 1e9, r = -1;
  for (let x = bx0; x <= bx1; x++) if (isInk(px(x, y))) { if (x < l) l = x; if (x > r) r = x; }
  if (r < 0) continue;
  prof.push({ t: (y - by0) / IH, L: (l - bx0) / IH, R: (bx1 - r) / IH });
}
/* 侧边"平台" = 本体左缘相对墨迹左缘的缩进（= 耳突出） */
const plat = prof.filter((p) => p.t > 0.30 && p.t < 0.33).map((p) => p.L);
const BOSS = plat.reduce((a, b) => a + b, 0) / plat.length;
const HALF = IW / IH / 2 - BOSS;                        // 本体半宽
console.log(`耳突出 boss=${BOSS.toFixed(4)}·H  本体半宽=${HALF.toFixed(4)}·H  本体宽=${(2 * HALF).toFixed(4)}·H\n`);

/* u(t) = 左右边界相对**本体左缘**的缩进（左右取平均，顺便报出不对称度） */
const pts = prof.map((p) => ({ t: p.t, u: ((p.L - BOSS) + (p.R - BOSS)) / 2, asym: p.L - p.R }));
console.log('   t       u(t)    左右不对称    顶部镜像(u(t) vs u(1−t))   底部镜像');
for (let i = 0; i < pts.length; i++) {
  const p = pts[i];
  if (Math.abs(((p.t * 100) % 2) - 0.05) > 0.6) continue;      // 每 2% 打一行
  const mirT = pts.reduce((best, q) => Math.abs(q.t - (1 - p.t)) < Math.abs(best.t - (1 - p.t)) ? q : best, pts[0]);
  console.log(`  ${p.t.toFixed(3)}  ${p.u.toFixed(4)}     ${p.asym >= 0 ? '+' : ''}${p.asym.toFixed(4)}`
    + `          ${mirT.u.toFixed(4)}                    ${Math.abs(p.u - mirT.u).toFixed(4)}`);
}

/* ---------- 圆弧最小二乘：u² + t² = 2a·u + 2b·t + c，圆心 (a,b)，R = √(a²+b²+c) ---------- */
function fitArc(p) {
  let S = Array.from({ length: 3 }, () => [0, 0, 0]), B = [0, 0, 0];
  for (const { t, u } of p) {
    const x = [2 * u, 2 * t, 1], y = u * u + t * t;
    for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) S[i][j] += x[i] * x[j]; B[i] += x[i] * y; }
  }
  /* 3×3 高斯消元 */
  const M = S.map((row, i) => [...row, B[i]]);
  for (let c = 0; c < 3; c++) {
    let piv = c; for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < 3; r++) if (r !== c && M[c][c] !== 0) {
      const k = M[r][c] / M[c][c];
      for (let j = c; j < 4; j++) M[r][j] -= k * M[c][j];
    }
  }
  const a = M[0][3] / M[0][0], b = M[1][3] / M[1][1], cc = M[2][3] / M[2][2];
  const R = Math.sqrt(a * a + b * b + cc);
  let mx = 0, sum = 0;
  for (const { t, u } of p) { const e = Math.abs(Math.hypot(u - a, t - b) - R); mx = Math.max(mx, e); sum += e; }
  return { a, b, R, rms: sum / p.length, max: mx };
}
const win = (t0, t1) => pts.filter((p) => p.t >= t0 && p.t <= t1);
console.log('\n分窗圆弧拟合（u,t 单位都是墨迹高；圆心在同一条竖线上才是相切的凹+凸过渡）');
const FREE = {};
for (const [n, t0, t1] of [['cap', 0.00, 0.035], ['shoulder', 0.055, 0.105], ['corner', 0.13, 0.255]]) {
  const f = fitArc(win(t0, t1)); FREE[n] = f;
  console.log(`  ${n.padEnd(9)} t∈[${t0},${t1}]  圆心(${f.a.toFixed(4)}, ${f.b.toFixed(4)})  R=${f.R.toFixed(4)}`
    + `  平均残差 ${f.rms.toFixed(4)} 最大 ${f.max.toFixed(4)}`);
}
/* 自由拟合的三个圆本来就接近相切（距离 ≈ 半径和），但"接近"不够：
 * 白圈是用"半径 ± off、圆心不动"叠出来的，链上只要差一点点，接缝处就会露出豁口。
 * 所以把它**约束成严格相切的链**再拟合一次：
 *   cap   圆心钉在中线上（顶点正好落在 t=0）、半径 R1
 *   shoulder 圆心 = cap圆心 + (R1+R2)·方向θ
 *   corner 圆心 = (R3, t0)，与 shoulder 外切，且与竖边 u=0 相切
 * 未知量只有 5 个：R1 R2 θ R3 t0。 */
/* ⚠️ t < 0.008 的行不能用：参考图顶端那 1~2 行是水彩的软边（顶点本来是个尖，
 * 那一行却铺开成 40 多像素），拟合会把它当成"顶端很平"而把 cap 半径压小一半。
 * 渲染出来的候选图有一样的现象（第一行同样铺开 43px），所以这不是参考图特有的毛病。 */
const sym = pts.filter((p) => p.t >= 0.008 && p.t <= 0.26).map((p) => {
  const m = pts.reduce((b, q) => Math.abs(q.t - (1 - p.t)) < Math.abs(b.t - (1 - p.t)) ? q : b, pts[0]);
  return { t: p.t, u: (p.u + m.u) / 2 };
});
const C1 = (R1) => ({ x: HALF, y: R1 });
const chain = (p) => {
  const c1 = C1(p.R1);
  const c2 = { x: c1.x + (p.R1 + p.R2) * Math.cos(p.th), y: c1.y + (p.R1 + p.R2) * Math.sin(p.th) };
  /* t0 不是自由参数：corner 必须同时与 shoulder 外切、与竖边 u=0 相切 ——
   * 由这两条约束解出来，才是"严格相切的链"。 */
  const dx = p.R3 - c2.x, k = (p.R2 + p.R3) ** 2 - dx * dx;
  const t0 = c2.y + Math.sqrt(Math.max(0, k));
  const c3 = { x: p.R3, y: t0 };
  /* 接点（两个圆心的连线与圆的交点）——严格相切时两个圆给出同一个点 */
  const j1 = { t: c1.y + (p.R1 / (p.R1 + p.R2)) * (c2.y - c1.y) };
  const j2 = { t: c2.y + (p.R2 / (p.R2 + p.R3)) * (c3.y - c2.y) };
  const uAt = (t) => {
    if (t <= j1.t) { const d = t - c1.y; return c1.x - Math.sqrt(Math.max(0, p.R1 * p.R1 - d * d)); }
    if (t <= j2.t) { const d = t - c2.y; return c2.x + Math.sqrt(Math.max(0, p.R2 * p.R2 - d * d)); }
    const d = t - c3.y; return c3.x - Math.sqrt(Math.max(0, p.R3 * p.R3 - d * d));
  };
  let s = 0, mx = 0;
  for (const q of sym) { const e = Math.abs(uAt(q.t) - q.u); s += e; mx = Math.max(mx, e); }
  return { rms: s / sym.length, max: mx, c1, c2, c3, t0, j1: j1.t, j2: j2.t, uAt };
};
const th0 = Math.atan2(FREE.shoulder.b - FREE.cap.b, FREE.shoulder.a - FREE.cap.a);
let p = { R1: FREE.cap.R, R2: FREE.shoulder.R, th: th0, R3: FREE.corner.R };
let best = chain(p).rms;
console.log(`\n初值 rms=${best.toFixed(5)}（自由拟合拼起来）—— 下面按坐标下降把它压下去：`);
for (const step of [0.05, 0.02, 0.008, 0.003, 0.001, 0.0003]) {
  let improved = true, rounds = 0;
  while (improved && rounds++ < 200) {
    improved = false;
    for (const k of ['R1', 'R2', 'th', 'R3']) {
      for (const s of [step, -step]) {
        const q = { ...p, [k]: p[k] + s };
        const r = chain(q).rms;
        if (r < best - 1e-9) { p = q; best = r; improved = true; }
      }
    }
  }
}
const F = chain(p);
console.log(`约束后的链：平均残差 ${F.rms.toFixed(5)} · 最大 ${F.max.toFixed(5)}`
  + `（参考图墨迹高 189px，0.001 ≈ 0.19px）`);
console.log(`  R1=${p.R1.toFixed(4)}  R2=${p.R2.toFixed(4)}  R3=${p.R3.toFixed(4)}`
  + `  θ=${(p.th * 180 / Math.PI).toFixed(3)}°  t0=${F.t0.toFixed(4)}（解出来的）`);
console.log(`  cap 圆心     (${F.c1.x.toFixed(4)}, ${F.c1.y.toFixed(4)})  顶点 t=${(F.c1.y - p.R1).toFixed(4)}（应为 0）`);
console.log(`  shoulder 圆心(${F.c2.x.toFixed(4)}, ${F.c2.y.toFixed(4)})`);
console.log(`  corner 圆心  (${F.c3.x.toFixed(4)}, ${F.c3.y.toFixed(4)})  与竖边相切点 t=${F.t0.toFixed(4)}`);
console.log(`  接点 t：cap↔shoulder ${F.j1.toFixed(4)} · shoulder↔corner ${F.j2.toFixed(4)}`);
console.log(`  相切检查：|C1C2|−R1−R2=${(Math.hypot(F.c2.x - F.c1.x, F.c2.y - F.c1.y) - p.R1 - p.R2).toFixed(6)}`
  + ` · |C2C3|−R2−R3=${(Math.hypot(F.c3.x - F.c2.x, F.c3.y - F.c2.y) - p.R2 - p.R3).toFixed(6)}`
  + ` · corner 与 u=0: ${(F.c3.x - p.R3).toFixed(6)}`);
console.log('\n  用这 4+1 个数当常量（× 墨迹高）逐行核对：');
for (const q of sym) {
  if (Math.abs(((q.t * 100) % 4) - 0.05) > 0.6) continue;
  console.log(`   t=${q.t.toFixed(3)}  参考 ${q.u.toFixed(4)}  链 ${F.uAt(q.t).toFixed(4)}  Δ ${(F.uAt(q.t) - q.u >= 0 ? '+' : '')}${(F.uAt(q.t) - q.u).toFixed(4)}`);
}
