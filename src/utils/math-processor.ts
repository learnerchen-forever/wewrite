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
 *  Two-pass approach: first strip $$...$$ blocks (replacing with markers),
 *  then extract $...$ inline from remaining text. Markers track document
 *  position so formulas can be sorted back into original order. */
export function extractMathFormulas(markdown: string): MathFormula[] {
	const items: Array<{ tex: string; display: boolean; pos: number }> = [];

	// Pass 1: $$...$$ block math — replace with placeholder, record position
	const blockRx = /\$\$([^$]+)\$\$/g;
	markdown.replace(blockRx, (_full, tex, offset) => {
		items.push({ tex: (tex as string).trim(), display: true, pos: offset as number });
		return '';
	});

	// Pass 2: $...$ inline math (not $$) — record position
	// Use (^|[^$]) instead of negative lookbehind (?<!\$) for iOS 15.7 compatibility
	const inlineRx = /(^|[^$])\$([^$\s](?:[^$]|\$[^\s])*?)\$(?!\$)/g;
	inlineRx.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = inlineRx.exec(markdown)) !== null) {
		// m[2] is the tex content, m.index + m[1].length points to the opening $
		items.push({ tex: m[2].trim(), display: false, pos: m.index + m[1].length });
	}

	// Sort by position in original markdown
	items.sort((a, b) => a.pos - b.pos);
	return items.map(({ tex, display }) => ({ tex, display }));
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
