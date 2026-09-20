/* WeWrite-2.0 宣传画 · 生成器（版式唯一来源）
 *
 * 作品名就叫 `WeWrite-2.0`（母版 HTML 的 <title> 也是它，浏览器里不会只显示文件名）。
 *
 * 跑一次：node logo/promo/src/build.mjs
 * 产出：logo/promo/wewrite-2.0-poster.html        ← 可打开的母版（自包含，无外部依赖）
 *       logo/promo/wewrite-2.0-poster-2048x1152.png  屏幕 / 社交，16:9
 *       logo/promo/wewrite-2.0-poster-4096x2304.png  印刷，正好 2×
 *
 * 改版式只动下面的 L 常量表 —— 位置、间距、字号全在这一个地方，改完跑一遍出图。
 *
 * ── 设计上的几处判断（不是随手定的，改之前先读） ──
 *
 * ①「WeWrite 建立在 Obsidian 之上」：v1 画成「白卡压在紫底座上沿」，v2 按用户要求改成
 *    **紫色背景框内左右并排**。读感从"坐在上面"变成"在它里面" —— 对插件来说后者更准。
 * ② 两个标志「等高」不是审美直觉，是量出来的：tools/inkarea.mjs 实测等高时墨迹面积比
 *    0.990（几乎相等），所以等高即等重。一高一宽的两个标志若凭感觉调，很容易一路调歪。
 * ③ WeWrite 标志与字标**不用纯黑**，走 Obsidian 紫的渐变；标签文字用带紫的深墨 #2E2544。
 * ④ **不用噪声滤镜做"手绘感"**。v2 用 feTurbulence + feDisplacementMap 位移边缘，
 *    用户反馈「不要抖动」—— 抖动（噪点位移）和手绘（比例不精确）是两件事：
 *    · 抖动 = 线条边缘高频毛刺，看着像信号不好；
 *    · 手绘 = 形体本身不精确 —— 上下倒钩不一样长、笔尖偏轴 3px、柄端比尖端略宽。
 *    所以现在靠**刻意的不对称**做手绘（见 arrow 常量），线条本身是干净的矢量。
 *    要恢复噪声滤镜的话，verify.mjs 里「已彻底移除抖动滤镜」那条断言会先拦住你。
 * ⑤ 公众号的绿是**像素实测值 #00cc7a**（见 assets/wechat-mp.json），不是流传的 #07C160。
 *    用户要的是「原图色彩」，所以以原图为准。
 * ⑥ 对称性是**算出来的**（见文件末尾断言），不是看出来的。用户明确要求「整体布局要对称」。
 * ⑦ Tag 是**贴着字标右缘站住的「2.0」铭牌**（第五轮按用户给的参考图换的形状）：
 *    四角内凹 + 左右边中点一个外凸小耳 + 上下边外鼓，外加「外色带 / 白圈 / 本体」三层描边。
 *    轮廓算法在 tools/label.mjs，那里解释了为什么用「挖圆 / 贴圆」而不是偏移曲线。
 *    结构量是**拟合**出来的：tools/labelprobe.mjs 把候选渲染成图，和参考图剪影按墨迹高归一化
 *    后逐行比边界。结果是宽高比 1.418、耳突出 0.106、耳半高 0.155、挖角 0.088、外鼓 0.15
 *    （均相对**墨迹高**），平均偏差 0.027 —— 参考图是水彩稿，到这量级别再抠就是抠洇染了。
 *    纹理（水彩）不抄，成品是平色矢量。
 * ⑧ 铭牌的**竖直中线与标题行中线对齐**（用户第五轮指出上一版偏低了 42px）——
 *    不再有 drop，铭牌墨迹中心 == 字标墨迹中心，写成断言。
 *    注意"字标墨迹中心 == 字标盒中心"这件事**要量**：字标 viewBox 左右并不严格贴合，
 *    所以这里用 tools/measure-svg.mjs 的实测盒当 viewBox，免得拿虚边当墨迹来对中心。
 * ⑨ 凡是「文字要与某个几何体精确对齐」的地方，用 tools/textink.mjs 量**墨迹盒**，
 *    不要用 fontSize×字数 估 —— 换字体后字面宽度的误差会大到肉眼可见。
 */
import fs from 'node:fs';
import path from 'node:path';
import { shot, setOut } from './shot.mjs';
import { verify, POSTER_HTML } from './verify.mjs';
import { measureText, fontAvailable } from './tools/textink.mjs';
import { ogeeGeom } from './tools/label.mjs';
/* token / 字体 / 素材加载 / 几何小工具 / 铭牌构造都在 kit.mjs —— 与公众号封面**共用同一份**，
 * 免得两边的「2.0」铭牌慢慢长歪（封面 C 里两块铭牌是并排出现的，差异一眼可见）。 */
