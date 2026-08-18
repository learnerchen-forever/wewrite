// Math formula → SVG conversion (main-bundle facade).
//
// mathjax-full is bundled into main.js (Obsidian's installer only ships the
// three standard plugin files, so a separate chunk can never be installed).
// The heavy MathJax document setup is created lazily on the first call so the
// startup cost stays low; the converter instance is cached for the session.
//
// Returns an empty string on any failure so callers degrade gracefully
// (formulas are left in their original MathJax CHTML form rather than
// crashing the render pipeline).

import { createLatexToSvg } from './mathjax-impl';
import { createLogger } from '../utils/logger';

const log = createLogger('MathToSvg');

let converter: ((math: string, display: boolean) => string) | null = null;

/** Convert a single LaTeX formula to an SVG string.
 *  @param math  The LaTeX formula (without $ delimiters)
 *  @param display  true for block/display math, false for inline
 *  @returns  SVG markup string, or empty string on error */
export async function latexToSvg(math: string, display: boolean): Promise<string> {
  try {
    if (!converter) converter = createLatexToSvg();
    return converter(math, display);
  } catch (err) {
    log.warn('math conversion failed (mathjax unavailable)', { err: String(err) });
    return '';
  }
}
