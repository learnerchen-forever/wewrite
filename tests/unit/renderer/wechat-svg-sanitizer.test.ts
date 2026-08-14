// C1 regression: <use> inlining must terminate and produce correct clones.
// The previous implementation (`while (refEl.firstChild) g.appendChild(refEl.firstChild.cloneNode(true))`)
// never detached the source node, so any <use> pointing at a def with children
// (e.g. MathJax stretchy brackets) hung the main thread forever.

import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser;
globalThis.document = dom.window.document;

import { sanitizeSvgElement } from '../../../src/renderer/wechat-svg-sanitizer';

function makeSvg(body: string): SVGSVGElement {
  const doc = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${body}</svg>`,
    'image/svg+xml',
  );
  return doc.documentElement as unknown as SVGSVGElement;
}

describe('sanitizeSvgElement — <use> inlining', () => {
  it('inlines a <use> referencing a def with children (previously an infinite loop)', () => {
    const svg = makeSvg(
      '<defs><g id="p"><path d="M0 0L1 1"/><circle r="1"/></g></defs><use href="#p" x="2"/>',
    );
    // Must terminate — the regression was an infinite loop here.
    sanitizeSvgElement(svg);

    expect(svg.querySelectorAll('use')).toHaveLength(0);
    const g = svg.querySelector('g');
    expect(g).not.toBeNull();
    // Referenced children are cloned into the <g>
    expect(g!.querySelectorAll('path')).toHaveLength(1);
    expect(g!.querySelectorAll('circle')).toHaveLength(1);
    // <use> positioning is applied as a transform
    expect(g!.getAttribute('transform')).toContain('translate(2');
    // <defs> removed after inlining
    expect(svg.querySelector('defs')).toBeNull();
    // id attribute stripped (WeChat disables ids)
    expect(g!.hasAttribute('id')).toBe(false);
  });

  it('clones the referenced children for every <use> of the same def', () => {
    const svg = makeSvg(
      '<defs><g id="g1"><path d="M0 0"/><circle r="1"/></g></defs>' +
      '<use href="#g1"/><use href="#g1"/>',
    );
    sanitizeSvgElement(svg);

    expect(svg.querySelectorAll('g')).toHaveLength(2);
    expect(svg.querySelectorAll('path')).toHaveLength(2);
    expect(svg.querySelectorAll('circle')).toHaveLength(2);
  });

  it('leaves a <use> with an unknown id untouched except for sanitization', () => {
    const svg = makeSvg('<use href="#missing"/>');
    sanitizeSvgElement(svg);
    expect(svg.querySelector('use')).not.toBeNull();
  });

  it('is idempotent — a second call returns early without warnings', () => {
    const svg = makeSvg('<defs><path id="p" d="M0 0"/></defs><use href="#p"/>');
    sanitizeSvgElement(svg);
    const warnings = sanitizeSvgElement(svg);
    expect(warnings).toBe(0);
  });
});
