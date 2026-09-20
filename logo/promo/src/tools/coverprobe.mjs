/* 封面成品的**像素级验收**：参数断言只能证明"按公式算出来是对的"，
 * 证明不了"渲染出来真是那样"。这里直接读交付的 PNG。
 *
 * 查四件事：
 *  ① 尺寸/比例是精确的（公众号按这个裁切）；
 *  ② A / 横幅的**上下留白**真的留出来了，而且与左右留白成同一比例
 *     （同比例 = 内容是等比缩放的，没有被拉扁）；
 *  ③ B 的组接近正方形、四边留白对称；铭牌确实在**笔杆右侧**（在字标之上），
 *     且与标记之间有一条够宽的空档 —— 空档直接从像素量，不看公式；
 *  ④ C 的 A|B 接缝**没有台阶**（A 缩进画框后，接缝不再是唯一的风险点，
 *     但仍是"两块拼起来"最容易露馅的地方）；
 *  ⑤ 字标本身**没被切**：墨迹宽高比 == 字标素材自己的宽高比。这一条是自校准的 ——
 *     不比边距、不比坐标，只比形状比例，所以不依赖任何"框"的定义（详见 B 那一段）。
 *
 * 用法：node coverprobe.mjs [dir]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG, sampler } from './png.mjs';
import { contentBox } from './contentbox.mjs';
import { TAG_ASPECT } from './lockup.mjs';
import { WMBB } from '../kit.mjs';

const B = path.dirname(fileURLToPath(import.meta.url));
const DIR = process.argv[2] || path.resolve(B, '../..');       // …/logo/promo
const P = (f) => path.join(DIR, f);
const BG = 'FBFAF7';
const BGV = [0xFB, 0xFA, 0xF7];

let fail = 0;
const ok = (label, cond, detail = '') => {
  if (!cond) fail++;
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
};

const load = (f) => {
  const img = decodePNG(fs.readFileSync(P(f)));
  return { img, px: sampler(img) };
};
const diff = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
/* 墨迹判据用 thr 14 —— 这是**下限**：背景那层紫光晕的峰值差约 13/255，
   再低就会把光晕当成墨迹（thr 8 会把整条上边算进去）。
   为什么不用 20：海报里紫框那圈浅紫描边（#E3D6F9）缩放后边缘被平均掉，
   thr 20 会把它判成背景，于是 A 的左右留白量出 125/122 这种**假不对称**；
   thr 14 量到的是 122/122。 */
const INK_THR = 14;
const isInk = (p, thr = INK_THR) => Math.max(Math.abs(p[0] - BGV[0]), Math.abs(p[1] - BGV[1]), Math.abs(p[2] - BGV[2])) > thr;

/** 某一行的墨迹段 [x0,x1] 列表 */
function runsInRow(img, px, y, thr = INK_THR) {
  const runs = [];
  let s = -1;
  for (let x = 0; x <= img.w; x++) {
    const on = x < img.w && isInk(px(x, y), thr);
    if (on && s < 0) s = x;
    if (!on && s >= 0) { runs.push([s, x - 1]); s = -1; }
  }
  return runs;
}

/** 在 [x0,x1] × [y0,y1] 区域里求内容包围盒（像素） */
function boxIn(img, px, x0, x1, y0, y1, thr = INK_THR) {
  let ax = Infinity, ay = Infinity, bx = -Infinity, by = -Infinity;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (isInk(px(x, y), thr)) { if (x < ax) ax = x; if (x > bx) bx = x; if (y < ay) ay = y; if (y > by) by = y; }
  }
  return { x0: ax, y0: ay, x1: bx, y1: by, w: bx - ax + 1, h: by - ay + 1 };
}

/** 内容里**最长的连续空白行带**（锁定是"上标记、下字标"，中间那条缝就是它） */
function largestBlankBand(img, px, all) {
  let best = { len: 0, a: all.y0, b: all.y0 }, s = -1;
  for (let y = all.y0; y <= all.y1 + 1; y++) {
    const blank = y <= all.y1 && runsInRow(img, px, y).length === 0;
    if (blank && s < 0) s = y;
    if (!blank && s >= 0) {
      if (y - s > best.len) best = { len: y - s, a: s, b: y - 1 };
      s = -1;
    }
  }
  return best;
}

