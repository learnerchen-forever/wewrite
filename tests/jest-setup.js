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

// Minimal Obsidian global DOM-helper shims for the node test environment.
// The plugin runtime provides these globals; tests only need them so renderer
// paths using Obsidian's createEl/createFragment/createSvg helpers can run.
function applyDomElementInfo(el, o) {
  if (typeof o === 'string') {
    el.className = o;
    return;
  }
  if (!o) return;
  if (o.cls) el.className = Array.isArray(o.cls) ? o.cls.join(' ') : o.cls;
  if (o.text !== undefined) el.textContent = o.text;
  if (o.title !== undefined) el.title = o.title;
  if (o.placeholder !== undefined) el.setAttribute('placeholder', o.placeholder);
  if (o.value !== undefined) el.setAttribute('value', o.value);
  if (o.type !== undefined) el.setAttribute('type', o.type);
  if (o.href !== undefined) el.setAttribute('href', o.href);
  if (o.attr) {
    for (const [key, value] of Object.entries(o.attr)) {
      if (value !== null && value !== undefined) el.setAttribute(key, String(value));
    }
  }
  if (o.parent) {
    if (o.prepend) o.parent.prepend(el);
    else o.parent.appendChild(el);
  }
}

if (typeof globalThis.createEl === 'undefined') {
  globalThis.createEl = function (tag, o, callback) {
    const el = globalThis.document.createElement(tag);
    applyDomElementInfo(el, o);
    if (callback) callback(el);
    return el;
  };
}
if (typeof globalThis.createDiv === 'undefined') {
  globalThis.createDiv = function (o, callback) { return globalThis.createEl('div', o, callback); };
}
if (typeof globalThis.createSpan === 'undefined') {
  globalThis.createSpan = function (o, callback) { return globalThis.createEl('span', o, callback); };
}
if (typeof globalThis.createSvg === 'undefined') {
  globalThis.createSvg = function (tag, o, callback) {
    const el = globalThis.document.createElementNS('http://www.w3.org/2000/svg', tag);
    applyDomElementInfo(el, o);
    if (callback) callback(el);
    return el;
  };
}
if (typeof globalThis.createFragment === 'undefined') {
  globalThis.createFragment = function (callback) {
    const frag = globalThis.document.createDocumentFragment();
    if (callback) callback(frag);
    return frag;
  };
}
