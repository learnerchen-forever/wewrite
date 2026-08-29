// Jest global setup: provide browser globals for the node test environment.
// The plugin source uses window.setTimeout/setInterval/etc. (review-recommended
// popout-window compatibility), which the node test environment lacks.
if (typeof window === 'undefined') {
  globalThis.window = globalThis;
}
if (typeof globalThis.requestAnimationFrame === 'undefined') {
  globalThis.requestAnimationFrame = function (cb) {
    return setTimeout(function () { cb(Date.now()); }, 16);
  };
}
if (typeof globalThis.cancelAnimationFrame === 'undefined') {
  globalThis.cancelAnimationFrame = function (id) { return clearTimeout(id); };
}
