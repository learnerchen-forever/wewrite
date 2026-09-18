// A decoration is a template plus a bag of default params. If any of those
// defaults is a width that cannot fit a phone, the decoration cannot be used on
// a phone at all — and because the decoration libraries are shared, the defect
// shows up in whichever themes happen to pick that decoration.
//
// This is not hypothetical: `divider.goldEdge` shipped with `width: 677px`
// (the editor width of the WeChat sample it was traced from) and produced a
// 677px-wide rule inside a 375px article, giving the reader a horizontal
// scrollbar. Nothing caught it because no shipped theme had selected that
// decoration until the themes were rebuilt.
//
// So: no default may be a px length at or above the narrowest common phone
// (320px). Smaller fixed sizes are fine (an icon is 160px on purpose); a
// *width* that big is always a sign that a pixel measurement leaked into what
// should be a relative value.

import { getHeadingDecorationLibrary } from '../../../src/core/heading-decoration-library';
import { getBlockquoteDecorationLibrary } from '../../../src/core/blockquote-decoration-library';
import { getCalloutDecorationLibrary } from '../../../src/core/callout-decoration-library';
import { getDividerDecorationLibrary } from '../../../src/core/divider-decoration-library';
import { getTableDecorationLibrary } from '../../../src/core/table-decoration-library';
import {
  getOrderedDecorationLibrary,
  getUnorderedDecorationLibrary,
  getTaskDecorationLibrary,
} from '../../../src/core/list-decoration-library';
import { getInlineDecorationLibrary } from '../../../src/core/inline-decoration-library';
import { getImageDecorationLibrary } from '../../../src/core/image-decoration-library';
import { getMathDecorationLibrary } from '../../../src/core/math-decoration-library';
import { getMermaidDecorationLibrary } from '../../../src/core/mermaid-decoration-library';
import { getExcalidrawDecorationLibrary } from '../../../src/core/excalidraw-decoration-library';

/** Narrowest phone width we expect an article to be read at. */
const PHONE_MIN_PX = 320;

interface AnyDecoration {
  id: string;
  template?: string;
  params?: Record<string, { type: string; default: string }>;
}

const LIBRARIES: Array<[string, () => AnyDecoration[]]> = [
  ['heading', getHeadingDecorationLibrary],
  ['blockquote', getBlockquoteDecorationLibrary],
  ['callout', getCalloutDecorationLibrary],
  ['divider', getDividerDecorationLibrary],
  ['table', getTableDecorationLibrary],
  ['ol', getOrderedDecorationLibrary],
  ['ul', getUnorderedDecorationLibrary],
  ['task', getTaskDecorationLibrary],
  ['inline', getInlineDecorationLibrary],
  ['image', getImageDecorationLibrary],
  ['math', getMathDecorationLibrary],
  ['mermaid', getMermaidDecorationLibrary],
  ['excalidraw', getExcalidrawDecorationLibrary],
];

/** A px length string, or null when the value is not a bare px length. */
function pxLength(value: string): number | null {
  const m = /^(\d+(?:\.\d+)?)px$/.exec(value.trim());
  return m ? Number(m[1]) : null;
}

/**
 * `width:` as a real property. The leading group is what keeps `max-width` /
 * `min-width` / `stroke-width` out — a capture group rather than a lookbehind,
 * which is banned project-wide because iOS 15 cannot parse it (see CLAUDE.md).
 * `border-radius` is a different property and never matches.
 */
const WIDTH_PX_RE = /(^|[^-a-z])width:\s*(\d+(?:\.\d+)?)px/gm;

/** Every px length declared by the real `width` property in `css`. */
function declaredWidths(css: string): number[] {
  return [...css.matchAll(WIDTH_PX_RE)].map((m) => Number(m[2]));
}

describe('decoration defaults fit a phone', () => {
  it('detects the defect it was written for', () => {
    // The template `divider.goldEdge` actually shipped with.
    const shipped = '<section style="margin:20px 0;width:677px;height:1px;padding:0;border-top:2px solid rgb(255,215,0);box-sizing:border-box"></section>';
    expect(declaredWidths(shipped)).toEqual([677]);

    // …and the shapes that must NOT be flagged.
    expect(declaredWidths('<section style="border-radius:999px;max-width:100%;min-width:40px;width:100%"></section>')).toEqual([]);
  });
  it('has no px param default at or above the narrowest phone width', () => {
    const bad: string[] = [];
    for (const [family, get] of LIBRARIES) {
      for (const deco of get()) {
        for (const [name, param] of Object.entries(deco.params ?? {})) {
          const asPx = param.type === 'px' ? Number(param.default) : pxLength(param.default);
          if (asPx !== null && Number.isFinite(asPx) && asPx >= PHONE_MIN_PX) {
            bad.push(`${family}.${deco.id}.${name} = ${param.default}`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('has no template with a hardcoded px width at or above the narrowest phone width', () => {
    const bad: string[] = [];
    for (const [family, get] of LIBRARIES) {
      for (const deco of get()) {
        const template = deco.template;
        if (!template) continue;
        // Only the real width property; `border-radius:999px` is a clamp idiom.
        for (const px of declaredWidths(template)) {
          if (px >= PHONE_MIN_PX) bad.push(`${family}.${deco.id}: width:${px}px`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