/** 连通块（4 邻域）。用来把"铭牌"从"标记 + 字标"里分出来：
 *  按行找"最右那段墨迹"是不行的 —— 铭牌上沿比它的中线更靠左，会漏采，
 *  量出来的净空偏大（第一次实现就把 75px 当成了最小净空，而它只是铭牌最宽那几行的值）。 */
function components(img, px, all) {
  const W = all.w, H = all.h;
  const seen = new Uint8Array(W * H);
  const stack = new Int32Array(W * H);
  const at = (x, y) => (y - all.y0) * W + (x - all.x0);
  const out = [];
  for (let sy = all.y0; sy <= all.y1; sy++) for (let sx = all.x0; sx <= all.x1; sx++) {
    const k0 = at(sx, sy);
    if (seen[k0] || !isInk(px(sx, sy))) continue;
    seen[k0] = 1; stack[0] = k0;
    let sp = 1, ax = sx, bx = sx, ay = sy, by = sy, area = 0;
    while (sp) {
      const k = stack[--sp]; area++;
      const x = (k % W) + all.x0, y = ((k / W) | 0) + all.y0;
      if (x < ax) ax = x; if (x > bx) bx = x;
      if (y < ay) ay = y; if (y > by) by = y;
      for (let d = 0; d < 4; d++) {
        const nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0);
        const ny = y + (d === 2 ? 1 : d === 3 ? -1 : 0);
        if (nx < all.x0 || nx > all.x1 || ny < all.y0 || ny > all.y1) continue;
        const nk = at(nx, ny);
        if (seen[nk]) continue;
        if (!isInk(px(nx, ny))) { seen[nk] = 2; continue; }
        seen[nk] = 1; stack[sp++] = nk;
      }
    }
    out.push({ x0: ax, y0: ay, x1: bx, y1: by, w: bx - ax + 1, h: by - ay + 1, area });
  }
  return out;
}

/* ---------------- A / B / C 的尺寸与比例 ---------------- */
console.log('尺寸与比例');
const SPECS = [
  ['wewrite-cover-main-2.35x1-900x383.png', 900, 383],
  ['wewrite-cover-main-2.35x1-1800x766.png', 1800, 766],
  ['wewrite-cover-square-1x1-900x900.png', 900, 900],
  ['wewrite-cover-square-1x1-1800x1800.png', 1800, 1800],
  ['wewrite-cover-wide-3.35x1-1283x383.png', 1283, 383],
  ['wewrite-cover-wide-3.35x1-2566x766.png', 2566, 766],
];
for (const [f, w, h] of SPECS) {
  const { img } = load(f);
  ok(`${f} 尺寸精确`, img.w === w && img.h === h, `${img.w}×${img.h}（应 ${w}×${h}）`);
}
ok('A 的比例 == 2.35:1', Math.abs(900 / 383 - 2.35) < 0.002, `${(900 / 383).toFixed(4)}`);
ok('C 的比例 == 3.35:1', Math.abs(1283 / 383 - 3.35) < 0.002, `${(1283 / 383).toFixed(4)}`);

/* ---------------- A：上下留白 + 等比缩放 ---------------- */
console.log('\nA 主封面（内容带缩进 2.35:1 画框）');
let aBox = null;
{
  const { img, px } = load('wewrite-cover-main-2.35x1-900x383.png');
  const b = boxIn(img, px, 0, img.w - 1, 0, img.h - 1);
  aBox = b;
  const padT = b.y0, padB = img.h - 1 - b.y1, padL = b.x0, padR = img.w - 1 - b.x1;
  ok('上下真的留了白（元素不再顶到画布上下沿）', padT >= 12 && padB >= 12,
    `上 ${padT} / 下 ${padB} of ${img.h}`);
  ok('上下留白对称', Math.abs(padT - padB) <= 2, `${padT} / ${padB}`);
  ok('左右留白对称', Math.abs(padL - padR) <= 2, `${padL} / ${padR}`);
  /* 关键不变量：A 里的墨迹**宽高比 == 海报里墨迹的宽高比** —— 只有等比缩放才成立；
     拉扁或拉伸会立刻让它失衡。（注意不能用"上下留白% == 左右留白%"去判：
     A 缩的是**整条内容带**（2048×871 ≈ 2.35:1），而墨迹只占带内的 1731×871，
     墨迹自己不是 2.35:1，所以它的左右留白天然大于上下留白。） */
  const poster = contentBox(fs.readFileSync(P('wewrite-2.0-poster-2048x1152.png')), { bg: BG, thr: 20 });
  ok('A 的墨迹宽高比 == 海报的墨迹宽高比（等比缩放，没被拉扁）',
    Math.abs(b.w / b.h - poster.aspect) / poster.aspect < 0.02,
    `${(b.w / b.h).toFixed(4)} vs 海报 ${poster.aspect.toFixed(4)}`);
}