import {
  SRC, PROMO, BG, GLOW, F_LAT, F_CJK, INK, PURPLE, FRAME_BG, FRAME_BD, ARROW_BD,
  n, grad, art, abs, vb, makeTag,
  OBSVG, OBB, WMBB, MPSVG, mpColor, MARK, WORD,
} from './kit.mjs';

const OUT = setOut(path.join(SRC, '.tmp'));                  // 渲染中间件

const W = 2048, H = 1152;
/* 「发布到」不再用手写体 —— 用户第四轮否掉了 FZShuTi（「字体难看」），改为
 * **和「微信公众号」标签同一个字体**（F_CJK + 600），两处文字同族。
 * 别凭印象换字体名：写错会**静默回退**，页面看着正常但根本不是那个字体；
 * textink.mjs 的 fontAvailable() 用「墨迹盒比对」能自动识破回退，见文件末尾断言。 */
const F_CAP = 'Microsoft YaHei';

/* ---------------- 标志素材 ---------------- */
/* OBSVG / OBB / WMBB / MPSVG / MARK / WORD / vb / grad / art / abs 全部来自 kit.mjs。
 * 那几个"墨迹盒必须实测、别按 viewBox 估"的坑写在 kit.mjs 的对应条目上。 */

/* ---------------- 版式 ---------------- */
const L = {
  /* 标题行：字标 + 贴着它右缘的「2.0」徽标（两者合成一个包围盒再水平居中） */
  wmInk: 142, titleCY: 196,
  tag: {
    /* 第五轮：用户给了参考图（assets/ref-label-shape.png），形状换成「顶端收成窄脊 + 两侧凹肩 +
     * 四角外圆 + 左右边中点一个小尖耳」的铭牌，外带「色带 / 白圈」双层描边。
     * 第六轮：用户说这个形状"过于简单"，于是把参考图外轮廓**逐行**重新拟合成了
     * 「凸 cap → 凹 shoulder → 凸 corner」**三段相切的圆弧链**，残差 0.0043·墨迹高 ≈ 0.8px
     * （旧模型 0.027 —— 分块取极值的粗量法刚好把顶端最快的曲率糊掉了，所以看着"简单"）。
     *
     * ⚠️ **形状参数不在这张表里**，全在 tools/label.mjs 的 OGEE（唯一来源，拟合出来的）：
     * 半宽 / 耳突出 / 三段弧半径 / cap→shoulder 方向 / 耳半高与耳尖角。这里的数只有
     * "多大、离字标多远、描边多宽"这类版式量 —— 改形状去 label.mjs，别在这儿加形状参数。
     * 口径统一是**墨迹高**（= 顶端窄脊顶点到底端顶点），这样表里的数能和 labelprobe 的输出逐条对照。 */
    inkH: 178,                        // 墨迹高（所有比例都相对它）
    shape: {},                        // 临时覆盖 OGEE 的口子，默认不覆盖
    /* 色带 + 白圈是**贴轮廓的描边**（见下面 tagSVG），垂直宽度处处均匀，所以不再有
       "耳尖被内缩吃光"那条约束（那正是 kb 只能取到 0.15 的原因，形状因此偏钝）。
       ⚠️ 参考图的描边其实更粗（色带宽约 0.048、白圈约 0.037），照抄会显得笨重 ——
       水彩的洇染本来就把描边量粗了，取 0.068（色带+白圈）更实在。 */
    band: 0.037, ring: 0.031,         // 外色带 / 白圈 的宽度（× 墨迹高）
    gap: 26,                          // 铭牌**墨迹**左缘（= 小耳尖端）距 字标右缘
    drop: 0,                          // 墨迹中心 与 标题行中线的高差 —— 用户要求对齐，故为 0
    pad: 2,                           // viewBox 余量（只给抗锯齿留，别再放大）
    fs: 52,                           // 「2.0」字号
  },

  /* 主体行：紫色框 + 箭头 + 公众号，三者共享中线 CY */
  CY: 698,
  frame: { x: 158, w: 940, h: 560, r: 76 },
  logoInk: 250, logoGap: 170, logoCY: 679,      // 框内两个标志等高，整对居中
  labelFS: 48, labelCY: 928,                    // 「Obsidian」靠近框底边
  arrow: {
    pad: 14, w: 442, h: 272,
    head: 120,                // 箭头尖端的长度（决定了杆能有多长给文字）
    shaftHalf: 0.215,         // 杆半高 / 内高
    barbs: [0.398, 0.432],    // 上下倒钩半高比 —— **刻意不等**，这是手绘感的主要来源
    flare: [1.14, 1.10],      // 柄端上下各张开多少 —— 也刻意不等
    bow: [4.5, 3.5, 3],       // 杆上沿 / 箭头两斜边 / 柄尾 的微鼓（手画的线不会笔直）
    tipDy: 5,                 // 笔尖略微偏轴
    /* 换雅黑后同字号更宽：实测 40px/600 墨迹 116.5×38.5，右侧余量 14.75px；
     * 42px 就压到 11.75px（断言线是 >12）+ 44px 只有 8.75px。
     * 宁可变字号，也不去改已经认可的箭头形状。 */
    capFS: 40,
  },
  mpInk: 250, mpLabelFS: 46, mpGap: 32,
};
const frameY = L.CY - L.frame.h / 2;
const frameCX = L.frame.x + L.frame.w / 2;

