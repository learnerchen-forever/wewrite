/**
 * tools/host-modules-guard.mjs — keep Obsidian-provided modules out of main.js.
 *
 * Obsidian injects a set of modules into every plugin through its own module
 * registry. Reading Obsidian 1.14.4's obsidian.asar (app.js) shows the table:
 *
 *   { obsidian: …, "@codemirror/autocomplete": …, "@codemirror/collab": …,
 *     "@codemirror/commands": …, "@codemirror/language": …, "@codemirror/lint": …,
 *     "@codemirror/search": …, "@codemirror/state": …, "@codemirror/view": …,
 *     "@lezer/common": …, "@lezer/lr": …, "@lezer/highlight": … }
 *
 * So `require("@codemirror/state")` from a plugin resolves to the very class
 * objects Obsidian's own editor uses. Bundling a private copy instead loads a
 * second @codemirror/state, every `instanceof` inside CodeMirror then fails for
 * objects that cross the boundary, and Obsidian's extension resolver throws:
 *
 *   Error: Unrecognized extension value in extension set ([object Object]).
 *   This sometimes happens because multiple instances of @codemirror/state are
 *   loaded, breaking instanceof checks.
 *
 * That is the branch in resolve() where `value.extension === value` yet `value`
 * is not an instance of the StateField / StateEffect / Extension classes of the
 * bundle doing the checking. Obsidian fails the whole plugin with it, so the
 * mistake is fatal rather than cosmetic.
 *
 * `external` in esbuild only covers the specifiers our own source writes. A new
 * transitive dependency, or a stray `import … from '@codemirror/language'`, can
 * silently drag a second copy back in — no build error, and a plugin that will
 * not load on the user's machine. Hence this guard: esbuild's metafile names
 * every module that actually reached the output, so the check is exact instead
 * of a guess at bundle contents.
 */

/** Specifiers esbuild must not inline. Mirrors obsidian-sample-plugin. */
export const HOST_PROVIDED = [
  "obsidian",
  "electron",
  "@codemirror/autocomplete",
  "@codemirror/collab",
  "@codemirror/commands",
  "@codemirror/language",
  "@codemirror/lint",
  "@codemirror/search",
  "@codemirror/state",
  "@codemirror/view",
  "@lezer/common",
  "@lezer/highlight",
  "@lezer/lr",
];

/** npm package prefixes that must never appear in the bundle. */
export const HOST_ONLY_PREFIXES = ["@codemirror/", "@lezer/"];

/**
 * List the modules from `metafile` that Obsidian owns.
 * @param {{outputs?: Record<string, {inputs?: Record<string, unknown>}>}} metafile
 * @returns {string[]} one `input (bundled into output)` line per offender
 */
export function findBundledHostModules(metafile) {
  const offenders = new Set();
  for (const [out, info] of Object.entries(metafile?.outputs ?? {})) {
    for (const input of Object.keys(info.inputs ?? {})) {
      const at = input.indexOf("node_modules/");
      if (at < 0) continue;
      const pkg = input.slice(at + "node_modules/".length);
      if (HOST_ONLY_PREFIXES.some((p) => pkg.startsWith(p))) {
        offenders.add(`${input} (bundled into ${out})`);
      }
    }
  }
  return [...offenders];
}

/** Throwing form of {@link findBundledHostModules}. */
export function assertHostModulesExternal(metafile) {
  const offenders = findBundledHostModules(metafile);
  if (!offenders.length) return;
  throw new Error(
    "Obsidian provides these modules at runtime and they must stay external " +
      "(bundling them loads a second copy, which breaks CodeMirror's instanceof checks " +
      "and stops the plugin from loading):\n  " +
      offenders.join("\n  "),
  );
}

/** esbuild plugin form — runs on every build, including watch mode. */
export const hostModulesGuardPlugin = {
  name: "assert-host-modules-external",
  setup(build) {
    build.onEnd((result) => {
      if (result.metafile) assertHostModulesExternal(result.metafile);
    });
  },
};
