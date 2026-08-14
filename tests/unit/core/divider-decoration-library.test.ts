import { getDividerDecorationLibrary, getDividerDecorationMap } from '../../../src/core/divider-decoration-library';

const COLOR_RE = /^(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|transparent|currentColor)$/;
const PARAM_TYPES = ['color', 'number', 'px', 'text', 'select', 'image'];
const FAMILIES = ['none', 'line', 'gradient', 'pattern', 'composite', 'graphic'];

describe('Divider decoration library', () => {
  const library = getDividerDecorationLibrary();

  it('contains 12 entries (none + 11 built-ins)', () => {
    expect(library).toHaveLength(12);
  });

  it('has unique ids and a complete map', () => {
    const ids = library.map(d => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    const map = getDividerDecorationMap();
    expect(Object.keys(map)).toHaveLength(12);
    for (const d of library) {
      expect(map[d.id]).toEqual(d);
    }
  });

  it('every decoration has a display name, description and valid family', () => {
    for (const d of library) {
      if (d.id !== 'none') expect(d.name.length).toBeGreaterThan(0);
      expect(d.description.length).toBeGreaterThan(0);
      expect(FAMILIES).toContain(d.family);
      expect(d.builtin).toBe(true);
    }
  });

  it('templates reference only declared params, and every param is used', () => {
    for (const d of library) {
      if (d.id === 'none') {
        expect(d.template).toBe('');
        expect(Object.keys(d.params)).toHaveLength(0);
        continue;
      }

      expect(d.template.length).toBeGreaterThan(0);
      const referenced = [...d.template.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]);
      for (const ref of referenced) {
        expect(d.params[ref]).toBeDefined();
      }
      for (const paramName of Object.keys(d.params)) {
        expect(referenced).toContain(paramName);
      }
    }
  });

  it('params are well-formed (type, label, default)', () => {
    for (const d of library) {
      for (const param of Object.values(d.params)) {
        expect(PARAM_TYPES).toContain(param.type);
        expect(param.label.length).toBeGreaterThan(0);
        expect(typeof param.default).toBe('string');
        if (param.type === 'color') {
          expect(param.default).toMatch(COLOR_RE);
        }
        if (param.type === 'px' || param.type === 'number') {
          expect(Number.isFinite(Number(param.default))).toBe(true);
        }
      }
    }
  });

  it('default values reproduce the source examples exactly', () => {
    const byId = Object.fromEntries(library.map(d => [d.id, d]));

    // 例 1 — 霓虹流彩: 40px margins, 2px height, five-stop gradient.
    expect(byId['aurora'].params.margin.default).toBe('40px 0');
    expect(byId['aurora'].params.height.default).toBe('2');
    expect(byId['aurora'].params.colors.default)
      .toBe('rgba(0, 122, 255, 0), rgb(0, 122, 255), rgb(88, 86, 214), rgb(255, 45, 85), rgba(255, 45, 85, 0)');

    // 例 2 — 水天一色: em-based margins, #1677ff → #05d4cd.
    expect(byId['aquaSky'].params.margin.default).toBe('2.5em 0');
    expect(byId['aquaSky'].params.colors.default)
      .toBe('rgba(22, 119, 255, 0), #1677ff, #05d4cd, rgba(5, 212, 205, 0)');

    // 例 3 — 素简一痕.
    expect(byId['hairline'].params.color.default).toBe('#e8e0d0');
    expect(byId['hairline'].params.margin.default).toBe('32px 0');

    // 例 4 — 青黛一痕.
    expect(byId['cyanEdge'].params.color.default).toBe('rgb(61, 184, 191)');
    expect(byId['cyanEdge'].params.height.default).toBe('2');

    // 例 6 — 砚痕微凹: asymmetric margins and the exact odd thickness.
    expect(byId['inkGroove'].params.margin.default).toBe('56px 0 7px');
    expect(byId['inkGroove'].params.thickness.default).toBe('0.912871px');

    // 例 7 — 碧空一线.
    expect(byId['skyBand'].params.colors.default)
      .toBe('rgba(248, 57, 41, 0), rgb(14, 136, 235), rgba(248, 57, 41, 0)');
    expect(byId['skyBand'].params.margin.default).toBe('10px 0');

    // 例 8 — 鎏金眉线.
    expect(byId['goldEdge'].params.color.default).toBe('rgb(255, 215, 0)');
    expect(byId['goldEdge'].params.width.default).toBe('677px');

    // 例 9 — 双线衔珠.
    expect(byId['twinLineText'].params.text.default).toBe('NEXOM AI');
    expect(byId['twinLineText'].params.color.default).toBe('#444444');
    expect(byId['twinLineText'].params.textSize.default).toBe('15');

    // 例 10 — 星点连缀（例 10 的两个小方块颜色）.
    expect(byId['dotPattern'].params.colorA.default).toBe('#df1055');
    expect(byId['dotPattern'].params.colorB.default).toBe('#68c7fc');
    expect(byId['dotPattern'].params.size.default).toBe('20'); // 周期 20px → 每个方块 10px
    expect(byId['dotPattern'].params.height.default).toBe('10');

    // 例 11 — 双线衔徽.
    expect(byId['twinLineIcon'].params.color.default).toBe('rgb(113, 146, 109)');
    expect(byId['twinLineIcon'].params.imageSize.default).toBe('26');
  });
});
