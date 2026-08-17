import {
  extractPdfEmbeds,
  parsePdfFragment,
  buildPdfRenderPlan,
  pdfRegionCacheKey,
  cachePdfRegionPng,
  PDF_RENDER_SCALE,
  PDF_REGION_PREFIX,
  type PdfJsPage,
  type PdfRect,
} from '../../../src/media/pdf-embed-renderer';

// ── Fake pdf.js page ──
//
// Implements the pdf.js PageViewport contract (dontFlip:false, the default we
// use) for view [0,0,W,H]: the page's corners map onto the canvas corners
// with clockwise `rotation`. Transform layout [a,b,c,d,e,f] with
// cx = a*x + c*y + e, cy = b*x + d*y + f; the translation carries the base
// offset plus any viewport offsetX/offsetY.

interface FakePageOpts {
  w: number;
  h: number;
  rotate?: number;
}

function fakePage(opts: FakePageOpts): PdfJsPage {
  const { w, h } = opts;
  const rotation = opts.rotate ?? 0;
  const transformFor = (scale: number, offsetX: number, offsetY: number): number[] => {
    switch (rotation) {
      case 0:
        return [scale, 0, 0, -scale, offsetX, scale * h + offsetY];
      case 90:
        return [0, -scale, -scale, 0, scale * h + offsetX, scale * w + offsetY];
      case 180:
        return [-scale, 0, 0, scale, scale * w + offsetX, offsetY];
      case 270:
        return [0, scale, scale, 0, offsetX, offsetY];
      default:
        throw new Error(`unsupported rotation ${rotation}`);
    }
  };
  return {
    view: [0, 0, w, h],
    rotate: rotation,
    getViewport({ scale, rotation: rot, offsetX = 0, offsetY = 0, width, height }) {
      const effRot = rot ?? rotation;
      const swap = effRot === 90 || effRot === 270;
      return {
        width: width ?? scale * (swap ? h : w),
        height: height ?? scale * (swap ? w : h),
        transform: transformFor(scale, offsetX, offsetY),
      };
    },
    render() {
      throw new Error('render not implemented in fake page');
    },
  };
}

const RECT: PdfRect = { x0: 411, y0: 311, x1: 792, y1: 509 };

describe('extractPdfEmbeds', () => {
  test('parses PDF++ full syntax (page + rect + alt)', () => {
    const md = 'Before ![[5-聊城移动GPON技术交流-.pdf#page=4&rect=411,311,792,509|5-聊城移动GPON技术交流-, p.4]] after';
    const embeds = extractPdfEmbeds(md);
    expect(embeds).toHaveLength(1);
    const e = embeds[0];
    expect(e.target).toBe('5-聊城移动GPON技术交流-.pdf');
    expect(e.page).toBe(4);
    expect(e.rect).toEqual(RECT);
    expect(e.alt).toBe('5-聊城移动GPON技术交流-, p.4');
    expect(e.fullMatch).toBe('![[5-聊城移动GPON技术交流-.pdf#page=4&rect=411,311,792,509|5-聊城移动GPON技术交流-, p.4]]');
    expect(e.offset).toBe(7);
  });

  test('parses page-only embed', () => {
    const e = extractPdfEmbeds('![[deck.pdf#page=3]]')[0];
    expect(e.page).toBe(3);
    expect(e.rect).toBeNull();
    expect(e.alt).toBe('');
  });

  test('defaults to page 1 when no fragment', () => {
    const e = extractPdfEmbeds('![[deck.pdf]]')[0];
    expect(e.page).toBe(1);
    expect(e.rect).toBeNull();
  });

  test('keeps alt width params (e.g. |300) as-is', () => {
    const e = extractPdfEmbeds('![[deck.pdf#page=2|300]]')[0];
    expect(e.alt).toBe('300');
    expect(e.page).toBe(2);
  });

  test('supports paths with folders and spaces, case-insensitive .pdf', () => {
    const e = extractPdfEmbeds('![[notes/deck 2024.PDF#page=5]]')[0];
    expect(e.target).toBe('notes/deck 2024.PDF');
    expect(e.page).toBe(5);
  });

  test('ignores non-PDF embeds and plain links', () => {
    const md = '![[image.png]] [[deck.pdf#page=2]] ![[note.md]]';
    expect(extractPdfEmbeds(md)).toHaveLength(0);
  });

  test('extracts multiple embeds with correct offsets', () => {
    const md = 'a ![[a.pdf#page=1]] b ![[b.pdf#page=2&rect=0,0,100,100|caption]] c';
    const embeds = extractPdfEmbeds(md);
    expect(embeds).toHaveLength(2);
    expect(embeds[0].target).toBe('a.pdf');
    expect(embeds[1].target).toBe('b.pdf');
    expect(embeds[1].page).toBe(2);
    expect(embeds[1].rect).toEqual({ x0: 0, y0: 0, x1: 100, y1: 100 });
    expect(embeds[1].alt).toBe('caption');
  });
});