/* ---------------- 标题行：字标 + 挂tag ---------------- */
const wm = art(WORD, L.wmInk, { box: WMBB, fill: 'url(#wmGrad)', defs: grad('wmGrad', [[0, '#A78BFA'], [0.55, '#7C3DF0'], [1, PURPLE]]) });

/* 铭牌几何：尺寸全部由**墨迹高**推（口径见 L.tag 的说明）。
 * 墨迹盒 = labelBox() 的解析解：左右到耳尖、上下到窄脊顶点（= 本体上下顶点）。
 * ⚠️ 本体高 == 墨迹高。旧模型把"上下外鼓"当独立的一层（本体高 = 墨迹高 − 2×外鼓），
 * 新模型的窄脊是 cap 圆弧自己的顶点，没有那一层了。 */
const T = L.tag;
/* 铭牌本体交给 kit.makeTag（**形状参数在 tools/label.mjs 的 OGEE**，不在这张表里，别在这儿加）。
 * prefix 传 'tag' → 生成 tagGrad / tagClip，与历史产物逐字节一致（verify.mjs 也认这两个 id）。 */
const tag = makeTag('tag', { inkH: T.inkH, band: T.band, ring: T.ring, fs: T.fs, shape: T.shape, pad: T.pad });
const tagInkH = tag.inkH, tagInkW = tag.inkW;
const tagBoss = tag.boss;                          // 耳突出量（墨迹比本体宽出来的那一半）
const tagBodyW = tag.bodyW;                        // 本体宽 = 2·half·墨迹高
const tagBand = tag.band, tagRing = tag.ring;
const tagOutline = tag.outline;

/* 定位：铭牌**贴着字标右缘站住**（第四轮取消了连线），且**竖直中线与标题行中线对齐**
 * （第五轮用户指出上一版整体偏低了 42px，所以 drop 归零 —— 定位用的就是这个 0，
 * 末尾断言测的也是它，不是另算一遍）。 */
const tagReach = T.gap + tagInkW;                  // 字标右缘 → 铭牌最右墨迹
const rowW = wm.w + tagReach;
const titleX = (W - rowW) / 2;
const wordRight = titleX + wm.w;
const tagInkL = wordRight + T.gap, tagInkR = tagInkL + tagInkW;
const tagInkC = L.titleCY + T.drop;
const tagInkT = tagInkC - tagInkH / 2, tagInkB = tagInkC + tagInkH / 2;
const bw = tagInkW + T.pad * 2, bh = tagInkH + T.pad * 2;
/* ⚠️ viewBox 的左/上边界是**负的**（形状本体在 [0,W]×[0,H]，小耳和鼓边伸到框外），
 * 所以盒坐标 = 墨迹左缘 − pad，**不是** 墨迹左缘 + 小耳深 − pad。
 * 写成后者会让整块铭牌被多推「小耳深」那么多（这一版实测右移 16.75px、下沉 10.27px，
 * 是 tools/gapprobe.mjs 量出来对不上才发现的）—— 末尾有断言盯着盒中心 == 墨迹中心。 */
const tagBoxX = tagInkL - T.pad;
const tagBoxY = tagInkT - T.pad;

/* 三层叠出「外色带 / 白圈 / 本体」的那段在 kit.makeTag 里 ——
 * 关键是**贴轮廓描边 + 裁到轮廓内**，不是等距内缩两次再填色：
 * 耳是二次曲线，等距内缩没有解析解，会把最内一层的耳整个吃光；
 * 描边的垂直距离天然处处相等，宽度由构造保证，耳的 kb 才敢取到拟合最优的 0.75。
 * 渐变必须 userSpaceOnUse —— 三层共用同一条路径，objectBoundingBox 会按各层盒子铺、接缝可见。 */
const tagGrad = tag.gradSVG;
const tagSVG = tag.svg;

/* ---------------- 主体行 ---------------- */
const mpW = (L.mpInk * vb(MPSVG)[2]) / vb(MPSVG)[3];
const mpBoxW = Math.max(mpW, L.mpLabelFS * 5);
const gap = (W - 2 * L.frame.x - L.frame.w - L.arrow.w - mpBoxW) / 2;
const A = { ...L.arrow, x: L.frame.x + L.frame.w + gap };
const mpCX = A.x + A.w + gap + mpBoxW / 2;

const obs = art(OBSVG, L.logoInk, { box: OBB });
const mk = art(MARK, L.logoInk, { fill: 'url(#mkGrad)', defs: grad('mkGrad', [[0, '#8B5CF6'], [1, '#5B22C9']]) });
const pairW = obs.w + L.logoGap + mk.w;
const pairX = frameCX - pairW / 2;
const mp = art(MPSVG, L.mpInk);

