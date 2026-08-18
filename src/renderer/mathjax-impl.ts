// Math formula → SVG conversion using mathjax-full with SVG output jax.
// Uses LiteAdaptor (virtual DOM) so no browser DOM is needed — works in
// both desktop and mobile Obsidian. Renders glyphs as SVG path data
// (fontCache: 'none') so SVGs are self-contained and WeChat-compatible.
//
// ⚠ This file is bundled into `mathjax-chunk.js` (see src/mathjax-entry.ts),
// which is loaded lazily on the first math render — keep mathjax-full imports
// confined to this module so the startup bundle stays small on low-end
// devices (iPhone 7 / iOS 15.7). Main-bundle code must only use
// `latexToSvg()` from ../renderer/math-to-svg (async, loads the chunk).
//
// Based on the wewrite_lagacy approach by Sun BooShi (note-to-mp plugin).

import { LiteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html';
import { TeX } from 'mathjax-full/js/input/tex';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages';
import { mathjax } from 'mathjax-full/js/mathjax';
import { SVG } from 'mathjax-full/js/output/svg';
import { createLogger } from '../utils/logger';

const log = createLogger('MathToSvg');

// ── Lazy-initialized MathJax document ──

const adaptor = new LiteAdaptor();
RegisterHTMLHandler(adaptor);

const mjDoc = mathjax.document('', {
  InputJax: new TeX({ packages: AllPackages }),
  // fontCache: 'none' — each glyph is an explicit <path>, no <use>/<defs>
  // for font glyphs. Produces self-contained SVGs compatible with WeChat
  // which strips <style>, <defs>, and id-referenced <use> elements.
  OutputJax: new SVG({ fontCache: 'none' }),
});

interface MathJaxOptions {
  em: number;
  ex: number;
  containerWidth: number;
}

/** Create the LaTeX → SVG converter exposed by the mathjax chunk. */
export function createLatexToSvg(): (math: string, display: boolean) => string {
  return (math: string, display: boolean): string => {
    try {
      const options: MathJaxOptions = {
        em: 16,
        ex: 8,
        containerWidth: display ? 677 : 400,
      };
      const node = mjDoc.convert(math, options);
      return adaptor.innerHTML(node);
    } catch (err) {
      // MathJax throws on invalid LaTeX syntax — return empty
      const message = (err as { message?: unknown } | null)?.message;
      if (typeof message === 'string') {
        log.warn('math conversion failed', { message: message.slice(0, 120) });
      }
      return '';
    }
  };
}
