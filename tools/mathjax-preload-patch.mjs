import fs from 'node:fs/promises';

/**
 * Strip mathjax-full's dead `MathJax.loader.preLoad(...)` call from the bundle.
 *
 * Why: Obsidian 1.14 renders math with MathJax 4, and MathJax 4 leaves a global
 * `MathJax` whose `loader` key is a plain config object. MathJax 3 also exposes
 * `MathJax.loader`, but there its loader component patches a `preLoad()`
 * function onto it at startup; MathJax 4 has no such function. The tail of
 * mathjax-full 3.2.1's `js/input/tex/AllPackages.js` reads:
 *
 *   if (typeof MathJax !== 'undefined' && MathJax.loader) {
 *     MathJax.loader.preLoad('[tex]/action', '[tex]/ams', ...);
 *   }
 *
 * — guarding on `loader` existing rather than on `preLoad` being callable. Under
 * Obsidian 1.14 the guard passes and the call throws
 * `MathJax.loader.preLoad is not a function` while the bundle is being
 * evaluated, which takes the whole plugin down.
 *
 * The call is a no-op for WeWrite. It tells MathJax 3's lazy component loader
 * which packages are already on hand; we never use that loader — every package
 * is bundled statically and the converter is built from `mathjax.document()`.
 * Removing it also keeps the bundle from reading the host's global at all.
 *
 * This lives in its own module (rather than inline in esbuild.config.mjs) so
 * `stripPreLoad()` can be exercised without running a build.
 */

/** The one vendored file that touches the host's global while loading. */
export const PRELOAD_TARGET = /mathjax-full[\\/]js[\\/]input[\\/]tex[\\/]AllPackages\.js$/;

/** The guard plus its call, so the whole dead block is removed. */
export const PRELOAD_GUARD =
  /if \(typeof MathJax !== 'undefined' && MathJax\.loader\) \{\s*MathJax\.loader\.preLoad\([\s\S]*?\);\s*\}/;

/**
 * What replaces the removed block. Deliberately free of the token
 * `MathJax.loader.preLoad` — dev builds keep comments, and check-bundle.mjs
 * fails on that token anywhere in the output.
 */
export const STRIPPED_MARKER =
  "/* WeWrite: removed a call into the host's MathJax global — see tools/mathjax-preload-patch.mjs */";

/**
 * Return `source` with the dead guard removed.
 *
 * Throws when the guard is absent: a patch that silently stops applying is
 * worse than a red build, because the plugin would go back to reading the
 * host's global on a future mathjax-full upgrade.
 */
export function stripPreLoad(source) {
  if (!PRELOAD_GUARD.test(source)) {
    throw new Error(
      'mathjax-preload-patch: no MathJax.loader.preLoad guard found. mathjax-full ' +
        'changed shape — re-verify the patch against the new source before shipping, ' +
        "because the plugin must not call into the host's global MathJax.",
    );
  }
  return source.replace(PRELOAD_GUARD, STRIPPED_MARKER);
}

/** esbuild plugin applying the strip. */
export const stripMathJaxPreload = {
  name: 'strip-mathjax-preload',
  setup(build) {
    build.onLoad({ filter: PRELOAD_TARGET }, async (args) => {
      const contents = stripPreLoad(await fs.readFile(args.path, 'utf8'));
      return { contents, loader: 'js' };
    });
  },
};