/* ---- 手绘箭头图形（**无噪声滤镜**）：形体不精确才是手绘，边缘毛刺只是抖动 ---- */

/** 折线 + 逐点圆角 + 逐边微鼓 → 手绘感的路径。
 *  手画的形状有两个特征，都不涉及噪声：
 *   ① 角是磨圆的（笔头有宽度），不是尖的；
 *   ② 长边不是直线，是缓缓鼓出去的弧 —— 注意是**缓**（几十像素一条边鼓几个像素），
 *      高频的起伏才是"抖"，那是另一回事。
 *  外法线取 (dy,-dx)：顶点按屏幕坐标下的顺时针给出时，它指向形状外侧。 */
function handPath(pts, radii, bows) {
  const at = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  const cor = pts.map((cur, i) => {
    const prev = pts[(i - 1 + pts.length) % pts.length], next = pts[(i + 1) % pts.length];
    const r = radii[i] || 0;
    if (!r) return { a: cur, b: cur, r: 0, sweep: 1 };
    const d1 = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
    const d2 = Math.hypot(next[0] - cur[0], next[1] - cur[1]);
    const cross = (cur[0] - prev[0]) * (next[1] - cur[1]) - (cur[1] - prev[1]) * (next[0] - cur[0]);
    const rr = Math.min(r, d1 / 2, d2 / 2);
    return { a: at(cur, prev, rr / d1), b: at(cur, next, rr / d2), r: rr, sweep: cross > 0 ? 1 : 0 };
  });
  const P = (p) => `${n(p[0])} ${n(p[1])}`;
  const arc = (c) => c.r > 0 ? `A${n(c.r)} ${n(c.r)} 0 0 ${c.sweep} ${P(c.b)}` : '';
  let d = `M${P(cor[0].b)}`;
  for (let i = 1; i <= pts.length; i++) {
    const k = i % pts.length, s = cor[i - 1].b, e = cor[k].a;
    const off = bows[i - 1] || 0;
    if (off) {
      const dx = e[0] - s[0], dy = e[1] - s[1], L = Math.hypot(dx, dy) || 1;
      d += `Q${n((s[0] + e[0]) / 2 + (dy / L) * off)} ${n((s[1] + e[1]) / 2 - (dx / L) * off)} ${P(e)}`;
    } else d += `L${P(e)}`;
    d += arc(cor[k]);
  }
  return d + 'Z';
}

const aw = A.w - A.pad * 2, ah = A.h - A.pad * 2;
const shy = ah / 2;
const shH = ah * A.shaftHalf;
const headX = aw - A.head;
const barbUp = ah * A.barbs[0], barbDn = ah * A.barbs[1];
const tipY = shy + A.tipDy;
/* 顶点顺时针：柄上 → 头背 → 倒钩上 → 笔尖 → 倒钩下 → 头背 → 柄下 */
const AV = [
  [0, shy - shH * A.flare[0]],
  [headX, shy - shH],
  [headX, shy - barbUp],
  [aw, tipY],
  [headX, shy + barbDn],
  [headX, shy + shH],
  [0, shy + shH * A.flare[1]],
];
const AR = [16, 14, 16, 16, 16, 14, 16];                 // 各顶点的磨圆半径
const AB = [A.bow[0], 1.5, A.bow[1], A.bow[1], 1.5, A.bow[0], A.bow[2]];  // 各边的外鼓量
const arrowPath = handPath(AV, AR, AB);
const arrowSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-A.pad} ${-A.pad} ${A.w} ${A.h}" `
  + `style="display:block;width:${A.w}px;height:${A.h}px">`
  + grad('arrGrad', [[0, '#F1E8FD'], [1, '#DFCEFB']], 'd')
  + `<path fill="url(#arrGrad)" stroke="${ARROW_BD}" stroke-width="9" stroke-linejoin="round" d="${arrowPath}"/></svg>`;

/* 「发布到」：用墨迹盒定位到**箭头整体的几何中心**，不是杆的中心（用户要求往右移）。
 * 宽度也是量出来的 —— 它决定了文字会不会啃到箭头尖上。
 * 字体与「微信公众号」标签同族（F_CJK + 600），这是用户第四轮的要求。 */
const capCX = A.pad + aw / 2;                         // 目标墨迹中心（箭头盒内）
const capInk = measureText({ text: '发布到', family: F_CAP, size: A.capFS, weight: 600 });
const capDivX = A.x + capCX - capInk.dx;              // 容器的中心 = 墨迹中心 - 偏移
const capDivY = L.CY - capInk.dy;

