// Jest maps `*.svg` here: esbuild bundles the real files as text (see
// `loader: { '.svg': 'text' }` in esbuild.config.mjs), and jsdom-free unit
// tests only need the import to resolve. `registerWewriteIcons()` is what the
// command catalog test exercises, and it never inspects the markup.
export default '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"></svg>';