describe('parsePdfFragment', () => {
  test('empty fragment', () => {
    expect(parsePdfFragment('')).toEqual({ page: 1, rect: null });
  });

  test('page only', () => {
    expect(parsePdfFragment('page=4').page).toBe(4);
  });

  test('rect only', () => {
    expect(parsePdfFragment('rect=10,20,30,40').rect).toEqual({ x0: 10, y0: 20, x1: 30, y1: 40 });
  });

  test('page + rect (PDF++ order)', () => {
    const { page, rect } = parsePdfFragment('page=4&rect=411,311,792,509');
    expect(page).toBe(4);
    expect(rect).toEqual(RECT);
  });

  test('unknown keys (zoom/highlight) are ignored', () => {
    const { page, rect } = parsePdfFragment('page=2&zoom=1.5&highlight=ff0000');
    expect(page).toBe(2);
    expect(rect).toBeNull();
  });

  test('invalid values fall back to defaults', () => {
    expect(parsePdfFragment('page=abc').page).toBe(1);
    expect(parsePdfFragment('page=0').page).toBe(1);
    expect(parsePdfFragment('page=-2').page).toBe(1);
    expect(parsePdfFragment('rect=1,2,3').rect).toBeNull();
    expect(parsePdfFragment('rect=1,2,3,x').rect).toBeNull();
  });

  test('keys are case-insensitive', () => {
    const { page, rect } = parsePdfFragment('PAGE=7&RECT=0,0,50,50');
    expect(page).toBe(7);
    expect(rect).toEqual({ x0: 0, y0: 0, x1: 50, y1: 50 });
  });
});

describe('buildPdfRenderPlan', () => {
  test('crops a rect on an unrotated page (bottom-left PDF space → top-left canvas)', () => {
    const page = fakePage({ w: 792, h: 612 });
    const { viewport, crop } = buildPdfRenderPlan(page, RECT, 2);
    // Full-page render at 2x, crop rect in canvas space:
    // x∈[411,792]→[822,1584] (width 762), y flipped [311,509]→[206,602] (height 396).
    expect(viewport.width).toBeCloseTo(1584);
    expect(viewport.height).toBeCloseTo(1224);
    expect(crop).not.toBeNull();
    expect(crop!.x).toBeCloseTo(822);
    expect(crop!.y).toBeCloseTo(206);
    expect(crop!.w).toBeCloseTo(762);
    expect(crop!.h).toBeCloseTo(396);
  });

  test('full page render keeps orientation and dims (crop null)', () => {
    const page = fakePage({ w: 792, h: 612 });
    const { viewport, crop } = buildPdfRenderPlan(page, null, 2);
    expect(viewport.width).toBeCloseTo(1584);
    expect(viewport.height).toBeCloseTo(1224);
    expect(viewport.transform[3]).toBeCloseTo(-2); // y flip preserved
    expect(crop).toBeNull();
  });

  test('rotated page (90) maps the rect through pdf.js rotation', () => {
    const page = fakePage({ w: 792, h: 612, rotate: 90 });
    const { viewport, crop } = buildPdfRenderPlan(page, { x0: 100, y0: 200, x1: 300, y1: 400 }, 2);
    // r=90 transform is [0,-s,-s,0,s*H,s*W]; corners map to cx∈[424,824],
    // cy∈[984,1384] → 400x400 crop; viewport is 1224x1584.
    expect(viewport.width).toBeCloseTo(1224);
    expect(viewport.height).toBeCloseTo(1584);
    expect(crop).not.toBeNull();
    expect(crop!.x).toBeCloseTo(424);
    expect(crop!.y).toBeCloseTo(984);
    expect(crop!.w).toBeCloseTo(400);
    expect(crop!.h).toBeCloseTo(400);
  });

  test('clamps scale so the canvas never exceeds 4096 on either side', () => {
    const page = fakePage({ w: 5000, h: 3000 }); // huge page
    const { viewport } = buildPdfRenderPlan(page, null, PDF_RENDER_SCALE);
    expect(viewport.width).toBeLessThanOrEqual(4096);
    expect(viewport.height).toBeLessThanOrEqual(4096);
    expect(viewport.width).toBeCloseTo(4096); // 5000 * (4096/5000)
    expect(viewport.height).toBeCloseTo(2457.6);
  });

  test('rect fully outside page bounds falls back to the full page', () => {
    const page = fakePage({ w: 792, h: 612 });
    const { viewport, crop } = buildPdfRenderPlan(page, { x0: 900, y0: 700, x1: 1200, y1: 900 }, 2);
    expect(viewport.width).toBeCloseTo(1584);
    expect(viewport.height).toBeCloseTo(1224);
    expect(crop).toBeNull();
  });

  test('rect partially outside is clamped to the page', () => {
    const page = fakePage({ w: 792, h: 612 });
    const { crop } = buildPdfRenderPlan(page, { x0: 500, y0: 500, x1: 1000, y1: 1000 }, 2);
    expect(crop).not.toBeNull();
    expect(crop!.w).toBeCloseTo(2 * (792 - 500)); // clamped to page width
    expect(crop!.h).toBeCloseTo(2 * (612 - 500));
  });

  test('crop rect is never outside the rendered canvas (float drift guard)', () => {
    const page = fakePage({ w: 792, h: 612 });
    const { viewport, crop } = buildPdfRenderPlan(page, { x0: -50, y0: -50, x1: 50, y1: 50 }, 2);
    expect(crop).not.toBeNull();
    expect(crop!.x).toBeGreaterThanOrEqual(0);
    expect(crop!.y).toBeGreaterThanOrEqual(0);
    expect(crop!.x + crop!.w).toBeLessThanOrEqual(viewport.width + 0.001);
    expect(crop!.y + crop!.h).toBeLessThanOrEqual(viewport.height + 0.001);
  });
});

