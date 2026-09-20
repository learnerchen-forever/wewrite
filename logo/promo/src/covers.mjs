/* WeWrite 公众号封面（A/B/C）+ README 页首横幅 · 生成器
 *
 * 跑法：先 `node logo/promo/src/build.mjs`（出海报），再 `node logo/promo/src/covers.mjs`。
 *
 * 产出（logo/promo/）：
 *   wewrite-cover-main-2.35x1-{900x383,1800x766}.png      A 主封面（公众号 2.35:1）
 *   wewrite-cover-square-1x1-{900x900,1800x1800}.png      B 方形小图（1:1）
 *   wewrite-cover-wide-3.35x1-{1283x383,2566x766}.png     C 宽幅（A|B 并排，3.35:1）
 * 产出（仓库根 assets/）：
 *   readme-banner.png                                     README 页首横幅
 *
 * ── 为什么这几张不是"生成"的，而是"算"出来的 ──
 * 素材全是已有的矢量（海报母版 + logo/wewrite-lockup-v.svg + 铭牌几何），没有任何
 * AI 生成过程：A 是海报内容带的裁切、B 是矢量排版、C 是 A 和 B 的并排。
 * 这样才可复现、可断言，也才能与海报共用同一套 token（见 kit.mjs）。
 *
 * ── 留白：内容带恰好就是 2.35:1，所以 A 的上下白只能靠"等比缩小内容"换 ──
 * 海报内容带实测 y 107..977（tools/contentbox.mjs，thr 14~30 稳定），2048 ÷ 871 = 2.3513 ——
 * 与 2.35:1 的画框**同形**。同形就意味着没有富余：想留上下白，只能把内容缩到画框的
 * (1 - 2·PAD)。缩多少就同时得到多少上下与左右的空（PAD 是看着定的值，只写在这一处）。
 * 代价是内容不再铺满画框 → 海报自带的那层背景盖不满，所以交付图统一改用**画布自己的背景**
 * （整张画布一层光晕），否则四周会露出一圈底色差、C 的接缝上还会有两层光晕的台阶。
 *
 * ── B：铭牌挂在**笔杆右侧**（用户第六轮） ──
 * 贴字标右侧时组是 1.42:1（横长），1:1 画框里上下就被挤掉了；挂到笔杆右侧后组 ≈ 1:1，
 * 方形画框才能给出又大又均匀的留白。笔杆 / 折翼的位置是**量**出来的（tools/lockup.mjs），
 * 不写死常量 —— 标志一改，写死的数会让铭牌静默压到折翼上。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shot, setOut } from './shot.mjs';
import { contentBox } from './tools/contentbox.mjs';
import { lockupProfile, bCover, TAG_RATIO } from './tools/lockup.mjs';
import { LOGO, PROMO, BG, GLOW, GLOW_REL, LOCKUPVBOX, n } from './kit.mjs';

const SRC = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(LOGO, '..');
const OUT = setOut(path.join(SRC, '.tmp'));

/* WeChat 主封面规格 */
const A_W = 900, A_H = 383;
/* C 的高度取 A 的高，宽度 = A + 方形的边长（= A 的高）→ 恰好 3.35:1 */
const C_W = A_W + A_H, C_H = A_H;
const B_W = 900, B_H = 900;                 // B 的设计尺寸（矢量，可任意缩放）
const BANNER_W = 1600;                      // README 横幅宽度（高度由内容带 + 留白推出）

const PAD = 0.07;                           // A / 横幅：内容占画框的 (1-2·PAD)
const B_PAD = 0.075;                        // B：四周留白（占边长）
const B_GAP = 0.10;                         // 笔杆右缘 → 铭牌墨迹左缘（单位：锁定墨迹高）
const B_TAG_SCALE = 0.90;                   // 铭牌相对海报比例的大小（对照页 .tmp/bsheet.mjs 定的）

/* ---------------- 读取海报母版 ---------------- */
const POSTER_FILE = path.join(PROMO, 'wewrite-2.0-poster.html');
if (!fs.existsSync(POSTER_FILE)) {
  throw new Error(`找不到 ${path.relative(REPO, POSTER_FILE)} —— 先跑 build.mjs 出海报`);
}
const posterHtml = fs.readFileSync(POSTER_FILE, 'utf8');
const styleM = posterHtml.match(/<style>([\s\S]*?)<\/style>/);
const markM = posterHtml.match(/<div id="poster">[\s\S]*<\/div>\s*$/);
if (!styleM || !markM) throw new Error('海报母版结构变了 —— 抽不出 <style> / #poster（covers 依赖它）');
const POSTER_STYLE = styleM[1];
const POSTER_MARKUP = markM[0];

let fail = 0, pass = 0;
const ok = (label, cond, detail = '') => {
  if (cond) pass++; else fail++;
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
};
const near = (a, b, eps = 0.5) => Math.abs(a - b) <= eps;

