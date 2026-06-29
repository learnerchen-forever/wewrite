// Math formula → SVG conversion using mathjax-full with SVG output jax.
// Uses LiteAdaptor (virtual DOM) so no browser DOM is needed — works in
// both desktop and mobile Obsidian. Renders glyphs as SVG path data
// (fontCache: 'none') so SVGs are self-contained and WeChat-compatible.
//
// Based on the wewrite_lagacy approach by Sun BooShi (note-to-mp plugin).

import { LiteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html';
import { TeX } from 'mathjax-full/js/input/tex';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages';
import { mathjax } from 'mathjax-full/js/mathjax';
import { SVG } from 'mathjax-full/js/output/svg';

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

/** Convert a single LaTeX formula to an SVG string.
 *  @param math  The LaTeX formula (without $ delimiters)
 *  @param display  true for block/display math, false for inline
 *  @returns  SVG markup string, or empty string on error */
export function latexToSvg(math: string, display: boolean): string {
  try {
    const options: MathJaxOptions = {
      em: 16,
      ex: 8,
      containerWidth: display ? 677 : 400,
    };
    const node = mjDoc.convert(math, options);
    return adaptor.innerHTML(node);
  } catch (err) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mjErr = err as any;
    // MathJax throws on invalid LaTeX syntax — return empty
    if (mjErr?.message) {
      console.warn('[math-to-svg] conversion failed:', mjErr.message.slice(0, 120));
    }
    return '';
  }
}
