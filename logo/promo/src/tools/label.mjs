/* 「2.0」铭牌轮廓 —— 参考图那种「顶端收成窄脊、两侧凹肩、四角外圆、左右中点一个小尖耳」的形状。
 *
 * 上半 + 左半的轮廓（其余镜像）：
 *     顶点 ─cap(凸)─ 接点1 ─shoulder(凹)─ 接点2 ─corner(凸)─ 竖边 ─耳(左右中点)─ 竖边 ─…
 *
 * 坐标：原点 = 本体左缘 / 墨迹顶（y 向下为正）；耳的尖端会伸到 x < 0，
 * 所以**墨迹盒比本体盒宽**，调用方要的是 labelBox() 而不是 [0, 2·half·H]。
 * H 一律是**墨迹高**（顶点到底点），所有比例都相对它。
 *
 * ── 为什么是**圆弧链** ──
 * ① 参考图的过渡是"缓"的：从顶点到竖边要经过 凸(窄脊) → 凹(收腰) → 凸(圆角) 三次换向，
 *    圆弧链能把这段的**每一处曲率**都拟出来，残差 0.0029·H（参考图墨迹高 189px ≈ 0.5px）。
 *    抛物线 + 挖角圆那套（第五轮）只对得上顶端，肩部一整段是错的 —— 分块取极值的粗量法
 *    （0.027·H）刚好把最快的曲率糊掉了，看不出问题。
 * ② 相切链的接点是**解析解**：三段圆心定下来，接点 J1/J2 就定了，不用手感去凑。
 *    带折角的轮廓在 178px 的铭牌上是一个看得见的"瘪"。
 *
 * ── 参数怎么来的（别凭眼睛调）──
 * src/.tmp/arcfit.mjs：把参考图外轮廓按「到本体左缘的缩进 u(t)」**逐行**扫出来
 * （不取分块极值 —— 顶端曲率最快，分块会把窄脊糊掉），左右平均、上下平均
 * （参考图自身的不对称 ≤ 0.011·H），再拟成「凸 cap + 凹 shoulder + 凸 corner」三段，
 * 加上 4 条约束（顶点落在 t=0、cap 圆心在中线上、两处外切、corner 与竖边相切）。
 * ⚠️ t < 0.008 的行不进拟合：参考图顶端 1~2 行是水彩软边（顶点是个尖，那一行却铺开
 * 40 多像素），喂进去会把 cap 半径压小一半。渲染出来的候选图有同样的现象，不是参考图独有。
 *
 * 判定"顶端窄脊是真的"：src/.tmp/refcrest.mjs 把墨的判定阈值从 6 扫到 40，顶端剖面
 * 一动不动 —— 说明不是"淡色被判成背景"，是真结构。（而中部的涂色在同一批阈值下会裂成
 * 十几个碎段，所以**只信外轮廓**。）
 *
 * ── 耳的形（**这是踩坑踩出来的，别凭直觉改**）──
 * 逐行（1px）扫参考图的左边缘才看清它到底是什么：
 *
 *     缩进/H 0.106 平台 ── 逐渐离开 ── 0.000（耳尖）── 对称回来 ── 0.106 平台
 *     离开平台时**切线几乎平行于边线**（不是硬角），到耳尖时侧边约 30° → 耳尖夹角 ≈ 60–70°
 *
 * 也就是一条**与边线相切出发、逐渐弯向耳尖的二次曲线**。二次 Bézier 正好能表示它，
 * 拟合实测剖面得到：控制点 = 起点沿边线方向偏移 `kb·boss`。
 *   · 控制点钉在 x = 0（竖边上）→ 起点切线严格平行于边线，这个性质是构造出来的、不靠拟合；
 *   · 耳尖半角 β = atan((ear − kb·boss) / boss)，耳尖夹角 = 2β。
 *     kb = 0.75 → β = 35.6° → 夹角 71°，对上参考图实测的 60–70°。
 * 两个参数都是在 labelprobe 的对拍里扫出来的，且都是**干净的最优点**（不是平台边缘）：
 *   kb  0.55 / 0.65 / **0.75** / 0.90 → 耳区偏差 0.0047 / 0.0030 / **0.0025** / 0.0043
 *   ear 0.140 / **0.155** / 0.170   → 耳区偏差 0.0056 / **0.0025** / 0.0047
 * 现在整条轮廓的对拍偏差 0.0043·H（≈0.8px），耳区 0.0025。
 *
 * ── 色带 / 白圈那一圈**不归这里管** ──
 * 三层（外色带 / 白圈 / 本体）由 build.mjs 用「贴着轮廓的描边 + 裁到轮廓内」画出来，
 * 描边到路径的垂直距离天然处处相等，所以白圈均匀是**构造保证**的，不需要轮廓可等距内缩。
 * 早先是"把轮廓等距内缩 off 再填色"：圆弧内缩还是圆弧，但**耳是二次曲线**，等距内缩没有
 * 解析解，当时用"控制点钉在原竖边上"硬凑 —— 于是耳尖的可存活深度被低估成 boss·sinβ，
 * kb=0.75 时只有 11.0，小于色带+白圈 12.1，**最内一层的耳被整个吃光**，白圈在耳尖堆成
 * 一坨白疙瘩（就是旧注释里警告过的那个坑）。改成描边后这条约束消失，kb 才敢取到最优的 0.75。
 * ⚠️ 别再改回挖贴法，也别再加回 `off` 参数 —— 那等于把这条约束请回来。
 */
