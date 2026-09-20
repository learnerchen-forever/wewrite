/* 位图参考 → 矢量（自包含：自带 PNG 解码 + marching squares + Douglas-Peucker）
 *
 * 为什么要自己写：本机没有可用的图像库（pip 装第三方包要联网，且这台机器 raw 域常超时），
 * 而 node 自带 zlib，足够把一张 8bit 非隔行 PNG 解出来。
 *
 * 用途：微信公众号官方标志只有位图（用户给的原图），海报里必须能无损放大，
 * 所以描成 `<path>`；同时把「原图色彩」按像素统计出来（众数），不要凭记忆填 #07C160。
 *
 * 用法：node trace-ref.mjs <in.png> <out-name> [iso=128] [eps=0.5]
 */
import fs from 'node:fs';
import { decodePNG, sampler } from './png.mjs';

import path from 'node:path';
import { fileURLToPath } from 'node:url';
const B = path.dirname(fileURLToPath(import.meta.url));
/* 描摹结果直接落到资产目录 —— 重新描摹一次，海报用的就是新矢量 */
const OUT = path.resolve(B, '../assets');

/* ---------------- marching squares（带亚像素插值） ---------------- */
function contour(field, W, H, iso) {
  const at = (x, y) => field[y * W + x];
  const eh = (x, y) => { const a = at(x, y), b = at(x + 1, y); const t = (iso - a) / (b - a || 1e-9); return [x + Math.min(Math.max(t, 0), 1), y]; };
  const ev = (x, y) => { const a = at(x, y), b = at(x, y + 1); const t = (iso - a) / (b - a || 1e-9); return [x, y + Math.min(Math.max(t, 0), 1)]; };
  const T = (x, y) => ({ k: `H,${y},${x}`, p: eh(x, y) });
  const B = (x, y) => ({ k: `H,${y + 1},${x}`, p: eh(x, y + 1) });
  const L = (x, y) => ({ k: `V,${x},${y}`, p: ev(x, y) });
  const R = (x, y) => ({ k: `V,${x + 1},${y}`, p: ev(x + 1, y) });

  const segs = [];
  const push = (a, b) => segs.push([a, b]);
  for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
    const a = at(x, y) >= iso ? 8 : 0, b = at(x + 1, y) >= iso ? 4 : 0;
    const c = at(x + 1, y + 1) >= iso ? 2 : 0, d = at(x, y + 1) >= iso ? 1 : 0;
    const cs = a | b | c | d;
    if (cs === 0 || cs === 15) continue;
    const mid = (at(x, y) + at(x + 1, y) + at(x + 1, y + 1) + at(x, y + 1)) / 4 >= iso;
    /* 方向约定：沿线段行进时，「实心」在左手边。全部 16 例逐一手推过（见 SKILL 记的手法）。 */
    switch (cs) {
      case 1: push(B(x, y), L(x, y)); break;
      case 2: push(R(x, y), B(x, y)); break;
      case 3: push(R(x, y), L(x, y)); break;
      case 4: push(T(x, y), R(x, y)); break;
      case 5: if (mid) { push(T(x, y), L(x, y)); push(B(x, y), R(x, y)); }
              else { push(T(x, y), R(x, y)); push(B(x, y), L(x, y)); } break;
      case 6: push(T(x, y), B(x, y)); break;
      case 7: push(T(x, y), L(x, y)); break;
      case 8: push(L(x, y), T(x, y)); break;
      case 9: push(B(x, y), T(x, y)); break;
      case 10: if (mid) { push(R(x, y), T(x, y)); push(L(x, y), B(x, y)); }
               else { push(L(x, y), T(x, y)); push(R(x, y), B(x, y)); } break;
      case 11: push(R(x, y), T(x, y)); break;
      case 12: push(L(x, y), R(x, y)); break;
      case 13: push(B(x, y), R(x, y)); break;
      case 14: push(L(x, y), B(x, y)); break;
    }
  }

  /* 无向拼接成环：每个边键恰好被两条线段共用 */
  const map = new Map();
  segs.forEach((s, i) => {
    for (const e of s) {
      if (!map.has(e.k)) map.set(e.k, []);
      map.get(e.k).push(i);
    }
  });
  const multi = [...map.entries()].filter(([, v]) => v.length !== 2);
  const used = new Uint8Array(segs.length);
  const loops = [];
  let broken = 0;
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const startK = segs[i][0].k;
    const pts = [segs[i][0].p];
    let cur = segs[i][1];
    let closed = false;
    for (let guard = 0; guard < segs.length + 4; guard++) {
      pts.push(cur.p);
      const cand = (map.get(cur.k) || []).filter((j) => !used[j]);
      if (!cand.length) { closed = cur.k === startK; break; }
      used[cand[0]] = 1;
      const s = segs[cand[0]];
      cur = s[0].k === cur.k ? s[1] : s[0];
    }
    if (!closed) broken++;
    if (closed && pts.length > 8) loops.push(pts);
  }
  contour.stats = { segs: segs.length, keys: map.size, multi: multi.length, broken, closed: loops.length };
  if (multi.length) contour.multi = multi.slice(0, 5).map(([k, v]) => `${k}×${v.length}`).join(' ');
  return loops;
}

