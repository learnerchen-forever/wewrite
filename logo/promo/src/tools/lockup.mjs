/* 量竖排锁定（logo/wewrite-lockup-v.svg）的结构标位，并按它排「方形封面 B」的构图。
 *
 * 为什么需要它：封面 B 要把「2.0」铭牌挂到**笔杆右侧**，于是必须知道
 *   ① 标记（笔尖）到哪一行结束 —— 铭牌的下沿基准；
 *   ② 笔杆（中轴那段竖直的窄块）的 x 范围 —— 铭牌的左沿基准；
 *   ③ 折翼在最下缘延伸到哪 —— 决定铭牌不能太高，否则会压到翼；
 *   ④ 字标从哪一行开始 —— 铭牌不能掉进它与标记之间的缝里。
 *
 * 为什么量而不写死常量：标志哪天一改，写死的数会让铭牌**静默**压到折翼上，
 * 而画出来"看着还挺正常"。与 contentbox.mjs 同一个道理。
 *
 * 口径：一律**以墨迹高为 1** 归一，原点在墨迹左上 —— 与 arcfit / tagsil 一致
 * （混用本体高会出现"表里写 0.106、量出 0.096"这种查半天的鬼）。
 * 读的是**渲染出来的像素**（透明底 + alpha 判据），不是把 viewBox 当尺寸推。
 *
 * ⚠️ 渲染用的 viewBox 在素材**真 viewBox 之外**再外扩 PAD_U —— 见 lockupProfile 里那段注释：
 * 按真 viewBox 渲染的话，"图形比 viewBox 宽"这件事会被视口切掉、量不出来（这个素材就栽过）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shot, setOut, getOut } from '../shot.mjs';
import { LOCKUPV, makeTag, grad, abs, n } from '../kit.mjs';
import { decodePNG, sampler } from './png.mjs';

const ALPHA = 40;         // 透明底上"有墨迹" = alpha 明显不为 0
const PX_PER_UNIT = 8;    // 渲染分辨率（px / viewBox 单位）—— 与原先 900px 宽时的 7.9 相当
const PAD_U = 8;          // 渲染用的 viewBox 在真 viewBox 之外再扩这么多单位（四边）

export function lockupProfile({ outDir } = {}) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dir = outDir || path.join(here, '..', '.tmp');
  const vb = LOCKUPV.match(/viewBox="([^"]+)"/)[1].split(/[\s,]+/).map(Number);
  /* 为什么按**外扩后的 viewBox** 渲染：直接按真 viewBox 渲染的话，比 viewBox 宽的图形会在
     视口处被切掉，切完量出来"刚好填满" —— 被切这件事就永远看不见，而画出来"看着还挺正常"。
     外扩之后越界部分还能画出来，于是"图形有没有越过它自己的 viewBox"变成一个**可断言的事实**
     （见下面的越界断言）。交付的 logo/wewrite-lockup-v.svg 就在这上面栽过：viewBox 比图形
     窄 1.17 单位，字标末尾的 e 被切掉 ~8px，肉眼看只是"e 的右缘有点平"。 */
  const box = [vb[0] - PAD_U, vb[1] - PAD_U, (vb[2] - vb[0]) + 2 * PAD_U, (vb[3] - vb[1]) + 2 * PAD_U];
  const W = Math.round(box[2] * PX_PER_UNIT);
  const H = Math.round(box[3] * PX_PER_UNIT);
  /* OUT 是 shot.mjs 的模块级状态：任何临时切目录的量测都必须"存 → 切 → 切回"，
     否则主流程后续的 shot() 会被写到别的目录去。 */
  const prev = getOut();
  let png;
  setOut(dir);
  try {
    /* 先削掉自带的 width/height 再注入 style：属性重复时 HTML 取**第一个**，
       不削的话量的是原文件那个框（v3 与 v6 都栽过这个坑）。viewBox 换成外扩的那版。 */
    const svg = LOCKUPV.replace(/\s(?:width|height)="[^"]*"/g, '')
      .replace(/viewBox="[^"]*"/, `viewBox="${box.join(' ')}"`)
      .replace('<svg', `<svg style="display:block;width:${W}px;height:${H}px"`);
    fs.writeFileSync(path.join(dir, 'lockup-profile.html'),
      `<!doctype html><meta charset="utf-8">`
      + `<style>html,body{margin:0;padding:0;background:transparent}</style>${svg}`);
    shot('lockup-profile.html', 'lockup-profile.png', W, H, 1, { transparent: true });
    png = fs.readFileSync(path.join(dir, 'lockup-profile.png'));
  } finally {
    setOut(prev);
  }

  const img = decodePNG(png);
  const px = sampler(img);
  const raw = [];
  for (let y = 0; y < img.h; y++) {
    const runs = [];
    let s = -1;
    for (let x = 0; x <= img.w; x++) {
      const on = x < img.w && px(x, y)[3] > ALPHA;
      if (on && s < 0) s = x;
      if (!on && s >= 0) { runs.push([s, x - 1]); s = -1; }
    }
    raw.push(runs);
  }

  const first = raw.findIndex((r) => r.length);
  const last = raw.length - 1 - [...raw].reverse().findIndex((r) => r.length);
  if (first < 0) throw new Error('lockup 渲染出来没有墨迹 —— 透明底或素材路径出问题了');
  const inkRows = raw.filter((r) => r.length);
  const ax0 = Math.min(...inkRows.map((r) => r[0][0]));
  const ax1 = Math.max(...inkRows.map((r) => r[r.length - 1][1]));
  const unit = last - first + 1;                    // 墨迹高 = 1（单位）
  const ny = (y) => (y - first) / unit;
  const nx = (x) => (x - ax0) / unit;

  /* ---- 像素 → viewBox 单位：外扩框映射（W/H 取整会带零点几像素的 letterbox，一并算掉） ---- */
  const sc = Math.min(W / box[2], H / box[3]);       // px / 单位
  const offX = (W - box[2] * sc) / 2, offY = (H - box[3] * sc) / 2;
  const vx = (x) => box[0] + (x - offX) / sc;
  const vy = (y) => box[1] + (y - offY) / sc;
  const ink = { x0: vx(ax0), y0: vy(first), x1: vx(ax1 + 1), y1: vy(last + 1) };

  /* ---- 越界断言 ----
     容差 0.15 单位（8px/单位下约 1.2px）：抗锯齿会把墨迹边缘放大半个像素，别把它当越界；
     真出事时越界量是 1 个单位量级 —— 差一个数量级，分得开。 */
  const TOL = 0.15;
  const over = [];
  if (ink.x1 > vb[2] + TOL) over.push(`右 ${(ink.x1 - vb[2]).toFixed(3)}`);
  if (ink.y1 > vb[3] + TOL) over.push(`下 ${(ink.y1 - vb[3]).toFixed(3)}`);
  if (ink.x0 < vb[0] - TOL) over.push(`左 ${(vb[0] - ink.x0).toFixed(3)}`);
  if (ink.y0 < vb[1] - TOL) over.push(`上 ${(vb[1] - ink.y0).toFixed(3)}`);
  if (over.length) {
    throw new Error(`lockup 的图形越过了它自己的 viewBox（${over.join('、')} 单位）：`
      + ' 这份 SVG 一旦被当成文件用（<img> / background-image / 默认 overflow 的 <svg>），'
      + ' 越界部分会在**视口**处被切掉，而切完画出来"看着还挺正常"。'
      + ' 修法是加宽 viewBox（改 logo/wewrite-lockup-v.svg 一处，sizes/ 与 index.html 跟着派生），'
      + ' 不是把图形缩小。');
  }

  /* 逐行归一化墨迹段（找笔杆要用 n === 1 的"单段行"）。索引仍是绝对行号。 */
  const rows = raw.map((r) => (r.length
    ? { y: 0, x0: nx(r[0][0]), x1: nx(r[r.length - 1][1]), n: r.length }
    : null));
  for (let y = first; y <= last; y++) if (rows[y]) rows[y].y = ny(y);

  /* 标记 / 字标 的分界 = 中间那段空行带（锁定是"上标记、下字标"两段结构） */
  const blank = [];
  for (let y = first; y <= last; y++) if (!raw[y].length) blank.push(y);
  if (!blank.length) throw new Error('lockup 里找不到标记与字标之间的空行带 —— 结构变了？');
  const gapTop = blank[0], gapBot = blank[blank.length - 1];
  const markBot = ny(gapTop - 1), wordTop = ny(gapBot + 1);

  /* 笔杆 = 标记内**最长的一段连续"单段行"**。
     为什么不用"从最下缘往上走"：笔杆底部是收口的（x 从 0.391..0.567 收到 0.465..0.493），
     那样走一步就断，只量到最后一行 —— 第一次实现就是这么错的。
     折翼并拢之后到字标之前，整块只剩一段，所以"最长连续单段"正好圈住它。 */
  let best = { len: 0, a: first, b: first };
  let runStart = -1;
  for (let y = first; y <= gapTop; y++) {
    const single = y < gapTop && rows[y] && rows[y].n === 1;
    if (single && runStart < 0) runStart = y;
    if (!single && runStart >= 0) {
      if (y - runStart > best.len) best = { len: y - runStart, a: runStart, b: y - 1 };
      runStart = -1;
    }
  }
  const shaftRows = rows.slice(best.a, best.b + 1);
  const shaft = {
    top: ny(best.a), bot: ny(best.b),
    left: Math.min(...shaftRows.map((r) => r.x0)),
    right: Math.max(...shaftRows.map((r) => r.x1)),
  };

  const inBand = (y0, y1) => rows.filter((r) => r && r.y >= y0 && r.y <= y1);
  const rightBetween = (y0, y1) => Math.max(...inBand(y0, y1).map((r) => r.x1));
  const leftBetween = (y0, y1) => Math.min(...inBand(y0, y1).map((r) => r.x0));

  return {
    vb,                                              // 素材自己的 viewBox（元素要按它摆）
    ink,                                             // 墨迹在 viewBox 坐标里的位置
    scale: sc,                                       // 本次渲染的 px / 单位（诊断用）
    width: nx(ax1 + 1),                              // 墨迹宽（= 宽高比）
    mark: { top: 0, bot: markBot },
    word: { top: wordTop, bot: ny(last) },
    gap: [markBot, wordTop],
    shaft,
    rows,
    rightBetween,
    leftBetween,
    canvas: [img.w, img.h],
  };
}