const html = `<!doctype html><meta charset="utf-8">
<title>WeWrite-2.0</title>
<style>
  html,body{margin:0;padding:0}
  #poster{position:relative;width:${W}px;height:${H}px;overflow:hidden;color:${INK};
    font-family:${F_LAT};-webkit-font-smoothing:antialiased;background:${BG};
    background-image:${GLOW}}
  .b{position:absolute;box-sizing:border-box}
  .frame{background:${FRAME_BG};border:1.5px solid ${FRAME_BD};box-shadow:0 30px 70px rgba(60,32,140,.07)}
  .label{font-family:${F_CJK};font-weight:600;color:${INK};line-height:1;white-space:nowrap}
  .cap{font-family:${F_CJK};font-weight:600;color:${PURPLE};line-height:1;white-space:pre}
  .mid{transform:translateY(-50%);display:flex;align-items:center;justify-content:center}
</style>
<div id="poster">
${abs(titleX, L.titleCY - wm.h / 2, wm.w, wm.h, '', '', wm.html)}
${abs(tagBoxX, tagBoxY, bw, bh, '', '', tagSVG)}

${abs(L.frame.x, frameY, L.frame.w, L.frame.h, 'frame', `border-radius:${L.frame.r}px`, '')}
${abs(pairX, L.logoCY - obs.h / 2, obs.w, obs.h, '', '', obs.html)}
${abs(pairX + obs.w + L.logoGap, L.logoCY - mk.h / 2, mk.w, mk.h, '', '', mk.html)}
${abs(L.frame.x, L.labelCY, L.frame.w, 0, '', 'transform:translateY(-50%);display:flex;align-items:center;justify-content:center',
  `<span class="label" style="font-size:${L.labelFS}px">Obsidian</span>`)}

${abs(A.x, L.CY - A.h / 2, A.w, A.h, '', '', arrowSVG)}
${abs(capDivX - 150, capDivY, 300, 0, '', 'transform:translateY(-50%);display:flex;align-items:center;justify-content:center',
  `<span class="cap" style="font-size:${A.capFS}px">发布到</span>`)}

${abs(mpCX - mpBoxW / 2, L.CY, mpBoxW, 0, '', 'transform:translateY(-50%);display:flex;align-items:center;justify-content:center',
  `<div style="display:flex;flex-direction:column;align-items:center;gap:${L.mpGap}px">${mp.html}`
  + `<span class="label" style="font-size:${L.mpLabelFS}px">微信公众号</span></div>`)}
</div>
`;

fs.writeFileSync(path.join(OUT, 'poster.html'), html);
console.log(`poster.html ${(html.length / 1024).toFixed(1)} kB`);
console.log(`字标 ${n(wm.w)}×${n(wm.h)}`);
console.log(`2.0 铭牌 本体宽 ${n(tagBodyW)} · 墨迹 ${n(tagInkW)}×${n(tagInkH)}`
  + `（宽高比 ${n(tagInkW / tagInkH)}，参考图 1.418）`);
console.log(`  三段弧（× 墨迹高）：cap ${n(ogeeGeom(tagInkH, T.shape).r1 / tagInkH)}`
  + ` / 肩 ${n(ogeeGeom(tagInkH, T.shape).r2 / tagInkH)} / 角 ${n(ogeeGeom(tagInkH, T.shape).r3 / tagInkH)}`
  + ` · 小耳 突出 ${n(tagBoss)} 半高 ${n(ogeeGeom(tagInkH, T.shape).earHalf)}`
  + ` 耳尖 ${n((2 * ogeeGeom(tagInkH, T.shape).tipBeta * 180) / Math.PI)}°`);
console.log(`  色带 ${n(tagBand)} + 白圈 ${n(tagRing)}（贴轮廓描边、裁到轮廓内 → 宽度处处均匀）`);
console.log(`标题行：总宽 ${n(rowW)}，左边距 ${n(titleX)}，右边距 ${n(W - titleX - rowW)}（应相等）`);
console.log(`  字标右缘 x=${n(wordRight)} → 铭牌墨迹 x ${n(tagInkL)}..${n(tagInkR)} · 缝 ${n(T.gap)}`
  + ` · 盒 (${n(tagBoxX)}, ${n(tagBoxY)})`);
console.log(`  无连线（第四轮取消了字标→铭牌的那根绳）`);
console.log(`  竖直对齐：铭牌中线 y=${n(tagInkC)} vs 字标中线 y=${L.titleCY}`);
console.log(`紫框 (${L.frame.x},${n(frameY)}) ${L.frame.w}×${L.frame.h} · 中线 y=${L.CY}`);
console.log(`框内等高 ${L.logoInk}：Obsidian ${n(obs.w)} 宽 / WeWrite ${n(mk.w)} 宽 · 对宽 ${n(pairW)}`);
console.log(`  框内左右内边距 ${n(pairX - L.frame.x)} / ${n(L.frame.x + L.frame.w - pairX - pairW)}（应相等）`);
console.log(`箭头 (${n(A.x)},${n(L.CY - A.h / 2)}) ${A.w}×${A.h} · 杆高 ${n(shH * 2)} · 头长 ${A.head}`);
console.log(`「发布到」${F_CAP} 600 ${A.capFS}px · 墨迹 ${capInk.w}×${capInk.h}`
  + ` · 墨迹中心 x=${n(A.x + capCX)}（箭头盒中心 ${n(A.x + A.w / 2)}）· 右缘距箭头尖 ${n(headX - (capCX + capInk.w / 2))}`);