describe('pdfRegionCacheKey', () => {
  test('deterministic for the same inputs', () => {
    const a = pdfRegionCacheKey('deck.pdf', 12345, 4, RECT, 2);
    const b = pdfRegionCacheKey('deck.pdf', 12345, 4, RECT, 2);
    expect(a).toBe(b);
  });

  test('changes when mtime / page / rect / scale change', () => {
    const base = pdfRegionCacheKey('deck.pdf', 1, 4, RECT, 2);
    expect(pdfRegionCacheKey('deck.pdf', 2, 4, RECT, 2)).not.toBe(base);
    expect(pdfRegionCacheKey('deck.pdf', 1, 5, RECT, 2)).not.toBe(base);
    expect(pdfRegionCacheKey('deck.pdf', 1, 4, null, 2)).not.toBe(base);
    expect(pdfRegionCacheKey('deck.pdf', 1, 4, RECT, 3)).not.toBe(base);
    expect(pdfRegionCacheKey('other.pdf', 1, 4, RECT, 2)).not.toBe(base);
  });

  test('full page vs rect produce different keys', () => {
    expect(pdfRegionCacheKey('deck.pdf', 1, 4, null, 2)).not.toBe(
      pdfRegionCacheKey('deck.pdf', 1, 4, RECT, 2),
    );
  });
});

describe('cachePdfRegionPng', () => {
  function fakeApp() {
    const files = new Map<string, ArrayBuffer>();
    const app = {
      vault: {
        adapter: {
          exists: async (p: string) => files.has(p),
          mkdir: async () => undefined,
        },
        createBinary: async (p: string, data: ArrayBuffer) => {
          files.set(p, data);
        },
      },
    };
    return { app: app as never, files };
  }

  test('probe misses then writes then hits', async () => {
    const { app, files } = fakeApp();
    const key = 'abc123';
    expect(await cachePdfRegionPng(app, 'WeWrite/cache', key, null)).toBeNull();

    const buf = new TextEncoder().encode('png-bytes').buffer as ArrayBuffer;
    const path = await cachePdfRegionPng(app, 'WeWrite/cache', key, buf);
    expect(path).toBe(`WeWrite/cache/${PDF_REGION_PREFIX}-${key}.png`);
    expect(files.has(path)).toBe(true);

    // Probe now hits; a second write must not duplicate/overwrite.
    expect(await cachePdfRegionPng(app, 'WeWrite/cache', key, null)).toBe(path);
    const before = files.get(path)!;
    const again = new TextEncoder().encode('different').buffer as ArrayBuffer;
    expect(await cachePdfRegionPng(app, 'WeWrite/cache', key, again)).toBe(path);
    expect(files.get(path)).toBe(before);
  });
});