/* ---------------- B：组接近正方形 + 铭牌在笔杆右侧 ---------------- */
console.log('\nB 方形封面');
{
  const { img, px } = load('wewrite-cover-square-1x1-900x900.png');
  const all = boxIn(img, px, 0, img.w - 1, 0, img.h - 1);
  ok('B 的组四边都有留白', all.x0 > 20 && all.y0 > 20 && all.x1 < img.w - 21 && all.y1 < img.h - 21,
    `x ${all.x0}..${all.x1}  y ${all.y0}..${all.y1}`);
  ok('B 的组左右留白对称', Math.abs(all.x0 - (img.w - 1 - all.x1)) <= 2,
    `${all.x0} / ${img.w - 1 - all.x1}`);
  ok('B 的组上下留白对称', Math.abs(all.y0 - (img.h - 1 - all.y1)) <= 2,
    `${all.y0} / ${img.h - 1 - all.y1}`);
  ok('B 的组占用接近正方形（±4%）', Math.abs(all.w / all.h - 1) < 0.04, `${(all.w / all.h).toFixed(4)}:1`);

  /* 标记 / 字标 的分界：内容里最长的那条空白行带 */
  const band = largestBlankBand(img, px, all);
  const wordTop = band.b + 1;
  ok('B 里能分出「上标记 / 下字标」两段（字标与标记之间有空行带）',
    band.len >= 10 && wordTop < all.y1, `空行带 y ${band.a}..${band.b}（高 ${band.len}）`);

  /* 铭牌 = 含内容最右像素的那个连通块（它比字标还靠右，所以一定是它）。 */
  const comps = components(img, px, all);
  const tag = comps.reduce((a, c) => (c.x1 > a.x1 ? c : a));
  ok('B 里最右的连通块就是「2.0 铭牌」（它的墨迹宽高比 == 铭牌比）',
    Math.abs(tag.w / tag.h - TAG_ASPECT) < 0.06,
    `${tag.w}×${tag.h} = ${(tag.w / tag.h).toFixed(4)}，铭牌应 ≈ ${TAG_ASPECT}`);
  ok('B 里铭牌整体位于字标之上（挂在笔杆右侧，不是挂在字标右侧）',
    tag.y1 < wordTop, `铭牌 y ${tag.y0}..${tag.y1} vs 字标顶 ${wordTop}`);

  /* 净空 = 铭牌每一行里「它左侧那段墨迹的右缘」到「它的左缘」的距离，取最小 ——
     这是**真正的最近接近**。bCover 报的那个（铭牌最左 − 标记最右）是它的下界：
     最左点与最右点通常不在同一行，所以两个数一般不等。 */
  let minClear = Infinity, atRow = -1;
  for (let y = tag.y0; y <= tag.y1; y++) {
    const runs = runsInRow(img, px, y);
    const ti = runs.findIndex((r) => r[0] >= tag.x0 && r[1] <= tag.x1);
    if (ti <= 0) continue;
    const g = runs[ti][0] - runs[ti - 1][1] - 1;
    if (g < minClear) { minClear = g; atRow = y; }
  }
  ok('B 里铭牌与标记之间有一条够宽的空档（逐行取最近接近）', minClear >= 20,
    `最近接近 ${minClear}px（y=${atRow}）`);

  /* ⑤ 字标本身没被切：墨迹宽高比 == 字标素材自己的宽高比。
     为什么这样判：比例是**形状自己的**属性，不比边距、不比坐标，所以不依赖任何"框"的定义 ——
     图形在视口处被切掉一截，比例就变，而边距那类断言可能因为"框也跟着变"而照样绿。
     交付的 logo/wewrite-lockup-v.svg 就出过：viewBox 比图形窄 1.17 单位，
     字标末尾的 e 少了 ~8px，比例从 4.721 掉到 4.669（-1.1%）。
     为什么用 2× 图：1× 下字标才 ~156px 高，±1px 的读数噪声占 0.6%，分辨不出 1% 的裁切。
     为什么减 1：阈值判据会把抗锯齿边缘吃进来，宽高各多算 ~1px；素材盒那边的数
     是做过同样的 0.5px 亚像素修正的，不减就把系统性偏差算进结论。 */
  {
    const two = load('wewrite-cover-square-1x1-1800x1800.png');
    const all2 = boxIn(two.img, two.px, 0, two.img.w - 1, 0, two.img.h - 1);
    const band2 = largestBlankBand(two.img, two.px, all2);
    const wb = boxIn(two.img, two.px, all2.x0, all2.x1, band2.b + 1, all2.y1);
    const got = (wb.w - 1) / (wb.h - 1);
    const ref = (WMBB[2] - WMBB[0]) / (WMBB[3] - WMBB[1]);
    ok('B 里字标的墨迹宽高比 == 字标素材的宽高比（末尾的 e 没被切）',
      Math.abs(got - ref) / ref < 0.006,
      `${got.toFixed(4)} vs 素材 ${ref.toFixed(4)}（差 ${(((got - ref) / ref) * 100).toFixed(2)}%）`);
  }
}

