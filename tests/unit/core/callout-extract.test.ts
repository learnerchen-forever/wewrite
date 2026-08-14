import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;

import { extractCalloutFromHtml, detectCalloutType } from '../../../src/core/callout-extract';
import { CALLOUT_TYPES } from '../../../src/core/callout-decoration-types';

const WARNING_HTML =
	'<section style="padding:1em 1em 1em 1.5em;border-radius:4px;color:rgb(241,196,15);background:linear-gradient(120deg, rgba(241,196,15,0.1) 0%, transparent 100%);margin:1em 0;">' +
	'<section style="display:flex;align-items:center;font-weight:600;">' +
	'<span style="display:inline-block;width:18px;height:18px;"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/></svg></span>' +
	'<span>Warning</span></section>' +
	'<section style="color:rgb(34,34,34);"><p>以上总结仅供参考</p></section>' +
	'</section>';

describe('detectCalloutType', () => {
	it('maps common title keywords to the right types', () => {
		expect(detectCalloutType('Warning')).toBe('warning');
		expect(detectCalloutType('Tip')).toBe('tip');
		expect(detectCalloutType('Info')).toBe('info');
		expect(detectCalloutType('Note')).toBe('note');
		expect(detectCalloutType('Summary')).toBe('abstract');
		expect(detectCalloutType('Done')).toBe('success');
		expect(detectCalloutType('Question')).toBe('question');
		expect(detectCalloutType('Failure')).toBe('failure');
		expect(detectCalloutType('Danger')).toBe('danger');
		expect(detectCalloutType('Bug')).toBe('bug');
		expect(detectCalloutType('Example')).toBe('example');
		expect(detectCalloutType('Quote')).toBe('quote');
		expect(detectCalloutType('Todo')).toBe('todo');
	});
});

describe('extractCalloutFromHtml', () => {
	it('extracts shape params, colors, icon and covers all 13 types', () => {
		const extracted = extractCalloutFromHtml(WARNING_HTML)!;
		expect(extracted).not.toBeNull();
		expect(extracted.type).toBe('warning');
		expect(extracted.name).toContain('Warning');

		const { decoration } = extracted;
		expect(decoration.id).toMatch(/^custom_/);
		expect(decoration.builtin).toBe(false);
		expect(decoration.params.padding.default).toBe('1em 1em 1em 1.5em');
		expect(decoration.params.marginY.default).toBe('1em');
		expect(decoration.params.marginX.default).toBe('0');
		expect(decoration.params.radius.default).toBe('4');
		expect(decoration.params.bgAlpha.default).toBe('0.1');
		expect(decoration.params.bgMode.default).toBe('gradient');
		expect(decoration.params.gradientAngle.default).toBe('120deg');

		const warning = decoration.types.warning!;
		expect(warning.titleColor).toBe('rgb(241,196,15)');
		expect(warning.background).toContain('linear-gradient(120deg, rgba(241,196,15,0.1)');
		expect(warning.icon).toContain('m21.73 18');
		expect(warning.textColor).toBe('rgb(34,34,34)');

		// The remaining 12 types are filled with Obsidian colors + same recipe.
		for (const t of CALLOUT_TYPES) {
			const style = decoration.types[t];
			expect(style).toBeDefined();
			expect(style!.titleColor).toBeTruthy();
			expect(style!.background).toBeTruthy();
		}
		const note = decoration.types.note!;
		expect(note.titleColor).toBe('#448aff');
		expect(note.background).toBe('linear-gradient(120deg, rgba(68,138,255,0.1) 0%, transparent 100%)');
	});

	it('detects solid backgrounds and derives solid tints', () => {
		const html =
			'<section style="background-color:rgba(8,109,221,0.1);padding:16px;">' +
			'<section style="font-weight:600;"><span>Info</span></section>' +
			'<section><p>内容</p></section>' +
			'</section>';
		const extracted = extractCalloutFromHtml(html)!;
		expect(extracted.type).toBe('info');
		expect(extracted.decoration.params.bgMode.default).toBe('solid');
		expect(extracted.decoration.types.note?.background).toBe('rgba(68,138,255,0.1)');
	});
});
