/* 量一段文字的**真实墨迹盒**（CSS px）与它的墨迹中心相对「容器中心」的偏移。
 *
 * 为什么不直接用字面宽度：把文字"居中"在某个形状里时，眼睛对的是**墨迹**的中心。
 *   · SVG 的 text-anchor="middle" 按**前进宽度**居中 —— 拉丁字的侧承带（"1"、"("）
 *     会让墨迹明显偏；
 *   · 中文在 em 框里左右各留一点白，整串就比 3em 窄；
 *   · 换成手写体后 em 宽度与实际笔画宽度差得更远。
 * 所以凡是「文字要与某个几何体精确对齐」的地方，都用这里量出来的墨迹盒定位。
 *
 * 做法：把文字 flex 居中放进一个透明底的固定尺寸画布里 → 无头 Chrome 截图 →
 * 解码 PNG 取 alpha>16 的包围盒 → 除以 device scale 得到 CSS px。
 *
 * 用法（独立跑）：node textink.mjs "发布到" "FZShuTi" 42 400
 * 用法（被调用）：import { measureText } from './tools/textink.mjs'
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { decodePNG, sampler } from './png.mjs';
import { shot, setOut, getOut } from '../shot.mjs';

const B = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.resolve(B, '../.tmp/textink');

const BW = 900, BH = 360, DSF = 2;   // 画布与倍率：2× 才能把亚像素对齐量准

/**
 * @returns {{w:number,h:number,dx:number,dy:number}} ink 尺寸（CSS px）与
 *          墨迹中心相对容器中心的偏移。要在把墨迹中心放到 (X,Y) 时，
 *          就把容器中心放在 (X-dx, Y-dy)。
 */
export function measureText({ text, family, size, weight = 400, cache = true }) {
  const key = `${text}|${family}|${size}|${weight}`;
  /* 用哈希，不要 hex(key).slice(0,n) —— 截断会把 key 尾巴上的**字号**切掉，
   * 于是同字体不同字号撞进同一个缓存，量出来的数字看着正常却是错的。 */
  const cacheFile = path.join(CACHE, crypto.createHash('sha1').update(key).digest('hex').slice(0, 16) + '.json');
  if (cache && fs.existsSync(cacheFile)) return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));

  const prev = getOut();                       // 切目录前先存，用完切回（OUT 是模块级状态）
  setOut(CACHE);
  const html = `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:transparent}
.box{width:${BW}px;height:${BH}px;display:flex;align-items:center;justify-content:center}
</style><div class="box"><span style="font-family:'${family}';font-weight:${weight};`
    + `font-size:${size}px;color:#000;white-space:pre;line-height:1">${text}</span></div>`;
  fs.writeFileSync(path.join(CACHE, 'textink.html'), html);
  shot('textink.html', 'textink.png', BW, BH, DSF, { transparent: true });

  const img = decodePNG(fs.readFileSync(path.join(CACHE, 'textink.png')));
  const px = sampler(img);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, hit = 0;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    if (px(x, y)[3] > 16) {
      hit++;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  setOut(prev);
  if (!hit) throw new Error(`量不到墨迹：「${text}」在 '${family}' 下没有任何非透明像素`);

  /* 阈值 16 会把 1px 抗锯齿边缘算进来，各边各让 0.5 设备像素回去 */
  const g = (v) => (v + 0.5) / DSF;
  const r = {
    w: +((g(x1) - g(x0))).toFixed(2),
    h: +((g(y1) - g(y0))).toFixed(2),
    dx: +(((g(x0) + g(x1)) / 2 - BW / 2)).toFixed(2),
    dy: +(((g(y0) + g(y1)) / 2 - BH / 2)).toFixed(2),
  };
  fs.writeFileSync(cacheFile, JSON.stringify(r) + '\n');
  return r;
}

/**
 * 字体是否**真的**存在（而不是被浏览器静默回退）。
 *
 * 为什么不问 `document.fonts.check()`：本机对所有字体名恒返回 true —— 包括根本不存在的，
 * 所以它是"永远绿"的断言，比没有更糟。这里改成可证伪的做法：
 * 同一串字分别用「待测字体名」和「必定不存在的字体名」渲染，
 * 字体缺失时两者都落到同一个兜底字体，墨迹盒**必然完全相同**。
 */
export function fontAvailable(family, probe = '发布到 WeWrite 2.0 微信公众号 Obsidian', size = 40) {
  const a = measureText({ text: probe, family, size });
  const b = measureText({ text: probe, family: 'NoSuchFont__0xA3F1', size });
  return !(Math.abs(a.w - b.w) < 0.05 && Math.abs(a.h - b.h) < 0.05);
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const [text, family, size, weight] = process.argv.slice(2);
  const r = measureText({ text, family, size: +size, weight: +(weight || 400) });
  console.log(`「${text}」 ${family} ${size}px/${weight || 400}  →  墨迹 ${r.w}×${r.h}px  `
    + `中心偏移 (${r.dx}, ${r.dy})`);
}