/** 鞋带公式：滤掉抗锯齿在叶尖留下的 1–2px 碎屑（它们会让路径里多出十几个假环） */
function area(pts) {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % n];
    a += x0 * y1 - x1 * y0;
  }
  return Math.abs(a) / 2;
}

/* ---------------- 简化 ---------------- */
function dp(pts, eps) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [i0, i1] = stack.pop();
    const [x0, y0] = pts[i0], [x1, y1] = pts[i1];
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1e-9;
    let maxD = -1, idx = -1;
    for (let i = i0 + 1; i < i1; i++) {
      const d = Math.abs((pts[i][0] - x0) * dy - (pts[i][1] - y0) * dx) / len;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > eps && idx > 0) { keep[idx] = 1; stack.push([i0, idx], [idx, i1]); }
  }
  return pts.filter((_, i) => keep[i]);
}
/** 闭合环要从「离质心最远的点」切开再简化，否则首尾弦长为 0，DP 会退化成保留全部点 */
function simplifyClosed(pts, eps) {
  const n = pts.length;
  if (n < 5) return pts;
  let cx = 0, cy = 0;
  for (const [x, y] of pts) { cx += x; cy += y; }
  cx /= n; cy /= n;
  let s = 0, best = -1;
  for (let i = 0; i < n; i++) { const d = (pts[i][0] - cx) ** 2 + (pts[i][1] - cy) ** 2; if (d > best) { best = d; s = i; } }
  const rot = pts.slice(s).concat(pts.slice(0, s));
  let k = 1, bd = -1;
  for (let i = 1; i < n; i++) {
    const d = (rot[i][0] - rot[0][0]) ** 2 + (rot[i][1] - rot[0][1]) ** 2;
    if (d > bd) { bd = d; k = i; }
  }
  const A = dp(rot.slice(0, k + 1), eps);
  const B = dp(rot.slice(k).concat([rot[0]]), eps);
  return A.slice(0, -1).concat(B.slice(0, -1));
}

/* ---------------- 主流程 ---------------- */
const [src, name, isoArg, epsArg] = process.argv.slice(2);
if (!src || !name) { console.error('用法: node trace-ref.mjs <in.png> <out-name> [iso] [eps]'); process.exit(1); }
const iso = isoArg ? +isoArg : 128;
const eps = epsArg ? +epsArg : 0.5;

const img = decodePNG(fs.readFileSync(src));
const px = sampler(img);
const { w, h, ctype, chans } = img;