/* ---------------- 方形封面 B 的构图：铭牌挂在**笔杆右侧** ---------------- */
/* 用户第六轮的判断：贴字标右侧时组是 1.42:1（横长），1:1 画框里上下就被挤没了；
 * 移到笔杆右侧后组 ≈ 0.96~1.03:1 —— 方形画框能给出又大又均匀的留白。
 *
 * TAG_ASPECT 是铭牌墨迹宽高比（由 OGEE 推出，与海报断言里同一个数）；
 * TAG_RATIO 是海报里「铭牌墨高 / 字标墨高」—— 必须与海报一致，
 * 否则两张图上的铭牌大小感受会不一样。 */
export const TAG_ASPECT = 1.4183;
export const TAG_RATIO = 178 / 142;

/** 在 size×size 的盒子里排「竖排锁定 + 笔杆右侧的 2.0 铭牌」。
 *  html 是**绝对定位**的内容（不含背景），交给页面拼装那层去配背景。
 *
 *  edgeFlush=true：铭牌右缘与字标右缘对齐（宽度被「笔杆右缘+缝」与「字标右缘」两侧夹定，
 *  于是组恰好等于锁定盒、方形画框里的内容最大）。false：按海报的铭牌比例定尺寸，
 *  组会比锁定盒略宽。两种取舍见 tools/bsheet.mjs 的对照图。 */