console.log(`公众号 cx ${n(mpCX)} 宽 ${n(mpW)} · 右边距 ${n(W - (mpCX + mpW / 2))} · 原图色 ${mpColor}`);
console.log(`留白：上 ${n(tagInkT)} · 下 ${n(H - frameY - L.frame.h)}`);

/* ---------------- 版式断言 ----------------
 * 用户这次的要求第一条就是「整体布局要对称、美观」—— 对称是可计算的，不该交给眼睛。 */
let fail = 0, pass = 0;
const ok = (label, cond, detail = '') => {
  if (cond) pass++; else fail++;
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
};
const near = (a, b, eps = 0.5) => Math.abs(a - b) <= eps;

console.log('\n版式断言（对称性）');
ok('标题行左右留白相等（含挂tag外接盒）', near(titleX, W - titleX - rowW), `${n(titleX)} / ${n(W - titleX - rowW)}`);
ok('主体行左右留白相等', near(L.frame.x, W - (mpCX + mpBoxW / 2)), `${L.frame.x} / ${n(W - (mpCX + mpBoxW / 2))}`);
ok('紫框内左右内边距相等', near(pairX - L.frame.x, L.frame.x + L.frame.w - pairX - pairW),
  `${n(pairX - L.frame.x)} / ${n(L.frame.x + L.frame.w - pairX - pairW)}`);
ok('紫框中线 == 主体行中线', near(frameY + L.frame.h / 2, L.CY), `${n(frameY + L.frame.h / 2)} / ${L.CY}`);
ok('框内两个标志等高', obs.h === mk.h, `${n(obs.h)} / ${n(mk.h)}`);

console.log('\n版式断言（2.0 铭牌：贴着字标右缘站住、竖直中线对齐）');
ok('铭牌不压住字标（墨迹左缘在字标右缘之外）', tagInkL > wordRight,
  `铭牌左 ${n(tagInkL)} vs 字标右 ${n(wordRight)}`);
ok('铭牌与字标之间留了看得见的缝（8–40px）', tagInkL - wordRight >= 8 && tagInkL - wordRight <= 40,
  `${n(tagInkL - wordRight)}px`);
/* 第五轮用户原话：「Tag 的中心位置没有和 WeWrite 文字保持垂直方向的中心对齐」。 */
ok('铭牌墨迹中心 与 字标墨迹中心 等高（用户第五轮要求）', near(tagInkC, L.titleCY),
  `铭牌 ${n(tagInkC)} vs 字标 ${L.titleCY}（差 ${n(tagInkC - L.titleCY)}）`);
ok('已取消字标→铭牌的连线（第四轮用户要求）', !html.includes('hangRope'), '绳已撤，铭牌改为贴边站住');
ok('铭牌不再挖孔（吊牌的孔 / 车线 / 金属圈一并撤掉）', !html.includes('tagHole'),
  '没有绳之后，孤零零的孔只会让人问"绳呢"');
ok('铭牌不斜置（斜着放就读不出"竖直中线对齐"了）', !tagSVG.includes('rotate('), 'rot 已从常量表移除');
/* 墨迹宽高比现在是从 OGEE 直接推出来的（labelBox），所以这条断言测的是
   "2×(半宽 + 耳突出) == 参考图实测的 1.418"，而不是一个抄来的常数。 */
ok('铭牌墨迹宽高比 == 参考图实测的 1.418（由 OGEE 的半宽 / 耳突出推得）',
  Math.abs(tagInkW / tagInkH - 1.418) < 0.002,
  `${n(tagInkW / tagInkH)}（参考图实测 1.418）`);
