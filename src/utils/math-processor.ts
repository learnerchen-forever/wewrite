// Shared math → SVG conversion for rendered markdown.
// Used by both the WeChat news view and the theme editor preview so formulas
// survive the pipeline (WeChat strips MathJax <mjx-*> elements, and raw
// <mjx-container> output is not usable as final HTML).

import { latexToSvg } from '../renderer/math-to-svg';
import { sanitizeSvgElement } from '../renderer/wechat-svg-sanitizer';
import { createLogger } from './logger';

const log = createLogger('MathProcessor');

export interface MathFormula {
	tex: string;
	display: boolean;
}

/** Extract math formulas from markdown in document order.
 *
 *  Fenced code blocks (``` ... ``` / ~~~ ... ~~~) and inline code spans
 *  (`...`) are skipped: Obsidian/MathJax never renders `$...$` inside code,
 *  but a naive scan would pair an opening `$` in one code fragment with a
 *  closing `$` in another and invent a bogus formula (e.g. `${id}` …
 *  `${statusText}` inside a JS sample produced "7 formulas / 6 containers"
 *  in the theme editor preview).
 *
 *  Remaining text is scanned in two passes: first $$...$$ blocks, then
 *  $...$ inline. Positions are tracked so formulas can be sorted back into
 *  original document order. */
export function extractMathFormulas(markdown: string): MathFormula[] {
	const items: Array<{ tex: string; display: boolean; pos: number }> = [];

	// Walk the markdown, scanning only the segments outside code.
	const codeRx = /```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`/g;
	let cursor = 0;
	let m: RegExpExecArray | null;
	while ((m = codeRx.exec(markdown)) !== null) {
		if (m.index > cursor) {
			collectMathFormulas(items, markdown.slice(cursor, m.index), cursor);
		}
		cursor = m.index + m[0].length;
	}
	if (cursor < markdown.length) {
		collectMathFormulas(items, markdown.slice(cursor), cursor);
	}

	// Sort by position in original markdown
	items.sort((a, b) => a.pos - b.pos);
	return items.map(({ tex, display }) => ({ tex, display }));
}

/** Two-pass scan of a code-free segment: $$...$$ blocks, then $...$ inline. */
function collectMathFormulas(
	items: Array<{ tex: string; display: boolean; pos: number }>,
	text: string,
	basePos: number,
): void {
	// Pass 1: $$...$$ block math — replace with placeholder, record position
	const blockRx = /\$\$([^$]+)\$\$/g;
	text.replace(blockRx, (_full, tex, offset) => {
		items.push({ tex: (tex as string).trim(), display: true, pos: basePos + (offset as number) });
		return '';
	});

	// Pass 2: $...$ inline math (not $$) — record position
	// Use (^|[^$]) instead of negative lookbehind (?<!\$) for iOS 15.7 compatibility
	const inlineRx = /(^|[^$])\$([^$\s](?:[^$]|\$[^\s])*?)\$(?!\$)/g;
	inlineRx.lastIndex = 0;
	let mm: RegExpExecArray | null;
	while ((mm = inlineRx.exec(text)) !== null) {
		// mm[2] is the tex content, mm.index + mm[1].length points to the opening $
		items.push({ tex: mm[2].trim(), display: false, pos: basePos + mm.index + mm[1].length });
	}
}

/** Convert MathJax <mjx-container> elements in a rendered container to
 *  WeChat-compatible SVG wrappers. Falls back to the original CHTML when
 *  a formula cannot be converted (invalid LaTeX, count mismatch). */
export async function processMathToSvg(container: HTMLElement, markdown: string): Promise<void> {
	const formulas = extractMathFormulas(markdown);
	const mjxContainers = Array.from(container.querySelectorAll('mjx-container'));
	log.info('processMathToSvg', { formulasFound: formulas.length, mjxContainersFound: mjxContainers.length });
	if (formulas.length === 0) return;
	if (mjxContainers.length !== formulas.length) {
		log.warn('processMathToSvg: formula/container count mismatch',
			{ formulas: formulas.length, containers: mjxContainers.length });
	}

	let converted = 0;
	const limit = Math.min(mjxContainers.length, formulas.length);
	for (let i = 0; i < limit; i++) {
		const mjx = mjxContainers[i];
		const formula = formulas[i];
		if (!mjx.parentNode) continue;

		const svgString = await latexToSvg(formula.tex, formula.display);
		if (!svgString) continue; // invalid LaTeX — leave original CHTML

		// Parse the SVG string to a DOM element for sanitization
		const tmp = document.createElement('div');
		tmp.innerHTML = svgString;
		const svgEl = tmp.firstElementChild;
		if (!svgEl) continue;

		// Apply WeChat SVG attribute whitelist sanitization
		sanitizeSvgElement(svgEl);

		const sanitized = svgEl.outerHTML || new XMLSerializer().serializeToString(svgEl);

		const wrapper = document.createElement(formula.display ? 'section' : 'span');
		if (formula.display) {
			wrapper.setAttribute('style', 'text-align:center;display:block;margin:16px 0');
		} else {
			wrapper.setAttribute('style', 'display:inline-block;vertical-align:middle');
		}
		wrapper.innerHTML = sanitized;
		// Mark math SVGs so content prescan doesn't deduplicate/convert them
		const mathSvg = wrapper.querySelector('svg');
		if (mathSvg) mathSvg.classList.add('wewrite-math');
		mjx.parentNode.replaceChild(wrapper, mjx);
		converted++;
	}

	if (converted > 0) {
		log.info(`processMathToSvg: converted ${converted}/${limit} formulas to SVG`);
	}
}
