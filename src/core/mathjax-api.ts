// mathjax-api.ts — shared contract between the main bundle and the lazily
// loaded MathJax chunk (mathjax-chunk.js).
//
// The heavy mathjax-full library lives in the chunk so the plugin's startup
// bundle stays small enough for low-end devices (iPhone 7 / iOS 15.7). The
// chunk registers itself on window.WeWriteMathJax; main-bundle code only sees
// this interface.

export interface WeWriteMathJaxApi {
  /** Convert a single LaTeX formula to an SVG string.
   *  @param math  The LaTeX formula (without $ delimiters)
   *  @param display  true for block/display math, false for inline
   *  @returns  SVG markup string, or empty string on error */
  latexToSvg(math: string, display: boolean): string;
}

/** Global key the mathjax chunk attaches its API to. */
export const WEWRITE_MATHJAX_GLOBAL = 'WeWriteMathJax';
