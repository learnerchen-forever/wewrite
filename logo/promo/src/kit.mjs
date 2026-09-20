/* 品牌素材「工具箱」—— 宣传画与公众号封面的**唯一共用来源**。
 *
 * 为什么要有这一层：封面上也会出现「2.0」铭牌，而铭牌的形状参数、渐变、描边宽度
 * 都来自拟合结果。如果封面自己再抄一份，宣传画和封面上的铭牌迟早长得不一样
 * （而且是在同一张图 C 里并排出现，差异一眼可见）。
 * 所以 token / 字体 / 素材加载 / 几何小工具 / 铭牌构造全放这里，build.mjs 与 covers.mjs 都 import。
 *
 * ⚠️ 改这里会同时影响海报和封面 —— 改完 `build.mjs` 的 sha256 应该变（除非是纯注释），
 *    如果本意是"只改封面"，那就说明不该动这个文件。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { labelPath, labelBox } from './tools/label.mjs';

export const SRC = path.dirname(fileURLToPath(import.meta.url));   // …/logo/promo/src
export const PROMO = path.resolve(SRC, '..');                      // …/logo/promo（交付目录）
export const LOGO = path.resolve(PROMO, '..');                     // …/logo（定稿的标志）
export const ASSETS = path.join(SRC, 'assets');

/* ---------------- 设计 token（不要在这里写死"某个封面"的尺寸） ---------------- */
export const F_LAT = `"Segoe UI","Microsoft YaHei",system-ui,sans-serif`;
export const F_CJK = `"Microsoft YaHei","HarmonyOS Sans SC",sans-serif`;
export const F_TAG = `"Arial Black","Segoe UI Black","Segoe UI",sans-serif`;
export const INK = '#2E2544';          // 带紫的深墨（不再有纯黑）
export const PURPLE = '#6C31E3';
export const BG = '#FBFAF7';           // 画布底色
export const FRAME_BG = '#F1EAFC';
export const FRAME_BD = '#E3D6F9';
export const ARROW_BD = '#A98AE8';
export const GLOW = 'radial-gradient(1240px 660px at 50% -14%, rgba(108,49,227,.065), rgba(108,49,227,0) 70%)';
/* GLOW 的**比例版**：1240÷2048 = 60.5%、660÷1152 = 57.3%（海报画布 2048×1152）。
 * 为什么需要它：封面画布尺寸各不相同，直接套用绝对值会让同一层光晕在小画布上"糊满"、
 * 在大画布上"缩成一小团"，四个交付物看起来就不是一家。covers.mjs 会用断言
 * 盯住这两者的比例一致，避免哪天改了 GLOW 忘了这里。 */
export const GLOW_REL = 'radial-gradient(60.547% 57.292% at 50% -14%, rgba(108,49,227,.065), rgba(108,49,227,0) 70%)';
export const n = (v) => +v.toFixed(2);

/* ---------------- 素材加载 ---------------- */
export const read = (f) => fs.readFileSync(path.join(LOGO, f), 'utf8');
const readAsset = (f) => fs.readFileSync(path.join(ASSETS, f), 'utf8');
const readBox = (f) => JSON.parse(readAsset(f)).box;

/* id 加前缀：官方文件里有 logo-top-left / clip 这类通用名，内联进页面会互相覆盖 */
export const OBSVG = readAsset('obsidian-gradient.svg')
  .replace(/id="([^"]+)"/g, 'id="obs-$1"').replace(/url\(#([^)]+)\)/g, 'url(#obs-$1)');
export const OBB = readBox('obsidian.box.json');
/* 字标：viewBox 几乎贴合墨迹，但左右各差 ≤1.5px。用实测盒当 viewBox，wm.w 才是**墨迹宽** ——
 * 于是"字标右缘"和那个 26px 的缝都真的落到墨迹上（gapprobe 一度量到 31px 而不是 26px）。 */
export const WMBB = readBox('wewrite-wordmark.box.json');
export const MPSVG = readAsset('wechat-mp.svg');
export const mpColor = JSON.parse(readAsset('wechat-mp.json')).color;
export const MARK = read('wewrite-mark-tight.svg');
export const WORD = read('wewrite-wordmark.svg');
/* 竖排锁定（封面 B 的主体）。墨迹盒同样是**实测**的，别按 viewBox 估。 */
export const LOCKUPV = read('wewrite-lockup-v.svg');
export const LOCKUPVBOX = readBox('wewrite-lockup-v.box.json');

export const vb = (s) => s.match(/viewBox="([^"]+)"/)[1].split(/[\s,]+/).map(Number);

