// WeChat SVG sanitizer — strips non-whitelisted attributes so SVGs survive
// WeChat Official Account publishing. Based on the SVG AttributeName Whitelist
// (T/CASME 1609—2024) documented in docs/features/wechat-svg-whitelist.md.

import { createLogger } from '../utils/logger';

const log = createLogger('SvgSanitizer');

// Standard SVG root element attributes — always allowed
const KNOWN_ROOT_ATTRS = new Set([
  'xmlns', 'viewbox', 'width', 'height', 'style', 'class',
  'preserveaspectratio', 'version', 'x', 'y',
]);

// Standard SVG presentation attributes — valid on root and child elements
const KNOWN_PRESENTATION_ATTRS = new Set([
  'fill', 'fill-opacity', 'fill-rule',
  'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
  'stroke-dasharray', 'stroke-dashoffset', 'stroke-miterlimit', 'stroke-opacity',
  'opacity', 'color', 'transform', 'display', 'visibility',
  'clip-path', 'clip-rule', 'mask',
  'font-family', 'font-size', 'font-weight', 'font-style',
  'text-anchor', 'dominant-baseline', 'alignment-baseline',
  'vector-effect', 'shape-rendering', 'text-rendering', 'color-rendering',
  'overflow',
]);

// Attributes FORBIDDEN on ALL SVG elements by WeChat
const FORBIDDEN_ATTRS = [
  'xmlns:xlink',
  'role',
  'focusable',
  'overflow',
  'id',              // disabled by WeChat in recent versions
  'version',         // allowed on <svg> only, removed elsewhere
  'xml:space',
  'requiredExtensions',
  'systemLanguage',
  'externalResourcesRequired',
  'pointer-events',  // interactive — WeChat articles are static
  'cursor',          // interactive cursor styling
];

// Prefix-based: all aria-* and data-* attributes are stripped
const FORBIDDEN_PREFIXES = [
  'aria-',
  'data-',
  'on',              // event handlers
];

// Elements definitively forbidden by WeChat (they and their children are removed)
const FORBIDDEN_ELEMENTS = new Set([
  'foreignobject',
  'script',
  'style',
  'embed',
  'object',
  'iframe',
]);

// Attributes known to use deprecated xlink: prefix — convert to regular form
const XLINK_ATTRS: Record<string, string> = {
  'xlink:href': 'href',
  'xlink:show': '',   // remove (no equivalent)
  'xlink:title': '',  // remove (no equivalent)
  'xlink:role': '',   // remove (no equivalent)
  'xlink:arcrole': '',// remove (no equivalent)
};

/** Sanitize a single SVG DOM element and its children for WeChat compatibility.
 *  Handles MathJax's `<use href="#id">` pattern by inlining referenced elements
 *  before stripping `id` attributes (which WeChat disables).
 *
 *  Idempotent — safe to call multiple times on the same element. If the SVG
 *  has already been sanitized (marked via data-wewrite-sanitized), returns
 *  immediately to avoid redundant work. */
export function sanitizeSvgElement(svgEl: Element): number {
  // Skip if already sanitized — avoids redundant DOM walks when catch-all
  // re-processes SVGs that were sanitized by a specific step.
  if (svgEl.getAttribute('data-wewrite-sanitized') === '1') return 0;

  // Pass 1: inline all <use> references before stripping ids
  inlineUseReferences(svgEl);

  // Pass 2: strip forbidden attributes
  const state = { warnings: 0 };
  walkAndSanitize(svgEl, true, state);

  // Mark as sanitized so subsequent calls (e.g. catch-all pass) skip
  // this SVG. Set AFTER walkAndSanitize so the marker doesn't get
  // stripped by the data-* prefix filter.
  svgEl.setAttribute('data-wewrite-sanitized', '1');

  return state.warnings;
}

// ── <use> reference inlining ──

