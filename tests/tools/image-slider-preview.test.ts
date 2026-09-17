/**
 * A preview *generator*, not an assertion suite.
 *
 * Renders the image pipeline's real output (`WechatRenderer`) into a static
 * HTML page so a human can check "图片上下边距" and "图片滑动窗" by eye —
 * the two behaviours are spacing and swipe geometry, which only a browser can
 * show. Writes nothing unless asked, so CI stays side-effect free:
 *
 *   PREVIEW_OUT=.workbuddy/slider-preview npx jest tests/tools/image-slider-preview.test.ts
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

const OUT = process.env.PREVIEW_OUT;

function svg(label: string, w: number, h: number, color: string): string {
	const s = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'><rect width='${w}' height='${h}' fill='%23${color}'/><text x='50%' y='50%' fill='white' font-family='sans-serif' font-size='30' text-anchor='middle'>${label}</text></svg>`;
	return `data:image/svg+xml;utf8,${s.replace(/#/g, '%23')}`;
}

function img(label: string, w: number, h: number, color: string): string {
	return `<img src="${svg(label, w, h, color)}" alt="">`;
}

/** 正文 → 图片窗（3 张无空行相邻）→ 正文 → 单独一张（空行分隔）。 */
const MD = [
	'<p>这是一段正文，用来检查图片与上下文字的间距是否够用。',
	img('A', 400, 200, '0ea5e9'),
	img('B', 200, 300, '8b5cf6'),
	img('C', 400, 200, 'f97316'),
	'</p>',
	'<p>上面三张之间没有空行，应当合并成一个图片窗。',
	img('D', 400, 200, '10b981'),
	'</p>',
	'<p>下面这张与上面的图片之间有空行，应当独立成图：</p>',
	'<p>' + img('E', 300, 300, 'ef4444') + '</p>',
	'<p>结尾段落，再次检查图文间距。</p>',
].join('');

function render(slider: boolean, marginY: string, decoration?: 'lightShadow') {
	const preset = {
		...DEFAULT_PRESET,
		imageConfig: { slider, marginY, ...(decoration ? { decoration } : {}) },
	};
	return new WechatRenderer(preset as never).processPreRenderedHtml(MD, '').html;
}

function phone(title: string, note: string, article: string): string {
	return `<figure class="col">
	<figcaption><b>${title}</b><span>${note}</span></figcaption>
	<div class="phone">${article}</div>
</figure>`;
}

describe('image slider preview', () => {
	const run = OUT ? it : it.skip;

	run('writes the preview page', () => {
		const on = render(true, '0.5rem', 'lightShadow');
		const off = render(false, '0.5rem', 'lightShadow');
		const none = render(false, '0', 'lightShadow');
		const wide = render(false, '1.5rem', 'lightShadow');
		const bare = render(false, '0.5rem'); // 无装饰（v3 回退路径）也要吃边距

		// 基本自检：开关确实改变了输出
		expect(on).toContain('overflow-x:auto');
		expect(off).not.toContain('overflow-x:auto');

		const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<title>WeWrite · 图片滑动窗 / 上下边距 预览</title>
<style>
	:root { color-scheme: light; }
	body { margin:0; padding:24px; background:#eef1f5; font-family:-apple-system,"Segoe UI","Microsoft YaHei",sans-serif; color:#1f2933; }
	h1 { font-size:18px; margin:0 0 4px; }
	.lead { font-size:13px; color:#5b6570; margin:0 0 22px; }
	.row { display:flex; gap:20px; align-items:flex-start; flex-wrap:wrap; margin-bottom:34px; }
	.col { margin:0; }
	figcaption { display:flex; flex-direction:column; gap:2px; margin-bottom:8px; font-size:13px; }
	figcaption span { color:#5b6570; font-size:12px; }
	.phone { width:375px; background:#fff; border-radius:6px; box-shadow:0 2px 14px rgba(15,23,42,.13); overflow:hidden; }
	.hint { font-size:12px; color:#5b6570; background:#fff; border-left:3px solid #0ea5e9; padding:8px 12px; margin:0 0 34px; max-width:760px; }
</style></head><body>
<h1>WeWrite · 图片滑动窗 / 图片上下边距</h1>
<p class="lead">用真实渲染管线输出，模拟公众号正文宽度 375px。左右滑动图片窗即为最终效果。</p>

<p class="hint">全文图片之间都<b>没有空行</b>的 A / B / C 三张会被合并进一个图片窗（开关关闭时各自占一行）；
D 与 E 各自是独立段落，不参与合并。所有图片上下边距由同一个参数 <code>media.image.marginY</code> 控制。</p>

<div class="row">
	${phone('开关 OFF', '每张图独立成行', off)}
	${phone('开关 ON', 'A/B/C 合并为左右滑动窗', on)}
</div>

<div class="row">
	${phone('marginY: 0', '图文与图图之间几乎没有间距', none)}
	${phone('marginY: 0.5rem（默认）', '', off)}
	${phone('marginY: 1.5rem', '', wide)}
	${phone('无图片装饰的主题', '回退路径同样吃 marginY', bare)}
</div>
</body></html>`;

		const dir = OUT as string;
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(path.join(dir, 'image-slider-preview.html'), html, 'utf8');
	});
});