ok('字标用**实测墨迹盒**当 viewBox（否则那 5.6px 虚边会偷偷混进"缝"里）',
  WMBB[2] - WMBB[0] < 150.844, `墨迹宽 ${n(WMBB[2] - WMBB[0])} < viewBox 宽 150.844`);
{
  /* 轮廓结构：8 段外凸弧（顶/底窄脊各 2 半 + 四角）+ 4 段内凹弧（两侧收腰）+ 左右耳各 2 段二次曲线。
   * 第五轮写的是"4 条内凹角弧（圆角方）"、第六轮之前是"抛物线 + 挖角圆"—— 形状一换它就
   * 一直红：**改形状要同步改断言**，别顺手删掉。 */
  const arcs = [...tagOutline.matchAll(/A([\d.]+) [\d.]+ 0 (\d) (\d)/g)].map((m) => [+m[1], +m[3]]);
  const concave = arcs.filter((a) => a[1] === 0), convex = arcs.filter((a) => a[1] === 1);
  ok('铭牌轮廓 = 8 段外凸弧（顶/底窄脊各 2 半 + 四角）+ 4 段内凹弧（两侧收腰）',
    convex.length === 8 && concave.length === 4, `${convex.length} 凸 / ${concave.length} 凹`);
  ok('收腰是"缓"的（最小的凹弧半径 > 最大的凸弧半径）',
    Math.min(...concave.map((a) => a[0])) > Math.max(...convex.map((a) => a[0])),
    `凹 ${n(Math.min(...concave.map((a) => a[0])))} > 凸 ${n(Math.max(...convex.map((a) => a[0])))}`);
  ok('左右小耳各 2 段二次曲线（耳尖光顺、不是折角）', (tagOutline.match(/Q/g) || []).length === 4);
  ok('耳的二次曲线控制点落在竖边上（起点切线平行于边线 → 耳是"从边上长出来"的）',
    [...tagOutline.matchAll(/Q(-?[\d.]+) /g)].map((m) => +m[1])
      .every((x) => near(x, 0, 0.01) || near(x, tagBodyW, 0.01)),
    `控制点 x ${[...tagOutline.matchAll(/Q(-?[\d.]+) /g)].map((m) => n(+m[1])).join(', ')}`);
  /* 相切链：labelPath 把接点 J 摆在离 C1 为 R1 处，若 |C1C2| ≠ R1+R2，J 就不落在第二段弧上 ——
     形状照画不误，但两段之间会出现肉眼可见的折角。这是整个轮廓唯一的几何不变量。 */
  {
    const gg = ogeeGeom(tagInkH, T.shape);
    const d12 = Math.hypot(gg.c2.x - gg.c1.x, gg.c2.y - gg.c1.y);
    const d23 = Math.hypot(gg.c3.x - gg.c2.x, gg.c3.y - gg.c2.y);
    ok('三段弧严格相切（|C1C2| = R1+R2 且 |C2C3| = R2+R3）',
      near(d12, gg.R1 + gg.R2, 0.01) && near(d23, gg.R2 + gg.R3, 0.01),
      `残差 ${n(Math.abs(d12 - gg.R1 - gg.R2))} / ${n(Math.abs(d23 - gg.R2 - gg.R3))}`);
    ok('角弧与竖边相切（圆心到竖边的距离 == 半径 → 四个角都没有硬角）', near(gg.c3.x, gg.R3, 0.01),
      `c3.x ${n(gg.c3.x)} vs R3 ${n(gg.R3)}`);
    ok('耳尖夹角 ≈ 参考图实测的 60–70°', Math.abs((2 * gg.tipBeta * 180) / Math.PI - 65) < 8,
      `${n((2 * gg.tipBeta * 180) / Math.PI)}°（kb ${gg.P.kb}）`);
    /* 耳尖必须真的**凸出本体** —— 各一个 x<0 / x>本体宽 的端点。
       取"每条命令的最后一对坐标"（Q 有两对，最后一对才是耳尖）；用"所有数字对"那种扫法
       会把 A 的参数对顺带配出来（看着像端点，其实不是）。 */
    const ends = [...tagOutline.matchAll(/[MLQA]([^MLAQZ]*)/g)].map((m) => {
      const v = m[1].trim().split(/\s+/).map(Number);
      return v[v.length - 2];
    });
    ok('左右耳尖各凸出本体一个（墨迹宽 − 本体宽 = 2×耳突出）',
      ends.filter((x) => x < -0.01).length === 1 && ends.filter((x) => x > tagBodyW + 0.01).length === 1,
      `盒外端点 左 ${ends.filter((x) => x < -0.01).length} / 右 ${ends.filter((x) => x > tagBodyW + 0.01).length}`);
  }
  /* 凸弧半径必须大于色带+白圈 —— 否则"再小一圈"的凸弧会翻到外侧去。
     换成贴轮廓的描边之后这条不再是**生死线**（描边不会退化），但太小仍会让圆角糊成一坨。 */
  ok('最小的凸弧半径 > 色带+圈宽（圆角不会被那一圈描边糊掉）',
    Math.min(...convex.map((a) => a[0])) > tagBand + tagRing,
    `${n(Math.min(...convex.map((a) => a[0])))} vs ${n(tagBand + tagRing)}`);
}
ok('铭牌是「色带 / 白圈 / 本体」三层',
  tagSVG.includes('<path fill="url(#tagGrad)" d=')
  && (tagSVG.match(/fill="none" stroke=/g) || []).length === 2
  && tagSVG.includes('stroke="#FFFFFF"'),
  '本体铺满 → 白描边（裁到轮廓内）→ 色带描边盖回最外圈');
