// Manual harness — skipped unless PROBE_OUT is set, so CI never writes files.
//
//   PROBE_OUT=docs/bug-fix/2026-09-22-codeblock-editor-probe.html \
//     node node_modules/jest/bin/jest.js tests/tools/code-block-editor-probe.test.ts
//
// Why this exists: the WeChat editor rewrites inline styles on paste/save, and
// we can only observe that from the outside. Everything we know about it came
// from diffing two real published articles (docs/bug-fix/2026-09-22-codeblock-autowrap.md).
// Alive questions this page settles in one paste:
//
//   - code blocks: the editor rewrites the white-space *value* `pre` on every
//     element that carries it (measured on <pre>/<section>/<code>, 56/56 each),
//     while 180 `nowrap` + 93 `normal` came through untouched. Is the rule
//     really "the token `pre`", or is it "any non-table element"? V3 (a <td>
//     host carrying `pre`) separates the two, and V2/V4 show whether the width
//     hedge is what is doing the work.
//   - the watermark: is <section> really immune where <div> was deleted?
//   - images: does the editor keep our `max-width` (so a narrow picture stays
//     narrow) or force its own?
//   - elements this sample never exercised: <figure>/<figcaption> captions,
//     <blockquote> decorations with a data-URI border-image, and the
//     `background-clip:text` + `color:transparent` inline gradient, where
//     losing one declaration makes the text vanish instead of look wrong.
//
// So this harness builds a labelled probe article. Paste it into the 公众号
// editor, look at each block (or publish + preview), and read the labels.
// Every variant uses the *real* resolved declarations where a builder exists, so
// the probe measures the markup we actually ship.

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;

import { ThemeResolver } from '../../src/renderer/theme-resolver';
import {
  buildImageStyle,
  buildFigureStyle,
  buildCaptionStyle,
  buildImageSliderStyle,
  toImageSliderSlide,
} from '../../src/renderer/image-renderer';
import { buildArticleWatermark } from '../../src/utils/article-watermark';

// Deliberately awkward content: a line too long to fit, an indented line, a
// blank line, and hyphens (break opportunities that survive &nbsp; encoding).
const CODE_LINES = [
  'const client = new OpenAI({ baseURL: "https://api.example.com/v1", timeout: 60000 });',
  '    retryPolicy: { maxRetries: 3, backoff: "exponential" },',
  '',
  '// --dry-run 会把长路径 a-very-long-flag-name 一起打印出来',
];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Escape a resolved style string for a hand-written style="…" attribute.
 *  The font stacks contain `"`, which would otherwise close the attribute. */
const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

/** Body text the way processCodeBlocksInPlace leaves it: <br> lines, &nbsp; spaces. */
const codeHtml = (nbSpaces: boolean) =>
  CODE_LINES.map((line) => {
    const escaped = esc(line);
    return nbSpaces ? escaped.replace(/ /g, '&nbsp;') : escaped;
  }).join('<br>');

