// Math formula → SVG conversion using mathjax-full with SVG output jax.
// Uses LiteAdaptor (virtual DOM) so no browser DOM is needed — works in
// both desktop and mobile Obsidian. Renders glyphs as SVG path data
// (fontCache: 'none') so SVGs are self-contained and WeChat-compatible.
//
// mathjax-full is bundled into main.js (Obsidian's installer only ships the
// three standard plugin files, so a separate chunk can never be installed).
// The MathJax document setup below is created lazily on the first math
// render, not at plugin startup. Main-bundle code must only use
// `latexToSvg()` from ../renderer/math-to-svg.
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

interface MathJaxOptions {
  em: number;
  ex: number;
  containerWidth: number;
}

let converter: ((math: string, display: boolean) => string) | null = null;

/** Create (once) the LaTeX → SVG converter. The MathJax document is built on
 *  the first call so the heavy mathjax-full setup never blocks startup. */
export function createLatexToSvg(): (math: string, display: boolean) => string {
  if (converter) return converter;

  const adaptor = new LiteAdaptor();
  RegisterHTMLHandler(adaptor);
  const mjDoc = mathjax.document('', {
    InputJax: new TeX({ packages: AllPackages }),
    // fontCache: 'none' — each glyph is an explicit <path>, no <use>/<defs>
    // for font glyphs. Produces self-contained SVGs compatible with WeChat
    // which strips <style>, <defs>, and id-referenced <use> elements.
    OutputJax: new SVG({ fontCache: 'none' }),
  });

  converter = (math: string, display: boolean): string => {
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
  return converter;
}