ok('色带/白圈是**贴轮廓的描边**（宽度处处均匀由构造保证），不是等距内缩的第二个轮廓',
  tagSVG.includes('clip-path="url(#tagClip)"') && (tagSVG.match(/stroke-width=/g) || []).length === 2,
  '等距内缩在耳那里没有解析解 —— 会把最内一层的耳整个吃光');
ok('铭牌渐变用 userSpaceOnUse（三层共用一条路径，否则接缝可见）',
  tagGrad.includes('gradientUnits="userSpaceOnUse"'), 'objectBoundingBox 会让各层按自己的盒子铺渐变');
ok('「2.0」落在铭牌正中心', html.includes(`<text x="${n(tagBodyW / 2)}" y="${n(tagInkH / 2)}"`),
  `(${n(tagBodyW / 2)}, ${n(tagInkH / 2)})`);
ok('铭牌盒中心 == 铭牌墨迹中心（viewBox 的负偏移已补回）',
  near(tagBoxX + bw / 2, (tagInkL + tagInkR) / 2) && near(tagBoxY + bh / 2, tagInkC),
  `盒心 (${n(tagBoxX + bw / 2)}, ${n(tagBoxY + bh / 2)}) vs 墨迹心 (${n((tagInkL + tagInkR) / 2)}, ${n(tagInkC)})`);
ok('铭牌不和下方紫框重叠', tagInkB < frameY, `铭牌底 ${n(tagInkB)} vs 框顶 ${n(frameY)}`);

console.log('\n版式断言（箭头与「发布到」）');
ok('「发布到」墨迹中心 == 箭头盒几何中心', near(capCX, A.w / 2), `盒内 ${n(capCX)} / ${n(A.w / 2)}`);
ok('「发布到」右侧留白 > 12（文字不啃到箭头尖）', headX - (capCX + capInk.w / 2) > 12,
  `杆长 ${headX}，文字右缘 ${n(capCX + capInk.w / 2)}，余 ${n(headX - (capCX + capInk.w / 2))}`);
ok('「发布到」左侧留白 > 12（文字不顶到柄端）', capCX - capInk.w / 2 > 12, `余 ${n(capCX - capInk.w / 2)}`);
ok('「发布到」墨迹高 < 杆高的 80%（不撑满杆）', capInk.h < shH * 2 * 0.8,
  `${n(capInk.h)} vs ${n(shH * 2 * 0.8)}`);
ok('箭头上下倒钩刻意不等（手绘的不对称，不是 bug）', A.barbs[0] !== A.barbs[1], `${A.barbs.join(' / ')}`);
ok('笔尖偏轴（手绘的不精确，不是 bug）', A.tipDy !== 0, `${A.tipDy}px`);
ok('柄端比尖端宽（参考图里箭头是张开的）', A.flare[0] > 1 && A.flare[1] > 1, A.flare.join(' / '));

console.log('\n版式断言（字体真的存在）');
/* document.fonts.check 在本机恒返回 true，完全不可信；判据只能是渲染出来的墨迹。
 * textink 用「和必定不存在的字体名渲染同一串字」比对墨迹盒 —— 回退时两者必然相同。 */
ok(`${F_CAP} 真的可用（「发布到」与「微信公众号」同族，未静默回退）`,
  fontAvailable(F_CAP), '墨迹盒与兜底字体不同');
console.log(fail ? `版式断言 ${fail} 项未通过（共 ${pass + fail} 项）`
  : `版式断言 ${pass} 项全部通过`);

/* 出图：同一份源码渲两次 —— 屏幕版 1×、印刷版 2×（成本几乎为零，但用途完全不同） */
console.log('\n出图');
const DELIV_HTML = POSTER_HTML;
fs.copyFileSync(path.join(OUT, 'poster.html'), DELIV_HTML);
for (const [pw, ph, k] of [[2048, 1152, 1], [4096, 2304, 2]]) {
  const tmp = `_p2-${pw}.png`;
  shot('poster.html', tmp, W, H, k);
  const dest = path.join(PROMO, `wewrite-2.0-poster-${pw}x${ph}.png`);
  fs.copyFileSync(path.join(OUT, tmp), dest);
  fs.unlinkSync(path.join(OUT, tmp));
  console.log(`→ ${path.relative(PROMO, dest).replace(/\\/g, '/')}  ${(fs.statSync(dest).size / 1024).toFixed(0)} kB`);
}
console.log(`→ wewrite-2.0-poster.html  ${(fs.statSync(DELIV_HTML).size / 1024).toFixed(1)} kB（可直接用浏览器打开）`);

/* 产物自检（对刚写出的交付 HTML 跑，不是对中间件） */
console.log('');
const v = verify(DELIV_HTML);
const bad = fail + v.fail;
console.log(`\n结果：版式断言 ${pass} 项 · 产物断言 ${v.pass} 项 —— ${bad ? bad + ' 项未通过' : '全部通过'}`);
process.exit(bad ? 1 : 0);
