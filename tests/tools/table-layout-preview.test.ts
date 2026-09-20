/**
 * A preview *generator*, not an assertion suite.
 *
 * Renders the table layout policy's real output (`WechatRenderer` + the theme's
 * table decoration) into a static page, so a human can check the cell-width
 * decision by eye: which values stay on one line, which wrap, and what a table
 * wider than the article does on a narrow screen. Those are geometry questions
 * — only a browser can answer them. Writes nothing unless asked, so CI stays
 * side-effect free:
 *
 *   PREVIEW_OUT=.workbuddy/table-layout-preview npx jest tests/tools/table-layout-preview.test.ts
 *
 * The output directory must live inside the repo: the sandbox used for
 * development blocks writes to the system temp directory.
 */
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;

import * as fs from 'fs';
import * as path from 'path';
import { WechatRenderer } from '../../src/renderer/wechat-renderer';
import { DEFAULT_PRESET } from '../../src/renderer/theme-resolver';
import { parseTableFrontmatter } from '../../src/core/table-config';
import { parseFlatFrontmatter } from '../../src/core/frontmatter-parser';

const OUT = process.env.PREVIEW_OUT;

/** 定价表 —— 用户截图里的问题现场：Price / Status / Note 三列都在折返。 */
const ARTICLE_HEAD = [
	'<p>下面这张定价表就是问题现场：小屏上 Price / Status / Note 三列都出现了折返，'
	+ '「¥199/年」被从斜杠处断开，「Discontinued」被拆成两行。</p>',
	'<table><thead><tr><th>Product</th><th>Price</th><th>Status</th><th>Note</th></tr></thead><tbody>',
	'<tr><td><strong>WeWrite Pro</strong></td><td>¥199/年</td><td>✅ Available</td><td>Best seller</td></tr>',
	'<tr><td>WeWrite Basic</td><td>¥99/年</td><td>✅ Available</td><td><em>Limited features</em></td></tr>',
	'<tr><td>WeWrite Trial</td><td>¥49/月</td><td>❌ Discontinued</td><td>See <code>free tier</code></td></tr>',
	'<tr><td>Enterprise</td><td>联系我们</td><td>⏳ Coming Soon</td><td>Contact <code>sales</code></td></tr>',
	'</tbody></table>',
].join('');

/** 长文本 —— 必须照常换行，否则一段话就把表格撑到无限宽。 */
const ARTICLE_MID = [
	'<p>长文本不受宽度上限的保护，仍然按普通段落换行：</p>',
	'<table><thead><tr><th>能力</th><th>说明</th></tr></thead><tbody>',
	'<tr><td>宽度策略</td><td>单元格内容短就保持单行，超长就照常换行；整张表还会做一次总宽评估，'
	+ '超过预算时让最宽的那几格先折行，而不是把短值也一起挤折。</td></tr>',
	'<tr><td>溢出处理</td><td>表格按内容定宽，超过正文宽度时由外层容器出现横向滚动条，'
	+ '而不是压缩列宽——所以大屏小屏看到的都是同一套列宽。</td></tr>',
	'</tbody></table>',
].join('');

/** 多列短值 —— 全部保持单行，于是表格比正文宽，靠滚动条看全。 */
const ARTICLE_TAIL = [
	'<p>下面这张表每一格都是短值，全都不该折行；它比手机正文略宽，因此小屏上出现横向滚动条：</p>',
	'<table><thead><tr><th>平台</th><th>Windows</th><th>macOS</th><th>Linux</th>'
	+ '<th>iOS</th><th>Android</th><th>Web</th></tr></thead><tbody>',
	'<tr><td>支持情况</td><td>✅ 已支持</td><td>✅ 已支持</td><td>✅ 已支持</td>'
	+ '<td>✅ 已支持</td><td>✅ 已支持</td><td>✅ 已支持</td></tr>',
	'</tbody></table>',
].join('');

const ARTICLE = ARTICLE_HEAD + ARTICLE_MID + ARTICLE_TAIL;

function render(): string {
	const { config, customDecorations } = parseTableFrontmatter({ 'blocks.table.decoration': 'orange' });
	const { config: modifierConfig } = parseFlatFrontmatter({ 'blocks.table.decoration': 'orange' });
	const preset = {
		...DEFAULT_PRESET,
		modifierConfig,
		tableConfig: config,
		customTableDecorations: customDecorations,
	};
	return new WechatRenderer(preset as never).processPreRenderedHtml(ARTICLE, '').html;
}

function phone(title: string, note: string, article: string, width: number): string {
	return `<figure class="col">
	<figcaption><b>${title}</b><span>${note}</span></figcaption>
	<div class="phone" style="width:${width}px">${article}</div>
</figure>`;
}

describe('table layout preview', () => {
	const run = OUT ? it : it.skip;

	run('writes the preview page', () => {
		const article = render();

		// 基本自检：策略确实生效了
		expect(article).toContain('width:fit-content');
		expect(article).toContain('white-space:nowrap');
		expect(article).toContain('white-space:normal');

		const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<title>WeWrite · 表格宽度策略预览</title>
<style>
	:root { color-scheme: light; }
	body { margin:0; padding:24px; background:#eef1f5; font-family:-apple-system,"Segoe UI","Microsoft YaHei",sans-serif; color:#1f2933; }
	h1 { font-size:18px; margin:0 0 4px; }
	.lead { font-size:13px; color:#5b6570; margin:0 0 18px; }
	.row { display:flex; gap:20px; align-items:flex-start; flex-wrap:wrap; margin-bottom:34px; }
	.col { margin:0; }
	figcaption { display:flex; flex-direction:column; gap:2px; margin-bottom:8px; font-size:13px; }
	figcaption span { color:#5b6570; font-size:12px; }
	.phone { background:#fff; border-radius:6px; box-shadow:0 2px 14px rgba(15,23,42,.13); overflow:hidden; }
	.hint { font-size:12px; color:#5b6570; background:#fff; border-left:3px solid #ff6b35; padding:8px 12px; margin:0 0 26px; max-width:820px; line-height:1.7; }
	.hint code { background:#f2f4f7; padding:0 3px; border-radius:3px; }
</style></head><body>
<h1>WeWrite · 表格宽度策略</h1>
<p class="lead">用真实渲染管线 + 内置「暖橙」表格装饰输出，只是容器宽度不同。表格内容与文档完全一致。</p>

<p class="hint">
	规则：内容够短的单元格（≤12em）<b>保持单行</b>并决定列宽，超长的照常换行；整张表再按「总宽 ≤48em」做一次评估，
	超预算时让<b>最宽</b>的几格先放弃单行。表格自身 <code>width:fit-content</code>，
	外层容器 <code>overflow-x:auto</code> —— 所以大屏小屏<b>列宽一样</b>，小屏靠横向滚动看全，而不是把列压窄。
</p>

<div class="row">
	${phone('手机 375px', '与发布后的手机正文等宽', article, 375)}
	${phone('大屏手机 414px', '', article, 414)}
	${phone('平板 768px', '内容不再溢出，无滚动条', article, 768)}
</div>
</body></html>`;

		const dir = OUT as string;
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(path.join(dir, 'table-layout-preview.html'), html, 'utf8');
	});
});
