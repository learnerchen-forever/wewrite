/* 海报产物自检：素材是否真的内联、是否真的没有纯黑、渐变是否真的被应用、
 * 字体是否在本机白名单内。这些断言存在的意义是拦住「看起来做了其实没做」。
 *
 * 用法：node verify.mjs [海报html]        （被 build.mjs 自动调用，也可单独跑）
 *
 * 三类断言各自防的事故：
 *   内联——「引用了一个文件」和「内容真的在页面里」在浏览器里都能渲染，
 *         但只有后者能保证交付出去的是自包含的（换台机器打开是一样的）；
 *   配色——用户明确说过不要纯黑。断言拦的是「下一轮改别的东西时纯黑悄悄长回来」；
 *   字体——本机对缺失字体静默回退，`document.fonts.check` 又不可信（恒 true），
 *         所以判据只能是「渲染出来的字形」+ 一份人工核对过的白名单。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const B = path.dirname(fileURLToPath(import.meta.url));      // …/logo/promo/src
const PROMO = path.resolve(B, '..');                          // …/logo/promo
const LOGO = path.resolve(PROMO, '..');                       // …/logo

export const POSTER_HTML = path.join(PROMO, 'wewrite-2.0-poster.html');

export function verify(htmlPath = POSTER_HTML) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };

  let fail = 0, pass = 0;
  const ok = (label, cond, detail = '') => {
    if (cond) pass++; else fail++;
    console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
  };

  // 从源 SVG 里取一段独特片段，验证真的被内联进海报。
  // 注意：路径坐标可能是负数（转曲字标起点是 M498 -719），正则必须吃 `-`，
  // 否则会误报「源文件里没找到特征串」—— 那是正则的锅，不是素材没内联。
  const D_START = /d="M-?[\d.]+ -?[\d.]+/;
  const probe = (label, srcPath, re) => {
    const src = read(srcPath);
    if (!src) { ok(label + '（源可读）', false, srcPath + ' 读不到'); return; }
    const m = src.match(re);
    if (!m) { ok(label + '（源含特征串）', false, '未在源文件中匹配到'); return; }
    ok(label, html.includes(m[0]), '片段 ' + JSON.stringify(m[0].slice(0, 28)));
  };
  const longestD = (srcPath) => {
    const src = read(srcPath);
    if (!src) return null;
    const ds = [...src.matchAll(/d="([^"]+)"/g)].map((m) => m[1]).sort((a, b) => b.length - a.length);
    return ds[0] || null;
  };

  console.log(`海报自检 · ${path.relative(PROMO, htmlPath) || path.basename(htmlPath)}`);
  console.log('\n品牌素材内联');
  probe('Obsidian 紫晶（官方矢量路径）', path.join(B, 'assets/obsidian-gradient.svg'), D_START);
  probe('Obsidian 渐变色标', path.join(B, 'assets/obsidian-gradient.svg'), /#[0-9a-fA-F]{6}/);
  probe('微信公众号漩涡（描摹矢量）', path.join(B, 'assets/wechat-mp.svg'), D_START);
  probe('WeWrite 字标（转曲）', path.join(LOGO, 'wewrite-wordmark.svg'), D_START);
  probe('WeWrite 标志（转曲）', path.join(LOGO, 'wewrite-mark-tight.svg'), D_START);
  {
    const d = longestD(path.join(LOGO, 'wewrite-wordmark.svg'));
    ok('字标整条路径逐字符内联（未被重排 / 重绘）', !!d && html.includes(d), d ? '路径 ' + d.length + ' 字符' : '读不到字标');
  }

  console.log('\n配色：不能有纯黑');
  /* 这是用户第二轮的第一条意见（「有些压抑」），所以必须能自动拦住复发。
     例外：<mask> 里的 #000 / #fff 是**通道值**（白=显示，黑=挖掉），不是画出来的颜色，
     所以先剥掉 mask 再查。第四轮把 tag 的挖孔撤了、海报自己不再生成 mask，
     但第三方素材（Obsidian 官方文件）里可能带着 mask，这层剥离留着更稳。 */
  const painted = html.replace(/<mask[\s\S]*?<\/mask>/g, '');
  for (const bad of ['#17171B', '#000000', '#000}', '#000"']) {
    ok(`未出现纯黑 ${bad}`, !painted.includes(bad));
  }
  ok('用的是带紫的深墨 #2E2544', html.includes('2E2544'));
  ok('字标填充为紫色渐变', html.includes('fill="url(#wmGrad)"'));
  ok('标志填充为紫色渐变', html.includes('fill="url(#mkGrad)"'));
  ok('没有残留未替换的 currentColor', !html.includes('currentColor'));
  ok('紫框是淡紫底 #F1EAFC', html.includes('F1EAFC'));
  ok('公众号绿仍为实测值 #00cc7a', html.includes('00cc7a'), '若出现 07C160 说明填了记忆里的官方色');
  ok('未误用 #07C160', !html.includes('07C160'));
  {
    const radials = (html.match(/radialGradient/g) || []).length;
    ok('Obsidian 渐变未被重绘（含 radialGradient）', radials > 0, radials + ' 处');
  }

  console.log('\n手绘要素（靠形体不精确，不靠噪声滤镜）');
  /* 用户第三轮明确说「不要抖动」—— 抖动是噪声位移，手绘是形体不精确。
   * 这条断言拦的是：下一轮为了"加点质感"把 feTurbulence 又加回来。 */
  ok('已彻底移除抖动滤镜（无 feTurbulence）', !html.includes('feTurbulence'));
  ok('已彻底移除位移滤镜（无 feDisplacementMap）', !html.includes('feDisplacementMap'));
  for (const g of ['wmGrad', 'mkGrad', 'tagGrad', 'arrGrad']) {
    ok(`渐变 ${g} 已定义`, html.includes(`id="${g}"`));
  }
  ok('箭头是干净矢量：单路径 + 圆角接头', html.includes('stroke-linejoin="round"')
    && /<path fill="url\(#arrGrad\)"[^>]*d="M/.test(html));
  ok('Tag 文本为 2.0', html.includes('>2.0<'));
  ok('箭头文字为「发布到」', html.includes('发布到'));

  console.log('\n2.0 铭牌（参考图形状 + 贴着字标站住、竖直对齐、无连线）');
  /* 第四轮：字标→徽标的那根绳整根取消。这一组拦的是「撤得不干净」——
     留下孔、留下绳、留下车线，徽标都会读错。
     第五轮：形状从"圆角方"换成参考图的「四角内凹 + 左右小耳」铭牌，
     所以"刚好 4 条弧"那条断言同步改成了「4 条内凹弧 + 小耳用二次曲线」—— 改形状要改断言，别删。 */
  ok('已撤掉挂绳（用户明确说连线不好看）', !html.includes('hangRope'));
  { /* 铭牌这一块内不该再出现任何吊牌词汇：孔、金属圈、车线。 */
    const tagBlock = (html.match(/<path fill="url\(#tagGrad\)"[\s\S]*?<\/svg>/) || [''])[0];
    ok('铭牌块内已无挖孔 / 金属圈', !tagBlock.includes('tagHole') && !tagBlock.includes('<circle'),
      `块内 ${tagBlock.length} 字符`);
    ok('铭牌块内已无车线（虚线缝线）', !tagBlock.includes('stroke-dasharray'));
    /* 轮廓结构：8 段外凸弧（顶/底窄脊各 2 半 + 四角）+ 4 段内凹弧（两侧收腰）+ 左右耳各 2 段二次曲线。
       第五、六轮换过两次形状模型（"抛物线 + 挖角圆" → "三段相切圆弧链"），这条断言跟着改过两次 ——
       形状一换它就红，**改形状要同步改断言，别顺手删掉**。
       别用 \bA 匹配半径数字：SVG 路径里 "H118A50" 的 8 和 A 之间没有词边界。 */
    const d = (html.match(/<path fill="url\(#tagGrad\)" d="(M[^"]+)"/) || ['', ''])[1];
    const sw = [...d.matchAll(/A[\d.]+ [\d.]+ 0 (\d) (\d)/g)].map((m) => Number(m[2]));
    const nvx = sw.filter((x) => x === 1).length, ncv = sw.filter((x) => x === 0).length;
    ok('铭牌轮廓 = 8 段外凸弧 + 4 段内凹弧（收腰）+ 4 段耳部二次曲线',
      nvx === 8 && ncv === 4 && (d.match(/Q/g) || []).length === 4,
      `${nvx} 凸 / ${ncv} 凹 / ${(d.match(/Q/g) || []).length} Q · ${d.slice(0, 30)}…`);
    ok('铭牌不斜置（斜着放就读不出"竖直中线对齐"）', !tagBlock.includes('rotate('));
    /* 三层（外色带 / 白圈 / 本体）是"贴轮廓描边 + 裁到轮廓内"，**不是**"等距内缩两次填色"：
       描边到路径的垂直距离天然处处相等，所以白圈在耳尖不会堆成一坨（耳是二次曲线，
       等距内缩没有解析解 —— 那正是旧做法把最内一层的耳整个吃光的原因）。 */
    ok('铭牌是「色带 / 白圈 / 本体」三层（描边叠出来）',
      tagBlock.includes('<path fill="url(#tagGrad)" d=')
      && (tagBlock.match(/fill="none" stroke=/g) || []).length === 2
      && tagBlock.includes('stroke="#FFFFFF"'));
    ok('色带 / 白圈被裁在轮廓内（少了 clip-path，描边会糊到轮廓外、整块铭牌变胖）',
      html.includes('clip-path="url(#tagClip)"'), 'clipPath id=tagClip');
    ok('铭牌渐变写的是 userSpaceOnUse', html.includes('gradientUnits="userSpaceOnUse"'),
      'objectBoundingBox 会让各层按自己的盒子铺渐变，接缝可见');
  }

  console.log('\n字体（本机白名单）');
  /* 两种写法都要收：CSS 里的 `font-family:` 和 SVG 呈现属性里的 `font-family='…'`。
     只匹配前者时，写在 SVG 里的 Tag 字体会**整段漏检** —— 断言看着绿，其实没测那件事。 */
  const fams = [...new Set([
    ...(html.match(/font-family:[^;}]+/g) || []).map((s) => s.replace(/font-family:\s*/, '').trim()),
    ...[...html.matchAll(/font-family='([^']+)'/g)].map((m) => m[1]),
  ])];
  for (const f of fams) console.log('    · ' + f);
  ok('Tag 的字体被纳入校验（不是零条）', fams.length >= 3, fams.length + ' 条声明');
  /* 白名单是「人工在渲染图上核对过字形」的字体。名字写错浏览器会**静默回退**，
     页面照常渲染 —— 所以只能靠白名单 + build.mjs 里的墨迹盒比对双重把关。 */
  const WHITELIST = ['Arial Black', 'Segoe UI Black', 'Segoe UI', 'Microsoft YaHei',
    'HarmonyOS Sans SC'];
  const GENERIC = ['system-ui', 'sans-serif', 'serif', 'monospace', '-apple-system'];
  const named = [...new Set(fams.flatMap((f) => f.split(',')
    .map((s) => s.trim().replace(/^["']|["']$/g, '')).filter((s) => s && !GENERIC.includes(s))))];
  const stray = named.filter((n) => !WHITELIST.includes(n));
  ok('未出现白名单外的具体字体名', stray.length === 0, stray.length ? '越界：' + stray.join(', ') : named.length + ' 个均在白名单');
  /* 第四轮把「发布到」从手写体 FZShuTi 换成了与「微信公众号」同族的雅黑 600。
     这条拦的是"只改了 CSS 忘了别处"或"又改回手写体"。 */
  ok('不再使用手写体 FZShuTi（已与「微信公众号」同族）', !html.includes('FZShuTi'));
  for (const b of ['Impact', 'PingFang']) ok('未使用会静默回退的 ' + b, !html.includes(b));

  console.log('\n画布');
  ok('画布 2048×1152 声明在场', html.includes('2048') && html.includes('1152'));

  console.log(`\n结果：${fail === 0 ? `${pass} 项全部通过` : `${fail} 项未通过（共 ${pass + fail} 项）`}`);
  return { fail, pass };
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  process.exit(verify(process.argv[2] ? path.resolve(process.argv[2]) : POSTER_HTML).fail === 0 ? 0 : 1);
}
