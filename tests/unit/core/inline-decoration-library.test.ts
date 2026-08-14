import { getInlineDecorationLibrary, getInlineDecorationMap } from '../../../src/core/inline-decoration-library';

const PARAM_TYPES = ['color', 'number', 'px', 'text', 'select', 'image'];

describe('Inline decoration library', () => {
  const library = getInlineDecorationLibrary();

  it('contains the 11 planned decorations (10 visual styles + none)', () => {
    expect(library).toHaveLength(11);
  });

  it('has unique ids and a complete map', () => {
    const ids = library.map(d => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    const map = getInlineDecorationMap();
    expect(Object.keys(map)).toHaveLength(11);
    for (const d of library) {
      expect(map[d.id]).toEqual(d);
    }
  });

  it('every built-in has a display name and a description', () => {
    for (const d of library) {
      expect(d.name.length).toBeGreaterThan(0);
      expect(d.description.length).toBeGreaterThan(0);
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

      expect(d.template).toContain('{text}');
      expect(d.template).toContain('{tag}');

      const referenced = [...d.template.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]);
      for (const ref of referenced) {
        expect(d.params[ref]).toBeDefined();
      }
      for (const paramName of Object.keys(d.params)) {
        expect(referenced).toContain(paramName);
      }
    }
  });

  it('params are well-formed', () => {
    for (const d of library) {
      for (const param of Object.values(d.params)) {
        expect(PARAM_TYPES).toContain(param.type);
        expect(param.label.length).toBeGreaterThan(0);
        expect(typeof param.default).toBe('string');
        if (param.type === 'px') {
          expect(Number.isFinite(Number(param.default))).toBe(true);
        }
      }
    }
  });

  it('param defaults reproduce the example values verbatim', () => {
    const byId = getInlineDecorationMap();

    // 粗体例 1 / 例 5 / 例 6
    expect(byId.danqing.params.color.default).toBe('#009688');
    expect(byId.liucai.params.from.default).toBe('#4158d0');
    expect(byId.liucai.params.to.default).toBe('#c850c0');
    expect(byId.moyan.params.color.default).toBe('#1a1a1a');

    // 行内代码例 1（素笺）
    expect(byId.sujian.params.bg.default).toBe('#f3eee6');
    expect(byId.sujian.params.color.default).toBe('#8c3a3a');
    expect(byId.sujian.params.padY.default).toBe('3');
    expect(byId.sujian.params.padX.default).toBe('6');
    expect(byId.sujian.params.radius.default).toBe('4');
    expect(byId.sujian.params.fontSize.default).toBe('13.5px');
    expect(byId.sujian.params.font.default).toBe('Menlo, Monaco, Consolas, "Courier New", monospace');

    // 行内代码例 2/11（清泉）
    expect(byId.qingquan.params.bg.default).toBe('#e6f7fb');
    expect(byId.qingquan.params.color.default).toBe('#0e7490');
    expect(byId.qingquan.params.font.default).toBe('SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace');

    // 行内代码例 3/8（朱批）
    expect(byId.zhupi.params.bg.default).toBe('rgba(27,31,35,0.05)');
    expect(byId.zhupi.params.color.default).toBe('#d14');

    // 行内代码例 6/7（杏笺）
    expect(byId.xingjian.params.bg.default).toBe('#fff3ed');
    expect(byId.xingjian.params.color.default).toBe('#ff6b35');
    expect(byId.xingjian.params.radius.default).toBe('3');
    expect(byId.xingjian.params.fontSize.default).toBe('0.9em');

    // 行内代码例 9/10（琥珀）
    expect(byId.hupo.params.color.default).toBe('#eeaa33');
    expect(byId.hupo.params.bg.default).toBe('color-mix(in srgb, rgb(238,170,51) 8%, transparent)');
    expect(byId.hupo.params.borderColor.default).toBe('color-mix(in srgb, rgb(238,170,51) 20%, transparent)');
    expect(byId.hupo.params.shadow.default).toBe('rgba(0,0,0,0.08) 0px 1px 3px');

    // 行内代码例 12（靛青）
    expect(byId.dianqing.params.bg.default).toBe('#f0f2ff');
    expect(byId.dianqing.params.color.default).toBe('#4158d0');
    expect(byId.dianqing.params.radius.default).toBe('6');
    expect(byId.dianqing.params.borderColor.default).toBe('rgba(65,88,208,0.1)');

    // 行内代码例 13（黛蓝）
    expect(byId.dailan.params.bg.default).toBe('#f6f8fa');
    expect(byId.dailan.params.color.default).toBe('#1265d8');
    expect(byId.dailan.params.borderColor.default).toBe('#e4e6eb');
    expect(byId.dailan.params.font.default).toBe('\'Courier New\', monospace');
  });
});
