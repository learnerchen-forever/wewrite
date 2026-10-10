import esbuild from "esbuild";
import process from "process";
import { builtinModules } from "node:module";
import { stripMathJaxPreload } from "./tools/mathjax-preload-patch.mjs";
import { HOST_PROVIDED, hostModulesGuardPlugin } from "./tools/host-modules-guard.mjs";

const prod = process.argv[2] === "production";

// `stripMathJaxPreload` removes mathjax-full's dead `MathJax.loader.preLoad(...)`
// call, which throws under Obsidian 1.14 (MathJax 4) and stops the plugin from
// loading at all. See tools/mathjax-preload-patch.mjs for the full story.

// `hostModulesGuardPlugin` plus the HOST_PROVIDED list keep Obsidian's own
// CodeMirror out of the bundle — a second @codemirror/state makes CodeMirror's
// instanceof checks fail and Obsidian rejects the plugin with "Unrecognized
// extension value in extension set". See tools/host-modules-guard.mjs.

// Single-bundle build: everything (including mathjax-full) is bundled into
// main.js. Obsidian's community-plugin installer only downloads main.js,
// manifest.json and styles.css from a release, so any extra chunk file is
// never installed on devices — mathjax must live in the main bundle.
const common = {
  bundle: true,
  platform: "browser",
  target: "ES2020",
  loader: { '.svg': 'text' },
  external: [...HOST_PROVIDED, ...builtinModules],
  define: {
    // mathjax-full/js/components/version.js uses eval('require') to read
    // package.json at runtime — define PACKAGE_VERSION so this code path
    // is skipped and the bundled version is used instead.
    PACKAGE_VERSION: '"3.2.1"',
  },
  minify: prod,
  treeShaking: true,
  logLevel: "info",
  // Required by hostModulesGuardPlugin — see tools/host-modules-guard.mjs.
  metafile: true,
  plugins: [stripMathJaxPreload, hostModulesGuardPlugin],
};

const mainCtx = await esbuild.context({
  ...common,
  entryPoints: ["src/main.ts"],
  format: "cjs",
  outfile: "main.js",
  sourcemap: prod ? false : "inline",
});

if (prod) {
  await mainCtx.rebuild();
  await mainCtx.dispose();
} else {
  await mainCtx.watch();
}
