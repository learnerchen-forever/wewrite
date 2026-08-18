import esbuild from "esbuild";
import process from "process";

const prod = process.argv[2] === "production";

// Shared options for both bundles. main.js (CJS plugin entry) and
// mathjax-chunk.js (IIFE, loaded lazily on first math render) must use the
// same target/defines so bundled code behaves identically.
const common = {
  bundle: true,
  platform: "browser",
  target: "ES2020",
  loader: { '.svg': 'text' },
  external: ["obsidian", "electron"],
  define: {
    // mathjax-full/js/components/version.js uses eval('require') to read
    // package.json at runtime — define PACKAGE_VERSION so this code path
    // is skipped and the bundled version is used instead.
    PACKAGE_VERSION: '"3.2.1"',
  },
  minify: prod,
  treeShaking: true,
  logLevel: "info",
};

const mainCtx = await esbuild.context({
  ...common,
  entryPoints: ["src/main.ts"],
  format: "cjs",
  outfile: "main.js",
  sourcemap: prod ? false : "inline",
});

// MathJax lives in a separate chunk loaded on demand (first math render) so
// the startup bundle stays small enough for low-end devices (iPhone 7/iOS 15).
const chunkCtx = await esbuild.context({
  ...common,
  entryPoints: ["src/mathjax-entry.ts"],
  format: "iife",
  outfile: "mathjax-chunk.js",
  sourcemap: prod ? false : "inline",
});

if (prod) {
  await mainCtx.rebuild();
  await chunkCtx.rebuild();
  await mainCtx.dispose();
  await chunkCtx.dispose();
} else {
  await mainCtx.watch();
  await chunkCtx.watch();
}