export function bCover(size, prefix, { profile, pad = 0.075, gap = 0.10, tagScale = 1, edgeFlush = false } = {}) {
  const lk = profile;
  const wmH = lk.word.bot - lk.word.top;
  let tagW = TAG_RATIO * wmH * tagScale * TAG_ASPECT;
  const tx = lk.shaft.right + gap;                  // 铭牌墨迹左缘（贴着笔杆）
  if (edgeFlush) tagW = lk.width - tx;              // 右缘与字标右缘对齐
  const tagH = tagW / TAG_ASPECT;
  const t1 = lk.mark.bot;                           // 下沿 = 标记下沿（再往下就掉进缝里）
  const t0 = t1 - tagH;
  const gw = Math.max(lk.width, tx + tagW), gh = 1; // 组 = 锁定 ∪ 铭牌；锁定恒为 [0,width]×[0,1]
  const usable = size * (1 - 2 * pad);
  const s = Math.min(usable / gw, usable / gh);
  const ox = (size - gw * s) / 2, oy = (size - gh * s) / 2;

  /* 元素框按**它自己的 viewBox** 摆，不按墨迹框摆：墨迹在 viewBox 里并不正好铺满
     （右/下留了余量），若把元素宽写成 lk.width*s，浏览器会按 preserveAspectRatio="meet"
     再缩一次 —— 公式算的都对、画出来小 0.3%，而且"量出来的留白"与"算出来的"对不上。
     k = px / viewBox 单位，墨迹左上角对准 (ox, oy)。 */
  const k = s / (lk.ink.y1 - lk.ink.y0);
  const el = {
    x: ox - (lk.ink.x0 - lk.vb[0]) * k,
    y: oy - (lk.ink.y0 - lk.vb[1]) * k,
    w: (lk.vb[2] - lk.vb[0]) * k,
    h: (lk.vb[3] - lk.vb[1]) * k,
  };

  const tagPad = tagH * s * (2 / 178);
  const tag = makeTag(prefix, {
    inkH: tagH * s, band: 0.037, ring: 0.031, fs: tagH * s * (52 / 178), pad: tagPad,
  });
  const tagInkX = ox + tx * s, tagInkY = oy + t0 * s;

  const body = LOCKUPV.slice(LOCKUPV.indexOf('>') + 1).replace(/<\/svg>\s*$/, '')
    .replace(/fill="currentColor"/g, `fill="url(#${prefix}Lk)"`);
  const html = `<svg xmlns="http://www.w3.org/2000/svg" `
    + `viewBox="${lk.vb.join(' ')}" preserveAspectRatio="xMidYMid meet" `
    + `style="position:absolute;left:${n(el.x)}px;top:${n(el.y)}px;`
    + `width:${n(el.w)}px;height:${n(el.h)}px">`
    + grad(`${prefix}Lk`, [[0, '#9B6BF8'], [1, '#5B22C9']]) + body + '</svg>'
    + abs(tagInkX - tagPad, tagInkY - tagPad, tag.w, tag.h, '', '', tag.svg);

  /* 铭牌与标记的**实际**净空：取铭牌所跨那几行里标记最右的墨迹去比 ——
     铭牌上沿那一段折翼还没收回去，只看笔杆会误判成"离得很远"。 */
  const markRight = lk.rightBetween(t0, t1);
  const grp = { l: ox, r: size - (ox + gw * s), t: oy, b: size - (oy + gh * s) };
  return {
    html, s, gw, gh, grp, el,
    lockup: { x: ox, y: oy, w: lk.width * s, h: s },
    tag: { x: tagInkX, y: tagInkY, w: tagW * s, h: tagH * s, boxW: tag.w, boxH: tag.h, pad: tagPad },
    markRight, clearance: tx - markRight,
    diag: `锁定 ${n(lk.width * s)}×${n(s)} · 铭牌 ${n(tagW * s)}×${n(tagH * s)}`
      + ` · 组 ${n(gw * s)}×${n(gh * s)}（${n(gw / gh)}:1）`
      + ` · 四边留白 上${n(grp.t)} 下${n(grp.b)} 左${n(grp.l)} 右${n(grp.r)}`
      + ` · 铭牌↔标记净空 ${n((tx - markRight) * s)}px`,
  };
}