const n = (v) => +v.toFixed(2);

/** 参考图实测比例（都相对**墨迹高**）。build.mjs 的 L.tag 从这里派生，改这里就够了。 */
export const OGEE = {
  half: 0.6032,   // 本体半宽（本体 = 左右竖边之间的距离）
  boss: 0.1058,   // 左右耳的突出量
  R1: 0.3790,     // 顶端 cap 半径（凸：材质在圆内）
  R2: 0.9191,     // 肩膀 shoulder 半径（凹：材质在圆外）
  R3: 0.1674,     // 角 corner 半径（凸；与竖边相切）
  th: -112.2,     // cap 圆心 → shoulder 圆心的方向（度）——拟合出来的，没有更直观的说法
  ear: 0.155,     // 耳的半高（耳与竖边的接点距中线）
  kb: 0.75,       // 耳侧边二次曲线的控制点偏移（× boss）：越大越尖（0.75 → 耳尖 71°）
};

/** 轮廓几何（解析）。H = **墨迹高**（含顶端窄脊与底部窄脊的总高）。 */
export function ogeeGeom(H, o = {}) {
  const P = { ...OGEE, ...o };
  const half = P.half * H, boss = P.boss * H;
  const r1 = P.R1 * H, r2 = P.R2 * H, r3 = P.R3 * H;
  const th = (P.th * Math.PI) / 180;
  const c1 = { x: half, y: r1 };
  const c2 = { x: c1.x + (r1 + r2) * Math.cos(th), y: c1.y + (r1 + r2) * Math.sin(th) };
  const t0 = c2.y + Math.sqrt((r2 + r3) ** 2 - (r3 - c2.x) ** 2);   // corner 切到竖边的高度（解出来的）
  const c3 = { x: r3, y: t0 };
  const on = (a, b, r) => ({ x: a.x + (r * (b.x - a.x)) / Math.hypot(b.x - a.x, b.y - a.y), y: a.y + (r * (b.y - a.y)) / Math.hypot(b.x - a.x, b.y - a.y) });
  const J1 = on(c1, c2, r1), J2 = on(c2, c3, r2);                    // 两处接点（相切 → 解析可得）
  const mirrorX = (p) => ({ x: 2 * half - p.x, y: p.y });
  const mirrorY = (p) => ({ x: p.x, y: H - p.y });
  /* 耳的形参：耳的半高、控制点沿边线的偏移 K、耳尖半角 β */
  const ear = P.ear * H, K = P.kb * boss;
  return { P, H, half, boss, r1, r2, r3, R1: r1, R2: r2, R3: r3, c1, c2, c3, t0, J1, J2,
    J1R: mirrorX(J1), J2R: mirrorX(J2), c2R: mirrorX(c2), c3R: mirrorX(c3),
    apexTop: { x: c1.x, y: 0 }, apexBot: { x: c1.x, y: H },
    cornerL: { x: 0, y: t0 }, cornerR: { x: 2 * half, y: t0 },
    earHalf: ear, tipBeta: Math.atan((ear - K) / boss), mirrorX, mirrorY };
}

