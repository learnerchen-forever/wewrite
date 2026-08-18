// mathjax-entry.ts — entry point of the lazily loaded MathJax chunk
// (build output: mathjax-chunk.js).
//
// Registers the LaTeX → SVG converter on window.WeWriteMathJax. The chunk is
// loaded on demand by src/utils/math-jax-loader.ts the first time a note with
// math formulas is rendered, so the ~1.7MB mathjax-full library never blocks
// plugin startup on low-end devices (iPhone 7 / iOS 15.7).

import { WEWRITE_MATHJAX_GLOBAL, type WeWriteMathJaxApi } from './core/mathjax-api';
import { createLatexToSvg } from './renderer/mathjax-impl';

declare global {
  interface Window {
    [WEWRITE_MATHJAX_GLOBAL]?: WeWriteMathJaxApi;
  }
}

window[WEWRITE_MATHJAX_GLOBAL] = { latexToSvg: createLatexToSvg() };