function inlineUseReferences(root: Element): void {
  // Build id → element map from <defs>
  const defs = root.querySelector('defs');
  const idMap = new Map<string, Element>();
  if (defs) {
    for (const child of Array.from(defs.children)) {
      const id = child.getAttribute('id');
      if (id) idMap.set(id, child);
    }
  }

  // Process <use> elements bottom-up (children first, then parents)
  const useElements = Array.from(root.querySelectorAll('use'));
  // Sort by depth descending so innermost are processed first
  useElements.sort((a, b) => {
    const depthA = a.querySelectorAll('use').length;
    const depthB = b.querySelectorAll('use').length;
    return depthA - depthB;
  });

  for (const useEl of useElements) {
    const href = (useEl.getAttribute('href') || useEl.getAttribute('xlink:href') || '').replace(/^#/, '');
    if (!href || !idMap.has(href)) {
      if (href) {
        log.warn('<use> references unknown id', { href, available: [...idMap.keys()].slice(0, 10) });
      }
      continue;
    }

    const refEl = idMap.get(href)!;
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');

    // Copy referenced element's attributes (except id)
    for (const attr of Array.from(refEl.attributes)) {
      if (attr.name === 'id') continue;
      g.setAttribute(attr.name, attr.value);
    }

    // Copy referenced element's children
    while (refEl.firstChild) {
      g.appendChild(refEl.firstChild.cloneNode(true));
    }

    // Apply <use> positioning: x, y, transform
    const ux = useEl.getAttribute('x');
    const uy = useEl.getAttribute('y');
    const ut = useEl.getAttribute('transform');
    const parts: string[] = [];
    if (ut) parts.push(ut);
    if (ux || uy) parts.push(`translate(${ux || '0'},${uy || '0'})`);
    if (parts.length > 0) g.setAttribute('transform', parts.join(' '));

    // Copy any additional allowed attributes from <use> to <g>
    for (const attr of ['fill', 'stroke', 'stroke-width', 'opacity', 'style', 'class']) {
      const v = useEl.getAttribute(attr);
      if (v) g.setAttribute(attr, v);
    }

    useEl.parentNode?.replaceChild(g, useEl);
  }

  // Remove <defs> — no longer needed after inlining
  if (defs) defs.remove();
}

// ── attribute sanitization pass ──

interface WalkState {
  warnings: number;
}

function walkAndSanitize(el: Element, isRoot: boolean, state: WalkState): void {
  const tagName = el.tagName.toLowerCase();

  // Remove forbidden elements entirely
  if (FORBIDDEN_ELEMENTS.has(tagName)) {
    log.warn('removing forbidden SVG element', { tag: tagName });
    state.warnings++;
    el.parentNode?.removeChild(el);
    return;
  }

  // Sanitize attributes on this element
  const attrsToRemove: string[] = [];

  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase();

    // Check exact forbidden list
    if (FORBIDDEN_ATTRS.includes(name)) {
      // version is allowed on root <svg> only
      if (name === 'version' && isRoot && tagName === 'svg') continue;
      attrsToRemove.push(attr.name);
      continue;
    }

    // Check forbidden prefixes. data-wewrite-* attributes are internal
    // pipeline markers (e.g. data-wewrite-no-prescan, data-wewrite-sanitized)
    // that must survive sanitization to protect SVGs from prescan/dedup.
    const isDataWeWrite = name.startsWith('data-wewrite-');
    if (!isDataWeWrite) {
      const hasForbiddenPrefix = FORBIDDEN_PREFIXES.some(p => name.startsWith(p));
      if (hasForbiddenPrefix) {
        attrsToRemove.push(attr.name);
        continue;
      }
    }

    // Convert deprecated xlink:* attributes
    if (name.startsWith('xlink:')) {
      const replacement = XLINK_ATTRS[name];
      if (replacement) {
        el.setAttribute(replacement, attr.value);
        attrsToRemove.push(attr.name);
      } else if (replacement === '') {
        attrsToRemove.push(attr.name);
      } else {
        log.warn('unknown xlink attribute stripped', { attr: name, tag: tagName });
        state.warnings++;
        attrsToRemove.push(attr.name);
      }
    }
  }

  // Actually remove the attributes
  for (const name of attrsToRemove) {
    el.removeAttribute(name);
  }

  // Warn about unexpected attributes on root SVG.
  // Only flag attributes that are clearly non-standard (namespace-prefixed
  // other than xml: / xmlns:, or data-* / aria-* which were already stripped).
  // Standard SVG presentation attributes are all fine — WeChat allows them.
  if (isRoot && tagName === 'svg') {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      // Known SVG root attributes — no warning
      if (KNOWN_ROOT_ATTRS.has(name)) continue;
      // Numeric dimension attributes (e.g. x, y, cx, cy, r, rx, ry, d, points)
      if (KNOWN_PRESENTATION_ATTRS.has(name)) continue;
      // Namespace-prefixed attribute (potential issue)
      if (name.includes(':') && !name.startsWith('xml')) {
        log.warn('namespaced attribute on SVG root (may be stripped by WeChat)', {
          attr: name,
          value: attr.value.slice(0, 60),
        });
        state.warnings++;
      }
    }
  }

  // Recurse into child elements
  for (const child of Array.from(el.children)) {
    walkAndSanitize(child, false, state);
  }
}

/** Quick check: can this SVG survive WeChat publishing as inline HTML?
 *  Returns false if the SVG contains forbidden elements that would be
 *  stripped, making the SVG visually broken.
 *
 *  This check runs on the raw SVG string AFTER sanitization. Forbidden
 *  elements (<style>, <foreignObject>, etc.) should already have been
 *  removed by sanitizeSvgElement() — if they are still present here,
 *  sanitization did not run or did not complete on this SVG. */
export function canInlineSvg(svgHtml: string): boolean {
  const lower = svgHtml.toLowerCase();
  for (const el of FORBIDDEN_ELEMENTS) {
    if (lower.includes(`<${el}`)) {
      log.warn('canInlineSvg: SVG contains forbidden element', {
        element: el,
        svgPreview: svgHtml.slice(0, 200),
      });
      return false;
    }
    if (lower.includes(`</${el}>`)) {
      log.warn('canInlineSvg: SVG contains forbidden closing tag', {
        element: el,
        svgPreview: svgHtml.slice(0, 200),
      });
      return false;
    }
  }
  if (lower.includes('xlink:href=') && !lower.includes('xlink:href="#')) {
    log.warn('canInlineSvg: SVG contains external xlink:href', {
      svgPreview: svgHtml.slice(0, 200),
    });
    return false;
  }
  return true;
}
