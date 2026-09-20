/* 方形封面 B 的**构图对照页**：铭牌改挂在笔杆右侧之后，把几种「缝 / 铭牌大小 /
 * 右缘是否对齐字标」并排渲染成同一尺寸，**看着**定稿。
 *
 * 与断言的分工：covers.mjs 的断言只能证明"按公式算对了"（铭牌在笔杆右侧、组接近正方形、
 * 有留白），证明不了"好看"。这个表是给人挑的。
 * ⚠️ 所以：没有一眼看出毛病，就不要动 covers.mjs 里的 B_TAG_SCALE / B_GAP ——
 *    它们是这个表里挑出来的定稿值（第 4 号），不是随手写的默认值。
 *
 * 为什么会有这个表（第六轮的判断）：铭牌原本贴**字标右缘**、与字标竖直居中，那样组是
 * 1.42:1（横长；= 字标右缘 0.9595 + 缝 0.10 + 铭牌宽 0.3640），塞进 1:1 画框后上下留白被
 * 挤没；移到**笔杆右侧**后组 ≈ 0.99:1，方形画框才能给出又大又均匀的留白。
 * ⚠️ 表里**没有**复现"贴字标右缘"那一版 —— bCover 的铭牌左沿恒等于「笔杆右缘 + 缝」，
 *    那一版属于另一套排法（铭牌竖中与字标对齐）；要留就得给 bCover 加一个开关。
 *    第 1/2 号是**另一个轴**：铭牌左沿仍贴笔杆，但右缘与字标右缘对齐（右边成一条齐线，
 *    代价是铭牌被挤矮）。写对照页时别把这两件事混起来说。
 *
 * ⚠️ 铭牌下沿刻意取「标记下沿」（bCover 里的 t1 = lk.mark.bot），不取"与笔杆居中"——
 *    后者会让铭牌掉进笔杆与字标之间的空行带里，看着像掉下去了。
 *
 * 用法：node logo/promo/src/tools/bsheet.mjs
 * 产物落 src/.tmp/bsheet.png，只看不改，不进仓库。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shot, setOut } from '../shot.mjs';
import { BG, GLOW_REL } from '../kit.mjs';
import { lockupProfile, bCover } from './lockup.mjs';
import { decodePNG, sampler } from './png.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = setOut(path.join(HERE, '../.tmp'));

const LK = lockupProfile();
console.log(`锁定实测：墨迹宽 ${LK.width.toFixed(4)} · 笔杆右缘 ${LK.shaft.right.toFixed(4)}`
  + ` · 标记下沿 ${LK.mark.bot.toFixed(4)} · 字标顶 ${LK.word.top.toFixed(4)}`
  + ` · 字标高 ${(LK.word.bot - LK.word.top).toFixed(4)}`);

const CELL = 420, COLS = 3;
/* 图注写在格子**下方**（占格外的独立高度），不要挂在格子内部的下沿 ——
   第一版用 bottom:-32px，正好落进下一排的格子里，压住下一版的笔尖。 */
const CAP_H = 44, ROW_H = CELL + CAP_H;
/* 每格 = 一个 1:1 画框（虚线），内容按 bCover 排。★ = 现在发布的那一版。
   两个轴：① 铭牌多大（沿缝与 tagScale 变）② 右缘是否与字标右缘对齐（edgeFlush）。 */
const VARIANTS = [
  { cap: '1 右缘与字标右缘对齐 · 缝 0.10', o: { edgeFlush: true, gap: 0.10 } },
  { cap: '2 右缘与字标右缘对齐 · 缝 0.06（缝小→铭牌变大）', o: { edgeFlush: true, gap: 0.06 } },
  { cap: '3 笔杆右侧 · 铭牌按海报比例（1.0×）', o: { tagScale: 1.0, gap: 0.10 } },
  { cap: '★ 4 笔杆右侧 · 铭牌 0.90×（发布）', o: { tagScale: 0.90, gap: 0.10 } },
  { cap: '5 笔杆右侧 · 铭牌 0.80×', o: { tagScale: 0.80, gap: 0.10 } },
  { cap: '6 笔杆右侧 · 海报比例 · 缝 0.16', o: { tagScale: 1.0, gap: 0.16 } },
];

const NROW = Math.ceil(VARIANTS.length / COLS);
const COLW = CELL * COLS;
const EXPECT = [];
const rows = [];
for (let r = 0; r < NROW; r++) {
  const cells = VARIANTS.slice(r * COLS, r * COLS + COLS).map(({ cap, o }, j) => {
    const i = r * COLS + j;
    const c = bCover(CELL, `bs${i}`, { profile: LK, ...o });
    console.log(`  ${cap.replace(/^★ /, '* ')}\n      ${c.diag}`);
    EXPECT[i] = { cap, grp: c.grp };
    return `<div class="cell" style="left:${j * CELL}px">${c.html}</div>`
      + `<div class="cap" style="left:${j * CELL}px">${cap}</div>`;
  }).join('');
  rows.push(`<div class="row" style="height:${ROW_H}px">${cells}</div>`);
}