/* ---------------- 几何小工具 ---------------- */
export const grad = (id, stops, dir = 'h') => {
  const d = dir === 'h' ? 'x1="0" y1="0" x2="1" y2="0"' : 'x1="0" y1="0" x2="1" y2="1"';
  return `<linearGradient id="${id}" ${d}>`
    + stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('') + `</linearGradient>`;
};

/** 取一个标志 SVG，按墨迹高 h 铺开；box 覆盖 viewBox；fill 替换 currentColor；defs 注入到 body 前 */
export function art(svg, h, { box, fill, defs } = {}) {
  const b = box || vb(svg);
  const bw = b[2] - b[0], bh = b[3] - b[1];
  const w = (h * bw) / bh;
  let body = svg.slice(svg.indexOf('>') + 1).replace(/<\/svg>\s*$/, '');
  if (fill) body = body.replace(/fill="currentColor"/g, `fill="${fill}"`);
  return {
    w, h,
    html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(b[0])} ${n(b[1])} ${n(bw)} ${n(bh)}" `
      + `preserveAspectRatio="xMidYMid meet" style="display:block;width:${n(w)}px;height:${n(h)}px">`
      + (defs || '') + body + '</svg>',
  };
}

export const abs = (x, y, w, h, cls, style, inner) =>
  `<div class="b${cls ? ' ' + cls : ''}" style="left:${n(x)}px;top:${n(y)}px;width:${n(w)}px;height:${n(h)}px;${style}">${inner}</div>`;

/* ---------------- 「2.0」铭牌 ---------------- */
/** 造一个「2.0」铭牌 SVG。**形状参数不在这里**，全在 tools/label.mjs 的 OGEE（拟合结果）。
 *
 *  prefix 必填且**每个实例唯一**：渐变/裁剪路径的 id 是全局的，同页面里放两个铭牌
 *  （封面 C 就是"海报裁切 + 方形封面"并排，两块都有铭牌）会互相覆盖 → 渐变串色。
 *
 *  三层「外色带 / 白圈 / 本体」是**贴轮廓描边 + 裁到轮廓内**，不是等距内缩：
 *  描边到路径的垂直距离天然处处相等，宽度由构造保证；等距内缩在耳（二次曲线）那里
 *  没有解析解，会把最内一层的耳整个吃光。渐变必须 userSpaceOnUse —— 三层共用同一条路径，
 *  默认的 objectBoundingBox 会按各自描边的盒子铺，接缝一眼可见。 */
export function makeTag(prefix, { inkH, band = 0.037, ring = 0.031, fs = 52, shape = {}, pad = 2 } = {}) {
  const [boxL, , inkW] = labelBox(inkH, shape);
  const boss = -boxL;                      // 耳突出量（墨迹比本体宽出来的那一半）
  const bodyW = inkW - 2 * boss;
  const wBand = band * inkH, wRing = ring * inkH;
  const outline = labelPath(inkH, shape);
  const w = inkW + pad * 2, h = inkH + pad * 2;
  const gradId = `${prefix}Grad`, clipId = `${prefix}Clip`;

  const gradSVG = `<linearGradient id="${gradId}" gradientUnits="userSpaceOnUse" `
    + `x1="${n(-boss)}" y1="0" x2="${n(bodyW + boss)}" y2="${n(inkH)}">`
    + `<stop offset="0" stop-color="#9B6BF8"/><stop offset="1" stop-color="#5B22C9"/></linearGradient>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" `
    + `viewBox="${n(-boss - pad)} ${n(-pad)} ${n(w)} ${n(h)}" `
    + `style="display:block;width:${n(w)}px;height:${n(h)}px">`
    + `<defs>${gradSVG}<clipPath id="${clipId}"><path d="${outline}"/></clipPath></defs>`
    + `<path fill="url(#${gradId})" d="${outline}"/>`
    + `<g clip-path="url(#${clipId})">`
    + `<path fill="none" stroke="#FFFFFF" stroke-width="${n(2 * (wBand + wRing))}" d="${outline}"/>`
    + `<path fill="none" stroke="url(#${gradId})" stroke-width="${n(2 * wBand)}" d="${outline}"/>`
    + `</g>`
    + `<text x="${n(bodyW / 2)}" y="${n(inkH / 2)}" text-anchor="middle" dominant-baseline="central" `
    + `font-family='${F_TAG}' font-weight="900" font-size="${fs}" fill="#FFFFFF">2.0</text>`
    + `</svg>`;

  /* boxW/boxH 是 SVG 外接盒；inkW/inkH 才是**墨迹**。定位一律用墨迹（耳外突 → 墨迹左缘在 −boss）。 */
  return { svg, gradSVG, clipId, gradId, w, h, inkW, inkH, bodyW, boss, outline, band: wBand, ring: wRing };
}