/** @param {number} H 墨迹高 @param {object} o 形状参数，可从 OGEE 覆盖 */
export function labelPath(H, o = {}) {
  const g = ogeeGeom(H, o);
  const { c1, c2, c3, R1, R2, R3, half, boss, t0, J1, J2, J1R, J2R, c2R, c3R } = g;
  const P = (p) => `${n(p.x)} ${n(p.y)}`;
  /* 弧线：从 a 到 b 绕圆心 c、半径 r。large/sweep 都用几何算，不写死 ——
   * 镜像那一半的角度方向与这一半相反，写死必然画反一边。 */
  const ARC = (c, r, a, b) => {
    const u = Math.hypot(a.x - c.x, a.y - c.y), v = Math.hypot(b.x - c.x, b.y - c.y);
    const dot = ((a.x - c.x) * (b.x - c.x) + (a.y - c.y) * (b.y - c.y)) / (u * v);
    const cross = (a.x - c.x) * (b.y - c.y) - (a.y - c.y) * (b.x - c.x);
    const ang = Math.atan2(Math.abs(cross), dot);
    return `A${n(r)} ${n(r)} 0 ${ang > Math.PI ? 1 : 0} ${cross > 0 ? 1 : 0} ${P(b)}`;
  };
  /* ── 耳（左右中点那个小尖；@see 文件头）──
   * 两侧各两段二次曲线，拐点是耳尖：
   *   ① 控制点的 x 钉在竖边上 → 起点切线严格平行于边线（不是硬角），这一条是构造出来的；
   *   ② 控制点相对中线的偏移是 `c = ear − kb·boss`（**不是** kb·boss）—— 它同时决定
   *      耳尖半角 β = atan(c/boss)：kb 越大 c 越小、耳越尖。
   *   ③ 耳尖落在 ±boss 上，正好是 labelBox 的左右边，所以"墨迹盒"是能算准的。
   * ⚠️ 左右耳是镜像**且行进方向相反**，两段控制点的上下顺序也相反 —— 抄一遍必错一边。 */
  const ear = g.earHalf, c = ear - g.P.kb * boss;
  const earR = `L${P({ x: 2 * half, y: H / 2 - ear })}`
    + `Q${P({ x: 2 * half, y: H / 2 - c })} ${P({ x: 2 * half + boss, y: H / 2 })}`
    + `Q${P({ x: 2 * half, y: H / 2 + c })} ${P({ x: 2 * half, y: H / 2 + ear })}`;
  const earL = `L${P({ x: 0, y: H / 2 + ear })}`
    + `Q${P({ x: 0, y: H / 2 + c })} ${P({ x: -boss, y: H / 2 })}`
    + `Q${P({ x: 0, y: H / 2 - c })} ${P({ x: 0, y: H / 2 - ear })}`;
  const mY = g.mirrorY;
  return `M${P(g.apexTop)}`
    + ARC(c1, R1, g.apexTop, J1R) + ARC(c2R, R2, J1R, J2R) + ARC(c3R, R3, J2R, g.cornerR)   // 右半：cap / 肩 / 角
    + earR + `L${P(mY(g.cornerR))}`                                                        // 右耳 + 到右下角
    + ARC(mY(c3R), R3, mY(g.cornerR), mY(J2R)) + ARC(mY(c2R), R2, mY(J2R), mY(J1R))        // 右下角 / 肩
    + ARC(c1, R1, mY(J1R), g.apexBot)                                                      // 底 cap
    + ARC(c1, R1, g.apexBot, mY(J1)) + ARC(mY(c2), R2, mY(J1), mY(J2))                     // 左下 cap / 肩
    + ARC(mY(c3), R3, mY(J2), mY(g.cornerL))                                               // 左下角
    + earL + `L${P(g.cornerL)}`
    + ARC(c3, R3, g.cornerL, J2) + ARC(c2, R2, J2, J1) + ARC(c1, R1, J1, g.apexTop)        // 左上角 / 肩 / cap
    + 'Z';
}

/** 外接盒（解析解）：左右由耳尖决定（±boss），上下就是墨迹高。 */
export function labelBox(H, o = {}) {
  const P = { ...OGEE, ...o };
  return [-P.boss * H, 0, (2 * P.half + 2 * P.boss) * H, H];
}
