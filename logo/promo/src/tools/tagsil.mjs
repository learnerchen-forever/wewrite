/* 端到端复核：在**交付的 PNG** 上量 2.0 铭牌的剪影，和参考图同口径比。
 *
 * 为什么要这一道：labelprobe 证明的是「参数化的路径对不对」，gapprobe 证明的是「位置对不对」，
 * 都还没证明「渲染到成品上仍是那个形状」。这一步不重渲染、只读交付图，把两头接上。
 * 用法：node logo/promo/src/tools/tagsil.mjs [png]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG, sampler } from './png.mjs';

const B = path.dirname(fileURLToPath(import.meta.url));
const POSTER = path.resolve(B, '../../wewrite-2.0-poster-2048x1152.png');
const REF = path.resolve(B, '../assets/ref-label-shape.png');

/* 铭牌所在窗口：只要**装得下铭牌、且不碰别的紫色物体**就行（窗口里的墨迹盒自己会被量出来，
 * 所以窗口不需要贴边）。build.mjs 报的墨迹盒是 x 1246..1497 / y 107..284；
 * 左边留到 1228 是因为字标右缘在 1219 —— 再往左就会把字标算进剪影里。 */
const WIN = { x: 1228, y: 90, w: 292, h: 206 };
const ROWS = 46;

const isInk = (c) => c[2] - c[0] > 40 && c[2] > 140;   // 与 gapprobe 同一判据（紫族）

function silhouette(img, x0s, y0s, x1s, y1s, test, norm) {
  const px = sampler(img);
  let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
  for (let y = y0s; y <= y1s; y++) for (let x = x0s; x <= x1s; x++) if (test(px(x, y))) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) throw new Error('窗口里没有墨迹');
  const IH = y1 - y0 + 1;
  const rows = [];
  for (let r = 0; r < ROWS; r++) {
    const ya = y0 + Math.floor((IH * r) / ROWS), yb = y0 + Math.floor((IH * (r + 1)) / ROWS);
    let l = 1e9, rr = -1;
    for (let y = ya; y < yb; y++) for (let x = x0; x <= x1; x++) if (test(px(x, y))) {
      if (x < l) l = x; if (x > rr) rr = x;
    }
    rows.push(l > x1 ? null : { l: (l - x0) / IH, r: (x1 - rr) / IH });
  }
  return { rows, ink: [x1 - x0 + 1, IH], aspect: (x1 - x0 + 1) / IH, box: [x0, y0, x1, y1], norm };
}

const can = silhouette(decodePNG(fs.readFileSync(POSTER)), WIN.x, WIN.y,
  WIN.x + WIN.w - 1, WIN.y + WIN.h - 1, isInk, 'poster');
/* 参考图：色偏判定（粉），与 refprobe 一致 */
const refImg = decodePNG(fs.readFileSync(REF));
const ref = silhouette(refImg, 0, 0, refImg.w - 1, refImg.h - 1, (c) => {
  const mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]);
  return mx - mn > 18 && mx < 250;
}, 'ref');

console.log(`成品铭牌 窗口内墨迹 ${can.ink.join('×')} 宽高比 ${can.aspect.toFixed(3)}`
  + ` · 绝对框 x ${can.box[0]}..${can.box[2]} y ${can.box[1]}..${can.box[3]}`);
console.log(`参考图   墨迹 ${ref.ink.join('×')} 宽高比 ${ref.aspect.toFixed(3)}`);
console.log('\n   t     参考L   成品L   ΔL      参考R   成品R   ΔR');
let s = 0, n = 0, worst = 0;
for (let r = 2; r < ROWS - 2; r++) {
  const a = ref.rows[r], b = can.rows[r];
  if (!a || !b) continue;
  const dL = b.l - a.l, dR = b.r - a.r;
  s += Math.abs(dL) + Math.abs(dR); n += 2; worst = Math.max(worst, Math.abs(dL), Math.abs(dR));
  const mark = Math.abs(dL) > 0.03 || Math.abs(dR) > 0.03 ? '  <<' : '';
  console.log(`  ${(r / ROWS).toFixed(2)}   ${a.l.toFixed(3)}   ${b.l.toFixed(3)}  ${dL >= 0 ? '+' : ''}${dL.toFixed(3)}`
    + `    ${a.r.toFixed(3)}   ${b.r.toFixed(3)}  ${dR >= 0 ? '+' : ''}${dR.toFixed(3)}${mark}`);
}
console.log(`\n成品 vs 参考（t=0.04..0.96）：平均偏差 ${(s / n).toFixed(4)} · 最大 ${worst.toFixed(4)}`
  + `  —— 单位「墨迹高」，0.01 ≈ 1.9px（参考图 268×189）`);
console.log('这一项同时覆盖了「轮廓」「外色带在不在最外层」「白圈没把耳吃掉」三件事：'
  + '耳被吃光时左右边界会在这里整体缩进约 boss 那么多。');