const NOTE_H = 74;
const PAGE_H = NROW * ROW_H + NOTE_H;

fs.writeFileSync(path.join(OUT, 'bsheet.html'),
  `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:${BG};background-image:${GLOW_REL};
  font-family:"Segoe UI","Microsoft YaHei",sans-serif;color:#2E2544}
.row{position:relative;width:${COLW}px}
/* ⚠️ .b 是 kit.mjs 的 abs() 用的绝对定位类。漏掉它，铭牌会退回普通文档流、
   掉到每格左上角 —— 而锁定的 SVG 带内联 position:absolute，于是"笔在中间、铭牌跑左上"，
   看着还像个能看的图，第一次就是这么错的。下面的自检就是为它写的。 */
.b{position:absolute;box-sizing:border-box}
.cell{position:absolute;top:0;width:${CELL}px;height:${CELL}px;
  outline:1px dashed rgba(108,49,227,.35);box-sizing:border-box}
.cap{position:absolute;top:${CELL + 4}px;width:${CELL}px;padding:0 10px;box-sizing:border-box;
  font:600 12px/1.5 "Segoe UI";color:#5b5670;text-align:center}
.note{width:${COLW}px;padding:0 16px;box-sizing:border-box;
  font:400 13px/1.6 "Segoe UI";color:#8a8a93}
</style>
${rows.join('\n')}
<div class="note">虚线 = 1:1 画框本身。竖着看 3 → ★4 → 5：唯一变的是铭牌大小（1.0× / 0.9× / 0.8×），
组的宽高比几乎不动（1.03 / 0.99 / 0.96:1）—— 也就是说"方形画框里有留白"是靠**换位置**
（从字标右缘挪到笔杆右侧）拿到的，不是靠把铭牌缩小。横着看 1 / 2：那是另一个轴，
让铭牌右缘与字标右缘对齐、右边成一条齐线，代价是铭牌被挤矮。</div>`);
shot('bsheet.html', 'bsheet.png', COLW, PAGE_H, 1);

/* ---------------- 自检：页面上排出来的，必须就是 bCover 算出来的 ---------------- */
/* 为什么不靠"看一眼"：CSS 少写一条 `.b{position:absolute}`，铭牌就会退回普通文档流掉到
 * 每格左上角；而锁定的 SVG 是内联 position:absolute，所以画面变成"笔在中间、铭牌跑左上"，
 * 依然像一张能看的图 —— 第一版正是这样静默错了。所以逐格量交付 PNG 的四边留白，
 * 和 bCover 报的 grp 对齐。量测区往内缩 INSET，避开每格边框那条虚线（它本身暗于判据，
 * 不缩的话每格都会量成"满格"）。 */
const img = decodePNG(fs.readFileSync(path.join(OUT, 'bsheet.png')));
const px = sampler(img);
const LUM = 200, INSET = 4, TOL = 2.5;
const lum = (p) => 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];
let fails = 0;
EXPECT.forEach(({ cap, grp }, i) => {
  const x0 = (i % COLS) * CELL, y0 = Math.floor(i / COLS) * ROW_H;
  let minx = 1e9, maxx = -1, miny = 1e9, maxy = -1;
  for (let y = y0 + INSET; y < y0 + CELL - INSET; y++) {
    for (let x = x0 + INSET; x < x0 + CELL - INSET; x++) {
      if (lum(px(x, y)) >= LUM) continue;
      if (x < minx) minx = x; if (x > maxx) maxx = x;
      if (y < miny) miny = y; if (y > maxy) maxy = y;
    }
  }
  const m = {
    l: minx - x0, r: x0 + CELL - 1 - maxx,
    t: miny - y0, b: y0 + CELL - 1 - maxy,
  };
  const off = ['l', 'r', 't', 'b'].filter((k) => Math.abs(m[k] - grp[k]) > TOL);
  const tag = off.length ? `CHECK 偏 ${off.map((k) => k + Math.abs(m[k] - grp[k]).toFixed(1)).join('/')}` : 'ok';
  if (off.length) fails++;
  console.log(`  ${tag}  ${cap.replace(/^★ /, '* ')}`
    + `  — 量 上${m.t} 下${m.b} 左${m.l} 右${m.r}`
    + ` vs 算 上${grp.t.toFixed(1)} 下${grp.b.toFixed(1)} 左${grp.l.toFixed(1)} 右${grp.r.toFixed(1)}`);
});
console.log(fails
  ? `\n结果：自检 ${fails} 格对不上 —— 页面没把 bCover 的排法渲染出来，上面那行数就是线索`
  : `\n结果：${EXPECT.length} 格自检全部通过（页面上量到的留白 == bCover 算的留白）`);
if (fails) process.exitCode = 1;

console.log(`\n参考：${VARIANTS.length} 个方案（每格 1:1 画框 ${CELL}px，★ = 发布版）`
  + ` → src/.tmp/bsheet.png  ${COLW}×${PAGE_H}`);
