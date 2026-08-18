// Math formula → SVG conversion (main-bundle facade).
//
// The actual mathjax-full conversion lives in the lazily loaded chunk
// (src/renderer/mathjax-impl.ts → mathjax-chunk.js). This facade loads the
// chunk on first use, so the ~1.7MB mathjax library is kept out of the
// startup bundle — critical for low-end devices (iPhone 7 / iOS 15.7).
//
// Returns an empty string on any failure so callers degrade gracefully
// (formulas are left in their original MathJax CHTML form, which WeChat
// strips, rather than crashing the render pipeline).

import { loadMathJax } from '../utils/math-jax-loader';
import { createLogger } from '../utils/logger';

const log = createLogger('MathToSvg');

/** Convert a single LaTeX formula to an SVG string.
 *  @param math  The LaTeX formula (without $ delimiters)
 *  @param display  true for block/display math, false for inline
 *  @returns  SVG markup string, or empty string on error */
export async function latexToSvg(math: string, display: boolean): Promise<string> {
  try {
    return (await loadMathJax()).latexToSvg(math, display);
  } catch (err) {
    log.warn('math conversion failed (mathjax chunk unavailable)', { err: String(err) });
    return '';
  }
}