// ---------------------------------------------------------------------------
// A tiny PNG built at runtime, so the page is one self-contained file: no
// network, no binary asset in the repo. The pattern is a coarse checker, so
// after the editor rewrites an image's width the number of visible squares is
// unmistakable.
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function makeCheckerPng(w: number, h: number, cell = 70): Buffer {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  let o = 0;
  for (let y = 0; y < h; y++) {
    raw[o++] = 0; // filter type: none
    for (let x = 0; x < w; x++) {
      const on = (((x / cell) | 0) + ((y / cell) | 0)) % 2 === 0;
      raw[o++] = on ? 0x4a : 0xf5;
      raw[o++] = on ? 0x90 : 0xfb;
      raw[o++] = on ? 0xd9 : 0xff;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A diagonal hatch as a data URI — the shape our decorations use (~ stripes). */
const HATCH_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12">'
  + '<path d="M0 12L12 0" stroke="#cfe3ff" stroke-width="2"/></svg>';
const HATCH = `url(data:image/svg+xml;base64,${Buffer.from(HATCH_SVG).toString('base64')})`;

const OUT = process.env.PROBE_OUT;

describe('WeChat editor survival probe (manual)', () => {
  const run = OUT ? it : it.skip;

  run('writes the paste-into-WeChat probe page', () => {
    const r = new ThemeResolver({ modifierConfig: { 'blocks.code': { theme: 'oneDark', titleBar: 'darkDots' } } });
    const box = attr(r.getCodeBlockBoxStyle());
    const body = attr(r.getCodeBlockBodyStyle());
    const bar = r.buildCodeTitleBarHtml('typescript');
    const codeStyle = attr(`color:#abb2bf;font-family:"SF Mono",Consolas,monospace;font-size:14px;line-height:1.6`);

    // Variant helpers -------------------------------------------------------
    const sectionBody = (style: string, nb: boolean, code = codeStyle) =>
      `<section style="${style};margin:0"><code style="${code}">${codeHtml(nb)}</code></section>`;
    const tdBody = (style: string, nb: boolean, code = codeStyle) => {
      const cell = style.replace(/overflow-x:\s*auto;?/g, '') + ';border:0;background:transparent';
      return `<section style="overflow-x:auto"><table style="border-collapse:collapse;border-spacing:0;border:0;margin:0;width:auto">`
        + `<tbody><tr><td style="${cell}"><code style="${code}">${codeHtml(nb)}</code></td></tr></tbody></table></section>`;
    };

    // The emission we ship now, and the two shapes it replaced. `body` is the
    // real getCodeBlockBodyStyle() output, so these variants measure the shipped
    // strings rather than a hand-written approximation.
    const bodyShipped = body;
    const bodyPre = body.replace(/white-space:\s*nowrap/g, 'white-space:pre');
    const bodyForcedWrap = body.replace(/white-space:\s*nowrap/g, 'white-space:pre-wrap');
    const HEDGE = 'display:block;width:max-content;min-width:max-content';
    const codeShipped = `${codeStyle};white-space:nowrap;${HEDGE}`;
    const codeNoWrapOnly = `${codeStyle};white-space:nowrap`;
    const codePre = `${codeStyle};white-space:pre`;
    const codeForcedWrap = `${codeStyle};white-space:pre-wrap;${HEDGE}`;

    const label = (t: string) =>
      `<p style="font-size:13px;line-height:1.6;margin:22px 0 6px;color:#111;font-weight:600">${t}</p>`;

    const blocks: string[] = [];

    // ---- 1. code block -----------------------------------------------------
    // 判据只有两条，而且都看**保存之后**的样子：第 1 行长行有没有被折成两行、
    // 第 2 行的 4 空格缩进还在不在。粘贴进来的瞬间五个变体都不折行（pre /
    // nowrap / max-content 都禁止折行），折行是编辑器改写之后才出现的。
    blocks.push(label('【代码块】判据：<b>在编辑器里保存之后</b>，第 1 行长行是否被折成两行；第 2 行的 4 空格缩进是否还在'));
    blocks.push(label('V0 · 上一版发出的结构（<code>section</code> 宿主 + <code>white-space:pre</code>）—— 保存后<b>应当折行</b>。线上那一版就是这么坏的；若它没折行，说明本页探针没生效，后面的结论都别信（对照）'));
    blocks.push(`<section style="${box}">${bar}${sectionBody(bodyPre, true, codePre)}</section>`);

    blocks.push(label('V1 · ★本次修复：正文与 &lt;code&gt; 都用 <code>white-space:nowrap</code>，且 &lt;code&gt; 带 <code>width:max-content;min-width:max-content</code> 兜底 —— 保存后<b>应当不折行、缩进保留，且长行滚到最右端仍留出右侧空白</b>'));
    blocks.push(`<section style="${box}">${bar}${sectionBody(bodyShipped, true, codeShipped)}</section>`);

    blocks.push(label('V2 · 只摘掉兜底（两层仍是 <code>nowrap</code>）—— 若它折行而 V1 不折，说明编辑器把 <code>nowrap</code> 也一起改了，是兜底救回来的'));
    blocks.push(`<section style="${box}">${bar}${sectionBody(bodyShipped, true, codeNoWrapOnly)}</section>`);

    blocks.push(label('V3 · 判别题：&lt;td&gt; 宿主 + <code>white-space:pre</code> —— 若它<b>不</b>折行，说明编辑器「只改非表格元素」，那么 <code>nowrap</code> 在 section/code 上同样保不住、兜底必须留着；若它折行，说明编辑器改的是取值 <code>pre</code> 本身，<code>nowrap</code> 是安全的'));
    blocks.push(`<section style="${box}">${bar}${tdBody(bodyPre, true, codePre)}</section>`);

    blocks.push(label('V4 · 兜底单独生效：正文与 &lt;code&gt; 都是 <code>pre-wrap</code>，只有 &lt;code&gt; 带 <code>width:max-content;min-width:max-content</code> —— 若它<b>不</b>折行，说明最坏情况（两层 <code>nowrap</code> 都被改写成 <code>pre-wrap</code>）也免疫'));
    blocks.push(`<section style="${box}">${bar}${sectionBody(bodyForcedWrap, true, codeForcedWrap)}</section>`);

    const plainBar = bar.replace(/&nbsp;/g, '');
    blocks.push(label('T1 · 标题栏旧写法：圆点里没有文字 —— 保存后整条标题栏应被删掉（对照）'));
    blocks.push(`<section style="${box}">${plainBar}${sectionBody(bodyShipped, true, codeShipped)}</section>`);

    blocks.push(label('T2 · 标题栏现状：每个圆点里放一个 &amp;nbsp; —— 保存后标题栏与三个圆点都还在（此条已在线验证通过）'));
    blocks.push(`<section style="${box}">${bar}${sectionBody(bodyShipped, true, codeShipped)}</section>`);

    const sectionBar = bar
      .replace('<span style="display:flex;align-items:center;justify-content:space-between;', '<section style="display:flex;align-items:center;justify-content:space-between;')
      .replace(/<\/span><\/span>$/, '</span></section>');
    blocks.push(label('T3 · 备用：标题栏外层改用 section —— 保存后应当同 T2'));
    blocks.push(`<section style="${box}">${sectionBar}${sectionBody(bodyShipped, true, codeShipped)}</section>`);

    // ---- 2. watermark ------------------------------------------------------
    blocks.push(label('【文末水印】'));
    blocks.push(label('W1 · 旧写法 <code>div</code> 水印 —— 期望：整条消失（对照；这条就是线上丢失的那一行）'));
    blocks.push(
      '<div style="text-align:right;margin-top:20px;padding-bottom:4px;">'
      + '<span style="color:#b0b0b0;font-style:italic;font-size:12px;line-height:1.6;">published by wewrite@obsidian</span></div>',
    );

    blocks.push(label('W2 · 本次修复 <code>section</code> 水印 —— 期望：右下角浅灰斜体小字还在'));
    blocks.push(buildArticleWatermark());

    blocks.push(label('W3 · 备用 <code>p</code> 水印 —— 期望：同 W2（用来判断 section 与 p 哪个更稳）'));
    blocks.push(buildArticleWatermark().replace(/^<section/, '<p').replace(/<\/section>$/, '</p>'));

    blocks.push(label('D1 · 对照组：一个只有文字的 <code>div</code> —— 期望：消失。若它还在，说明 div 没被删，W1 的消失另有原因'));
    blocks.push('<div style="color:#111;font-size:14px">D1 这一行如果还在，说明 div 本身没被删。</div>');

    // ---- 3. images ---------------------------------------------------------
    const png = `data:image/png;base64,${makeCheckerPng(700, 260).toString('base64')}`;
    const img = (style: string) => `<p style="margin:0"><img src="${png}" alt="" style="${attr(style)}"></p>`;

    const deco = {
      maxWidth: '100%',
      display: 'block',
      align: 'center',
      radius: '8px',
      shadow: '0 4px 8px rgba(0,0,0,0.1)',
    };
    // The encoding shipped before 2026-09-22: bare width + a 100% cap.
    const oldExplicit =
      'max-width:100%;width:200px;height:auto;border-radius:8px;'
      + 'box-shadow:0 4px 8px rgba(0,0,0,0.1);display:block;margin:0.5rem auto 0.5rem';
    const newExplicit = buildImageStyle(deco, { width: 200 });
    const narrowCap = buildImageStyle({ ...deco, maxWidth: '94%' });
    const fullBleed = buildImageStyle(deco);

    blocks.push(label('【图片宽度】每块下面的方块个数就是它渲染出来的宽度，四张的原始尺寸一样'));
    blocks.push(label('I1 · 旧写法 max-width:100% + width:200px —— 期望：被拉成整栏（这就是被修掉的 bug）'));
    blocks.push(img(oldExplicit));
    blocks.push(label('I2 · 新写法 max-width:200px + width:100% —— 期望：仍然是窄的 200px'));
    blocks.push(img(newExplicit));
    blocks.push(label('I3 · 主题参数 max-width:94%（没有显式宽度）—— 期望：比整栏窄一点点。若被拉满，说明编辑器会强写 max-width，得另想办法'));
    blocks.push(img(narrowCap));
    blocks.push(label('I4 · 没有指定宽度 —— 期望：满栏（本来就是对的，对照）'));
    blocks.push(img(fullBleed));

    const figParams = {
      ...deco,
      figureBg: '#f6f8fa',
      figurePadding: '10px',
      captionColor: '#8a919f',
      captionFontSize: '0.9em',
      captionFontWeight: '400',
      captionAlign: 'center',
      captionMarginTop: '0.4em',
      captionWidth: 'auto',
      captionTriangle: 'none',
    };
    const figStyle = attr(buildFigureStyle(figParams));
    const capStyle = attr(buildCaptionStyle(figParams));
    blocks.push(label('C1 · 图注 <code>figure</code> + <code>figcaption</code> —— 期望：灰底卡片、图片、以及下面那行 12px 图注都在。若整块消失，说明 figure 会像 div 一样被去掉'));
    blocks.push(
      `<figure style="${figStyle}"><img src="${png}" alt="" style="${attr(fullBleed)}">`
      + `<figcaption style="${capStyle}">图注：检查这一行是否幸存。</figcaption></figure>`,
    );

    // ---- 4. carousel -------------------------------------------------------
    const slideStyle = attr(toImageSliderSlide(fullBleed, '0.5rem'));
    blocks.push(label('【图片轮播】'));
    blocks.push(label('S1 · <code>section overflow-x:auto + scroll-snap-type</code>，里面三张 100% 宽的滑片 —— 期望：三张并排不堆叠，容器能横向滑，下面那行提示文字还在'));
    const slides = Array.from({ length: 3 }, () => `<img src="${png}" alt="" style="${slideStyle}">`).join('');
    blocks.push(
      `<section style="${attr(buildImageSliderStyle('0.5rem'))}">${slides}</section>`
      + '<p style="text-align:center;font-size:12px;line-height:1.6;color:#8a919f;margin:0.25rem 0 0">共 3 张 · 左右滑动查看</p>',
    );

    // ---- 5. blocks this article never exercised ----------------------------
    blocks.push(label('【这份样本没覆盖到的元素】'));
    const inlineGrad =
      '<span style="background-image:linear-gradient(135deg,#0366d6,#7b5cf0);background-clip:text;'
      + '-webkit-background-clip:text;color:transparent;font-weight:600">G1 渐变文字</span>';
    blocks.push(label('G1 · inline 渐变文字（<code>background-clip:text</code> + <code>color:transparent</code>）—— 期望：文字带渐变。若这一段整行看不见，说明编辑器丢了 background-clip 却留着 transparent，文字会彻底消失（严重）'));
    blocks.push(`<p style="font-size:16px;line-height:1.8;margin:6px 0">${inlineGrad}，后面的普通文字应当照常显示。</p>`);

    blocks.push(label('B1 · <code>blockquote</code> 装饰：data-URI 的 <code>border-image</code> 花纹 —— 期望：淡蓝斜纹边框。<b>若看到一圈鲜红实边，说明数据 URI 花纹被编辑器丢了</b>（红是刻意设的兜底色，真的 border-image 在时它永不显形）'));
    blocks.push(
      `<blockquote style="border:8px solid #ff0000;border-image:${HATCH} 8;border-radius:10px;`
      + 'padding:12px 14px;background:#f7faff;color:#333;margin:12px 0">'
      + '<p style="margin:0;font-size:15px;line-height:1.8">B1 装饰引用块：花纹是否幸存（见到红边＝花纹丢了）。</p></blockquote>',
    );

    blocks.push(label('B2 · <code>blockquote</code> 渐变底 + 渐变左边条（<code>border-image:linear-gradient</code>）—— 期望：渐变底与彩色左条都在'));
    blocks.push(
      '<blockquote style="background:linear-gradient(135deg,#e8f1ff,#ffffff);border-left:4px solid transparent;'
      + 'border-image:linear-gradient(to bottom,#0366d6,#7b5cf0) 1;border-radius:10px;padding:12px 14px;color:#333;margin:12px 0">'
      + '<p style="margin:0;font-size:15px;line-height:1.8">B2 渐变引用块：底色渐变与左条渐变是否幸存。</p></blockquote>',
    );

    // ---- page --------------------------------------------------------------
    const page = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>WeWrite · 微信编辑器存活探针</title>
<style>body{margin:0;padding:16px;background:#fff;font:15px/1.7 system-ui,"PingFang SC","Microsoft YaHei",sans-serif;color:#111}
.wrap{width:375px;margin:0 auto}code{font-family:Consolas,monospace}
blockquote{margin-left:0;margin-right:0}</style></head>
<body><div class="wrap">
<section style="background:#fff7e6;border:1px solid #ffd591;border-radius:6px;padding:12px 14px;margin:0 0 10px">
<p style="margin:0;font-size:13px;font-weight:600">用法：在浏览器里全选本页 → 复制 → 粘贴进公众号编辑器（或粘贴后存草稿、再打开、再预览），逐个核对下面每块的说明文字与它上面的期望。测完把这些说明文字删掉即可。</p>
</section>
${blocks.join('\n')}
</div></body></html>`;

    const out = path.resolve(OUT!);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, page, 'utf8');
    expect(page).toContain('V1');
    expect(page).toContain('&nbsp;');
    expect(page).toContain('W2');
    expect(page).toContain('data:image/png;base64,');
  });
});
