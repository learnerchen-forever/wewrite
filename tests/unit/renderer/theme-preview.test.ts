// Manual preview harness — skipped unless PREVIEW_OUT is set, so CI never
// writes files. Renders an article fragment through the real pipeline for each
// shipped theme and drops one HTML page per theme (plus an index) into
// PREVIEW_OUT, ready for a headless-Chrome screenshot.
//
//   PREVIEW_OUT=.workbuddy/theme-refactor/preview \
//     npx jest tests/unit/renderer/theme-preview.test.ts
//
// The fixtures mirror what Obsidian's preview hands the renderer, so this is
// the same code path a published article takes.

import * as fs from 'fs';
import * as path from 'path';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;

import { BUILTIN_PRESETS } from '../../../src/styles/style-template';
import type { ThemePreset } from '../../../src/core/interfaces';
import { parseFrontmatter } from '../../../src/utils/frontmatter';
import { parseFlatFrontmatter } from '../../../src/core/frontmatter-parser';
import { applyThemeFamilies } from '../../../src/core/theme-config-apply';
import { frontmatterToThemePreset } from '../../../src/renderer/theme-resolver';
import { WechatRenderer } from '../../../src/renderer/wechat-renderer';

const OUT = process.env.PREVIEW_OUT;
const THEMES_DIR = path.join(__dirname, '..', '..', '..', 'themes');
const IMG_DIR = path.join(__dirname, '..', '..', '..', '.workbuddy', 'theme-refactor');

const THEME_FILES = [
  '001-晨曦蓝调.md', '002-青竹雅韵.md', '003-落日熔金.md', '004-星河夜航.md', '005-雨过天青.md',
  '006-素笺工笔.md', '007-鎏金古典.md', '008-樱粉温柔.md', '009-深海静谧.md', '010-麦浪秋色.md',
];

// The three images at the end are the three shapes an image can arrive in:
//   1. `![[pic.png]]`      → no width/height attributes → fills the column
//   2. `![[pic.png|200x150]]` → width+height attributes  → exact size
//   3. a width wider than the column                     → clamped, proportion kept
const BODY = `
<h1>秋日读书笔记</h1>
<p>这是一段正文段落，用来检查行高、字距与段间距是否舒服。其中包含<strong>加粗要点</strong>、<em>斜体书名</em>、<del>删除线</del>、<mark>高亮标记</mark>、<code>inline_code()</code> 以及<a href="https://example.com">一个外链</a>，末尾还有<a href="#" class="tag">#标签</a>。文章较长时，正文颜色要足够沉稳，装饰只出现在该出现的地方。</p>
<h2>一张窄表</h2>
<table><thead><tr><th>项目</th><th>说明</th></tr></thead><tbody>
<tr><td>行高</td><td>1.8 倍</td></tr>
<tr><td>字号</td><td>16px</td></tr>
<tr><td>边距</td><td>8px</td></tr>
</tbody></table>
<h2>一张宽表</h2>
<table><thead><tr><th>Decoration identifier</th><th>中文名称</th><th>适用场景</th></tr></thead><tbody>
<tr><td>lightShadow</td><td>光影留白</td><td>通用图片卡片</td></tr>
<tr><td>captionPaper</td><td>笺注图文</td><td>带图注的长文</td></tr>
</tbody></table>
<h3>代码块</h3>
<pre><code class="language-typescript">interface ThemePreset {
  accentColor?: string;
  headingConfig?: HeadingConfig;
}

const theme = resolveTheme('builtin:github');</code></pre>
<blockquote><p>引用块的第一段，用来检查左侧引线与内边距是否协调。</p><p>引用块第二段，检查段间距。</p></blockquote>
<section data-wewrite-callout="tip" style="background-color:rgba(7,193,96,0.1);border-radius:4px;padding:16px;margin:16px 0;">
<section data-wewrite-callout-title="" style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font-weight:600;font-size:16px;"><span style="display:inline-block;width:18px;height:18px;"></span><span>技巧</span></section>
<section data-wewrite-callout-body="" style="color:#222222;"><p style="margin:0;">这是一段提示框正文，用来检查标注框的底色、圆角与上下间距。</p></section>
</section>
<ul><li>无序列表项一</li><li>无序列表项二<ul><li>嵌套列表项</li></ul></li><li>无序列表项三</li></ul>
<ol><li>有序列表项一</li><li>有序列表项二</li></ol>
<ul class="contains-task-list"><li><input type="checkbox">待办事项一</li><li><input type="checkbox" checked>已完成事项</li></ul>
<hr>
<p><img src="../wide.png" alt="未指定尺寸"></p>
<p><img src="../narrow.png" alt="指定尺寸" width="200" height="150"></p>
<p><img src="../wide.png" alt="超出栏宽" width="1200" height="800"></p>
`;

function loadThemeNote(file: string): ThemePreset {
  const fm = parseFrontmatter(fs.readFileSync(path.join(THEMES_DIR, file), 'utf8')) as Record<string, unknown>;
  const preset = frontmatterToThemePreset(fm)!;
  const { config } = parseFlatFrontmatter(fm);
  if (Object.keys(config).length > 0) preset.modifierConfig = config;
  applyThemeFamilies(preset, fm);
  return preset;
}

function allThemes(): Array<{ label: string; preset: ThemePreset }> {
  return [
    ...Object.entries(BUILTIN_PRESETS).map(([id, preset]) => ({ label: `内置 ${id}`, preset })),
    ...THEME_FILES.map((file) => ({ label: `打包 ${file.replace(/\.md$/, '')}`, preset: loadThemeNote(file) })),
  ];
}

const PAGE = (title: string, body: string) => `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>${title}</title>
<style>
  html, body { margin: 0; padding: 0; background: #eef1f5; }
  .wrap { width: 375px; margin: 0 auto; }
  .frame { background: #fff; }
</style></head><body><div class="wrap"><div class="frame">${body}</div></div></body></html>`;

describe('theme preview (manual)', () => {
  const run = OUT ? it : it.skip;

  run('writes one page per shipped theme', () => {
    const dir = path.resolve(OUT!);
    fs.mkdirSync(dir, { recursive: true });
    const themes = allThemes();

    const cards: string[] = [];
    for (const { label, preset } of themes) {
      const { html } = new WechatRenderer(preset).processPreRenderedHtml(BODY, 'preview.md');
      const safe = label.replace(/[^\w\u4e00-\u9fff-]+/g, '_');
      fs.writeFileSync(path.join(dir, `${safe}.html`), PAGE(label, html), 'utf8');
      cards.push(`<section style="margin:0 0 24px">
  <div style="font:600 13px/1.6 system-ui;color:#334;padding:6px 0">${label}</div>
  <iframe src="${safe}.html" style="width:375px;height:1500px;border:1px solid #cbd5e1;background:#fff"></iframe>
</section>`);
    }

    fs.writeFileSync(
      path.join(dir, 'index.html'),
      `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>WeWrite 主题预览</title>
<style>body{margin:0;padding:24px;background:#eef1f5;font:14px/1.6 system-ui}
.grid{display:flex;flex-wrap:wrap;gap:24px}.grid>section{margin:0!important}</style></head>
<body><h1 style="font:600 20px system-ui">WeWrite 主题预览（${themes.length} 个）</h1><div class="grid">${cards.join('')}</div></body></html>`,
      'utf8',
    );

    expect(themes).toHaveLength(20);
    // Keep the image path honest — the fixtures reference these files.
    expect(fs.existsSync(path.join(IMG_DIR, 'wide.png'))).toBe(true);
  });
});