/* 「墨量」= 不透明度 × (255 - min(r,g,b))；白底→0，透明→0，纯色→接近 255 */
const F = new Float32Array((w + 2) * (h + 2));
const FW = w + 2, FH = h + 2;
const exact = new Map();
let inkPixels = 0;
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  const [r, g, b, a] = px(x, y);
  const v = (255 - Math.min(r, g, b)) * (a / 255);
  F[(y + 1) * FW + (x + 1)] = v;
  if (v > 240) {
    inkPixels++;
    const key = (r << 16) | (g << 8) | b;
    exact.set(key, (exact.get(key) || 0) + 1);
  }
}
/* 「原图色彩」= 出现次数最多的那个**精确** RGB，不做桶平均、不凭记忆填官方色号 */
let topKey = 0, topN = 0;
for (const [k, v] of exact) if (v > topN) { topN = v; topKey = k; }
const hex = (n) => n.toString(16).padStart(2, '0');
const color = '#' + hex((topKey >> 16) & 255) + hex((topKey >> 8) & 255) + hex(topKey & 255);
const shades = [...exact.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
  .map(([k, v]) => '#' + hex((k >> 16) & 255) + hex((k >> 8) & 255) + hex(k & 255) + `×${v}`).join(' ');

const rawLoops = contour(F, FW, FH, iso).filter((lp) => area(lp) >= 40);
{
  const s = contour.stats;
  let mx0 = Infinity, my0 = Infinity, mx1 = -Infinity, my1 = -Infinity;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (F[(y + 1) * FW + (x + 1)] > iso) {
    if (x < mx0) mx0 = x; if (x > mx1) mx1 = x; if (y < my0) my0 = y; if (y > my1) my1 = y;
  }
  console.log(`掩膜包围盒 ${mx0},${my0} – ${mx1},${my1}  (${mx1 - mx0 + 1}×${my1 - my0 + 1})`);
  console.log(`线段 ${s.segs} · 边键 ${s.keys}（≥3 条共用的 ${s.multi} 个${contour.multi ? '：' + contour.multi : ''}）· 未闭合 ${s.broken} · 成环 ${s.closed}`);
}

/* DUMP=1 时先把掩膜打成字符图 —— 用来判断「描摹错」还是「解码就错了」 */
if (process.env.DUMP) {
  const cols = +(process.env.DUMP_COLS || 108);
  const sy = cols / w, rows = Math.round(h * sy * 0.5);
  let out = '';
  for (let r = 0; r < rows; r++) {
    let line = '';
    for (let c = 0; c < cols; c++) {
      const x0 = Math.floor(c / sy), x1 = Math.min(w - 1, Math.ceil((c + 1) / sy));
      const y0 = Math.floor(r / sy / 0.5), y1 = Math.min(h - 1, Math.ceil((r + 1) / sy / 0.5));
      let ink = 0, tot = 0;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { ink += F[(y + 1) * FW + (x + 1)] > iso ? 1 : 0; tot++; }
      const f = ink / tot;
      line += f > 0.85 ? '#' : f > 0.5 ? '+' : f > 0.15 ? '.' : ' ';
    }
    out += line.replace(/\s+$/, '') + '\n';
  }
  console.log(out);
}

const whole = [];
for (const lp of rawLoops) for (const p of lp) whole.push(p);
let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
for (const [x, y] of whole) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
const pad = 0;
x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
const W = x1 - x0, H = y1 - y0;

let total = 0;
const paths = [];
for (const lp of rawLoops) {
  const s = simplifyClosed(lp, eps);
  total += s.length;
  paths.push('M' + s.map(([x, y]) => `${+(x - x0).toFixed(1)} ${+(y - y0).toFixed(1)}`).join('L') + 'Z');
}
/* 大环在前、小环（挖空）在后，便于肉眼看文件 */
paths.sort((a, b) => b.length - a.length);
const d = paths.join('');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${+W.toFixed(1)} ${+H.toFixed(1)}" width="${+W.toFixed(1)}" height="${+H.toFixed(1)}" role="img" aria-label="${name}">` +
  `<path fill="${color}" fill-rule="evenodd" d="${d}"/></svg>\n`;
fs.writeFileSync(`${OUT}/${name}.svg`, svg);
fs.writeFileSync(`${OUT}/${name}.json`, JSON.stringify({
  source: src, size: [w, h], colorType: ctype, channels: chans,
  color, shades, inkPixels, loops: paths.length, points: total, bbox: [x0, y0, W, H], d,
}, null, 1) + '\n');

console.log(`源 ${w}×${h} 颜色类型 ${ctype}(${chans}ch) · 墨迹像素 ${inkPixels}`);
console.log(`原图色彩 ${color}（占墨迹 ${(topN / inkPixels * 100).toFixed(1)}%）`);
console.log(`色阶前四 ${shades}`);
console.log(`轮廓环 ${paths.length} 个 · 简化后 ${total} 点 · 包围盒 ${W.toFixed(1)}×${H.toFixed(1)}`);
console.log(`→ ${name}.svg ${svg.length} B · ${name}.json`);
