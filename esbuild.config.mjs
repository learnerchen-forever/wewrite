import esbuild from "esbuild";
import process from "process";

const prod = process.argv[2] === "production";

// Single-bundle build: everything (including mathjax-full) is bundled into
// main.js. Obsidian's community-plugin installer only downloads main.js,
// manifest.json and styles.css from a release, so any extra chunk file is
// never installed on devices — mathjax must live in the main bundle.
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

if (prod) {
  await mainCtx.rebuild();
  await mainCtx.dispose();
} else {
  await mainCtx.watch();
}
