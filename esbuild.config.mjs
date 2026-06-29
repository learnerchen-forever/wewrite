import esbuild from "esbuild";
import process from "process";

const prod = process.argv[2] === "production";

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  platform: "browser",
  target: "ES2020",
  format: "cjs",
  outfile: "main.js",
  loader: { '.svg': 'text' },
  external: ["obsidian", "electron"],
  define: {
    // mathjax-full/js/components/version.js uses eval('require') to read
    // package.json at runtime — define PACKAGE_VERSION so this code path
    // is skipped and the bundled version is used instead.
    PACKAGE_VERSION: '"3.2.1"',
  },
  sourcemap: prod ? false : "inline",
  minify: prod,
  treeShaking: true,
  logLevel: "info",
});

if (prod) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