console.log('从海报母版取源');
ok('海报画布声明为 2048×1152（A 的裁切基准）',
  POSTER_STYLE.includes('width:2048px;height:1152px'), 'width:2048px;height:1152px');
ok('抽到了 #poster 标记（A/C 都要把海报嵌进来）', POSTER_MARKUP.startsWith('<div id="poster">'));

/* ---------------- 量的两件事：海报内容带、竖排锁定的结构 ---------------- */
const POSTER_PNG = path.join(PROMO, 'wewrite-2.0-poster-2048x1152.png');
const box = contentBox(POSTER_PNG, { bg: BG.replace('#', ''), thr: 20 });
const bandH = box.y1 - box.y0 + 1;
console.log(`\n海报内容带（实测，thr 20）：x ${box.x0}..${box.x1}  y ${box.y0}..${box.y1}`
  + `  →  ${box.w}×${bandH}`);
ok('内容带左右确实顶到海报的边距（不是贴着画布边）', box.x0 > 0 && box.x1 < box.canvas[0],
  `x ${box.x0}..${box.x1}（画布 0..${box.canvas[0] - 1}）`);
/* 封面用的 GLOW_REL 是按海报画布折算的比例版 —— 这里量住两者的换算关系，
   免得哪天改了 GLOW 却忘了 GLOW_REL，四个交付物的背景就不成一家了。 */
{
  const abs = GLOW.match(/radial-gradient\(([\d.]+)px ([\d.]+)px/);
  const rel = GLOW_REL.match(/radial-gradient\(([\d.]+)% ([\d.]+)%/);
  ok('封面的光晕 = 海报光晕按画布比例折算（改 GLOW 要同步改 GLOW_REL）',
    !!abs && !!rel
    && near(+rel[1], (+abs[1] / box.canvas[0]) * 100, 0.05)
    && near(+rel[2], (+abs[2] / box.canvas[1]) * 100, 0.05),
    abs && rel ? `海报 ${abs[1]}×${abs[2]}px ÷ ${box.canvas.join('×')} = ${n((+abs[1] / box.canvas[0]) * 100)}%×${n((+abs[2] / box.canvas[1]) * 100)}%（封面写的 ${rel[1]}%×${rel[2]}%）` : '解析失败');
}

const LK = lockupProfile({ outDir: OUT });
console.log(`竖排锁定（实测）：宽 ${n(LK.width)} · 标记到 y ${n(LK.mark.bot)}`
  + ` · 笔杆 x ${n(LK.shaft.left)}..${n(LK.shaft.right)} y ${n(LK.shaft.top)}..${n(LK.shaft.bot)}`
  + ` · 字标 y ${n(LK.word.top)}..${n(LK.word.bot)}`);
/* 比的是**盒 json 里记的宽高比**（一开始这里写的是个常量 0.9589，而那个值恰好是
   "被切掉之后"的宽高比 —— 常量与素材一起错、断言还照样绿。现在它是真的在读盒 json）。 */
ok('lockup 实测墨迹宽高比 ≈ 素材盒（盒 json 没过期）',
  near(LK.width, (LOCKUPVBOX[2] - LOCKUPVBOX[0]) / (LOCKUPVBOX[3] - LOCKUPVBOX[1]), 0.002),
  `${n(LK.width)} vs 盒 ${n((LOCKUPVBOX[2] - LOCKUPVBOX[0]) / (LOCKUPVBOX[3] - LOCKUPVBOX[1]))}`);
ok('标记与字标之间确实有缝（铭牌不能掉进去）', LK.word.top - LK.mark.bot > 0.02,
  `缝 ${n(LK.word.top - LK.mark.bot)}`);

/* ---------------- A / 横幅：留白 = 内容等比缩小到画框的 (1-2·PAD) ---------------- */
const aAspect = box.canvas[0] / bandH;
ok('内容带本身就是 ~2.35:1（所以 2.35 是对的比例，不是硬凑的）', near(aAspect, 2.35, 0.02),
  `${n(aAspect)}`);

const A_SCALE = (A_H * (1 - 2 * PAD)) / bandH;
const A_OFF_X = (A_W - box.canvas[0] * A_SCALE) / 2;
const A_OFF_Y = (A_H - bandH * A_SCALE) / 2 - box.y0 * A_SCALE;
ok('A：内容带完整落在画框内（左右不切内容）', box.canvas[0] * A_SCALE <= A_W + 0.6,
  `带宽 ${n(box.canvas[0] * A_SCALE)} vs 画框 ${A_W}`);
ok('A：上下留白 == 画框高的 PAD（缩出来的空是均匀的）',
  near(A_OFF_Y + box.y0 * A_SCALE, A_H * PAD, 0.6),
  `上 ${n(A_OFF_Y + box.y0 * A_SCALE)} vs ${n(A_H * PAD)}`);
ok('C 的宽高比 == 3.35（A 的 2.35 + 方形 1）', near(C_W / C_H, 3.35, 0.01), `${n(C_W / C_H)}`);

/* 横幅：宽度定死，高度由"内容带占 (1-2·PAD)"反推，再把内容带竖直居中 */
const BANNER_SCALE = BANNER_W / box.canvas[0];
const BANNER_H = Math.round((bandH * BANNER_SCALE) / (1 - 2 * PAD));
const BANNER_OFF_Y = (BANNER_H - bandH * BANNER_SCALE) / 2 - box.y0 * BANNER_SCALE;
ok('横幅：上下各留 PAD 的空白（元素不再顶到上下沿）',
  near(BANNER_OFF_Y + box.y0 * BANNER_SCALE, BANNER_H * PAD, 0.6),
  `上 ${n(BANNER_OFF_Y + box.y0 * BANNER_SCALE)} vs ${n(BANNER_H * PAD)}（画布高 ${BANNER_H}）`);

/* ---------------- B：铭牌挂在笔杆右侧 ---------------- */
const bOpts = { profile: LK, pad: B_PAD, gap: B_GAP, tagScale: B_TAG_SCALE };
const b900 = bCover(B_W, 'bg', bOpts);
console.log(`\nB（1:1，设计尺寸 ${B_W}）：\n  ${b900.diag}`);
ok('B：铭牌挂在**笔杆右侧**（左缘 = 笔杆右缘 + 缝，不是挂在字标右侧）',
  near(b900.tag.x, b900.lockup.x + (LK.shaft.right + B_GAP) * b900.s, 0.6)
  && b900.tag.x > b900.lockup.x + LK.shaft.right * b900.s,
  `铭牌左缘 ${n(b900.tag.x)} vs 笔杆右缘 ${n(b900.lockup.x + LK.shaft.right * b900.s)}`
  + `（缝 ${n(B_GAP * b900.s)}px）`);
ok('B：铭牌不与标记重叠（按铭牌所跨行里标记最右的墨迹算净空）', b900.clearance > 0.03,
  `净空 ${n(b900.clearance * b900.s)}px（归一口径 ${n(b900.clearance)}）`);
ok('B：铭牌不压到字标（下沿停在标记下沿）',
  LK.mark.bot <= LK.word.top && b900.tag.y + b900.tag.h <= b900.lockup.y + LK.word.top * b900.s + 0.6,
  `铭牌底 ${n(b900.tag.y + b900.tag.h)} vs 字标顶 ${n(b900.lockup.y + LK.word.top * b900.s)}`);
ok('B：元素占用的外包盒接近正方形（±4%）', Math.abs(b900.gw / b900.gh - 1) < 0.04,
  `${n(b900.gw / b900.gh)}:1`);
ok('B：构图水平居中（组左右留白相等）', near(b900.grp.l, b900.grp.r), `${n(b900.grp.l)} / ${n(b900.grp.r)}`);
ok('B：构图垂直居中（组上下留白相等）', near(b900.grp.t, b900.grp.b), `${n(b900.grp.t)} / ${n(b900.grp.b)}`);
ok('B：四周都留了空隙（最小边 >= 边长的 6%）', Math.min(b900.grp.l, b900.grp.t) >= B_W * 0.06,
  `最小 ${n(Math.min(b900.grp.l, b900.grp.t))} vs ${n(B_W * 0.06)}`);
ok('B：铭牌与字标同源比例（铭牌墨高 = 海报比例 × 字标墨高 × B_TAG_SCALE）',
  near(b900.tag.h / b900.s, TAG_RATIO * (LK.word.bot - LK.word.top) * B_TAG_SCALE, 0.002),
  `${n(b900.tag.h / b900.s)} vs ${n(TAG_RATIO * (LK.word.bot - LK.word.top) * B_TAG_SCALE)}`);

/* ---------------- README 的页首引用 ---------------- */
/* 横幅是 covers.mjs 产出的，但引用它的是仓库根的 README。两边一旦不同步
 * （改了产物名 / 手滑删了声明），页面上就是一张裂图或一句该在却不在的话 ——
 * 所以这里跨文件断言一下。声明那条尤其要盯：它是 Obsidian 官方支持明确要求加的。 */
console.log('\nREADME 页首');
const BANNER_REL = 'assets/readme-banner.png';
for (const f of ['README.md', 'README_zh.md']) {
  const p = path.join(REPO, f);
  const txt = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  const head = txt.split(/\r?\n/)[0];
  ok(`${f} 存在且引用了 ${BANNER_REL}`, txt.includes(BANNER_REL));
  ok(`${f} 首行是语言互链（没被横幅挤掉）`, /README(_zh)?\.md/.test(head), head.slice(0, 46));
  ok(`${f} 带非官方关联声明`, /not affiliated|无隶属/.test(txt), 'Obsidian 官方支持对文档用 logo 的要求');
}

/* ---------------- 页面拼装 ---------------- */
/** 把海报按 scale 缩放、平移到 (offX, offY)，塞进 w×h 的窗口里裁切。
 *  一律关掉 #poster 自带的背景（见 page()）：交付图 = 一层画布光晕 + 海报内容。 */
const posterHost = (w, h, scale, offX, offY) =>
  `<div style="position:absolute;left:0;top:0;width:${w}px;height:${h}px;overflow:hidden">`
  + `<div style="position:absolute;left:0;top:0;transform:translate(${n(offX)}px,${n(offY)}px) scale(${scale});`
  + `transform-origin:0 0">${POSTER_MARKUP}</div></div>`;

/* #poster 的背景关掉是**全局**的：A 缩小后盖不满画框、C 里有 A 与整张画布两层光晕 ——
   两种情况都会在边上留下台阶。交付图统一用画布自己那层背景。 */
const page = (css, body) => `<!doctype html><meta charset="utf-8">
<style>${POSTER_STYLE}</style>
<style>html,body{margin:0;padding:0;overflow:hidden}
body{position:relative}
#poster{background:transparent !important;background-image:none !important}
${css}</style>
${body}`;
/* 背景一律用**比例版**光晕（GLOW_REL）：四个交付物画布尺寸差别很大，
   套用海报那版绝对尺寸（1240×660px）会让小画布上光晕糊满、大画布上缩成一小团。 */
const canvasBg = (w, h) => `body{width:${w}px;height:${h}px;background:${BG};background-image:${GLOW_REL}}`;

const pageA = page(canvasBg(A_W, A_H), posterHost(A_W, A_H, A_SCALE, A_OFF_X, A_OFF_Y));
const pageB = page(canvasBg(B_W, B_H), b900.html);
const pageC = page(canvasBg(C_W, C_H),
  posterHost(A_W, C_H, A_SCALE, A_OFF_X, A_OFF_Y)
  + `<div style="position:absolute;left:${A_W}px;top:0;width:${A_H}px;height:${A_H}px">`
  + `${bCover(A_H, 'cb', bOpts).html}</div>`);
const pageBanner = page(canvasBg(BANNER_W, BANNER_H),
  posterHost(BANNER_W, BANNER_H, BANNER_SCALE, 0, BANNER_OFF_Y));

for (const [name, html] of [['cover-a', pageA], ['cover-b', pageB], ['cover-c', pageC], ['banner', pageBanner]]) {
  fs.writeFileSync(path.join(OUT, `${name}.html`), html);
}

/* ---------------- 出图 ---------------- */
console.log('\n出图');
const JOBS = [
  ['cover-a', 'wewrite-cover-main-2.35x1', A_W, A_H, ['900x383', '1800x766']],
  ['cover-b', 'wewrite-cover-square-1x1', B_W, B_H, ['900x900', '1800x1800']],
  ['cover-c', 'wewrite-cover-wide-3.35x1', C_W, C_H, ['1283x383', '2566x766']],
];
for (const [pageName, stem, w, h, sizes] of JOBS) {
  sizes.forEach((sizeTag, i) => {
    const tmp = `_${pageName}-${i}.png`;
    shot(`${pageName}.html`, tmp, w, h, i + 1);            // i=0 → @1x，i=1 → @2x
    const dest = path.join(PROMO, `${stem}-${sizeTag}.png`);
    fs.copyFileSync(path.join(OUT, tmp), dest);
    fs.unlinkSync(path.join(OUT, tmp));
    console.log(`  → ${path.basename(dest)}  ${(fs.statSync(dest).size / 1024).toFixed(0)} kB`);
  });
}
/* README 横幅落在仓库根的 assets/（Obsidian 官方文档就是这么引相对图片的） */
const bannerDir = path.join(REPO, 'assets');
fs.mkdirSync(bannerDir, { recursive: true });
shot('banner.html', '_banner.png', BANNER_W, BANNER_H, 1);
const bannerDest = path.join(bannerDir, 'readme-banner.png');
fs.copyFileSync(path.join(OUT, '_banner.png'), bannerDest);
fs.unlinkSync(path.join(OUT, '_banner.png'));
console.log(`  → ${path.relative(REPO, bannerDest).replace(/\\/g, '/')}  `
  + `${(fs.statSync(bannerDest).size / 1024).toFixed(0)} kB（README 页首用，${BANNER_W}×${BANNER_H}）`);

console.log(`\n结果：封面断言 ${pass} 项 —— ${fail ? fail + ' 项未通过' : '全部通过'}`);
process.exit(fail ? 1 : 0);