/* ---------------- C：A|B 接缝不能有台阶 ---------------- */
console.log('\nC 宽幅封面（A|B 并排）');
{
  const { img, px } = load('wewrite-cover-wide-3.35x1-1283x383.png');
  const SEAM = 900;                                            // A 宽 900，B 从 900 开始
  /* 取"空白行"来量接缝：**躲开有内容的行**，否则比的是图形边界不是背景。 */
  let worst = 0, worstY = -1;
  for (const y of [2, 4, 6, img.h - 6, Math.round(img.h / 2)]) {
    const d = diff(px(SEAM - 1, y), px(SEAM, y));
    if (d > worst) { worst = d; worstY = y; }
  }
  ok('A|B 接缝处没有可见色阶（整张画布只有一层背景）', worst <= 2, `最大通道差 ${worst}（y=${worstY}）`);

  const left = boxIn(img, px, 0, SEAM - 1, 0, img.h - 1);
  const right = boxIn(img, px, SEAM, img.w - 1, 0, img.h - 1);
  ok('C 左半的上下留白与 A 一致（左半就是 A 的构图）',
    Math.abs(left.y0 - aBox.y0) <= 2 && Math.abs((img.h - 1 - left.y1) - (img.h - 1 - aBox.y1)) <= 2,
    `C 半 上${left.y0} 下${img.h - 1 - left.y1} vs A 上${aBox.y0} 下${383 - 1 - aBox.y1}`);
  ok('C 右半（方形）四边留白仍然存在', right.y0 > 4 && right.y1 < img.h - 5,
    `右半内容 y ${right.y0}..${right.y1} of ${img.h}`);
  console.log(`    （左半 x ${left.x0}..${left.x1} · 右半 x ${right.x0}..${right.x1}）`);

  /* 顺带确认 C 右半内容的高度与 B 按比例缩到 383 时应有的高度一致 ——
     不一致就说明 C 里的方形没按 B 的比例排（会露出"两块拼起来"的假） */
  const bBox = contentBox(fs.readFileSync(P('wewrite-cover-square-1x1-900x900.png')), { bg: BG, thr: 20 });
  const expectH = bBox.h * (383 / 900), expectW = bBox.w * (383 / 900);
  ok('C 里方形的内容尺寸 == B 等比缩到 383（确实是同一份构图）',
    Math.abs(right.h - expectH) <= 3 && Math.abs(right.w - expectW) <= 3,
    `C 里 ${right.w}×${right.h} vs 期望 ${Math.round(expectW)}×${Math.round(expectH)}`);
}

/* ---------------- README 横幅 ---------------- */
console.log('\nREADME 横幅');
{
  const png = path.resolve(DIR, '..', '..', 'assets', 'readme-banner.png');
  const img = decodePNG(fs.readFileSync(png));
  const px = sampler(img);
  const all = boxIn(img, px, 0, img.w - 1, 0, img.h - 1);
  const padT = all.y0, padB = img.h - 1 - all.y1;
  ok('横幅上下真的留了白（原来几乎为零、元素顶边）', padT >= 20 && padB >= 20,
    `上 ${padT} / 下 ${padB} of ${img.h}`);
  ok('横幅上下留白对称', Math.abs(padT - padB) <= 2, `${padT} / ${padB}`);
}

console.log(`\n结果：${fail ? fail + ' 项未通过' : '全部通过'}`);
process.exit(fail ? 1 : 0);
