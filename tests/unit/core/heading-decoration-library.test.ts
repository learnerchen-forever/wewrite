import { getHeadingDecorationLibrary, getHeadingDecorationMap } from '../../../src/core/heading-decoration-library';

const COLOR_RE = /^(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|transparent)$/;
const PARAM_TYPES = ['color', 'number', 'px', 'text', 'select', 'image'];
const PALETTE_ROLES = ['primary', 'secondary', 'bg', 'shadow', 'on'];
const FAMILIES = ['none', 'line', 'block', 'composite', 'graphic'];
const SUGGESTED = ['h1-h2', 'h2-h4', 'h3-h6', 'all'];

describe('Heading decoration library', () => {
  const library = getHeadingDecorationLibrary();

  it('contains the 15 planned decorations (including none)', () => {
    expect(library).toHaveLength(15);
  });

  it('has unique ids and a complete map', () => {
    const ids = library.map(d => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    const map = getHeadingDecorationMap();
    expect(Object.keys(map)).toHaveLength(15);
    for (const d of library) {
      expect(map[d.id]).toEqual(d);
    }
  });

  it('every decoration has display fields, a valid family and suggested levels', () => {
    for (const d of library) {
      expect(d.name.length).toBeGreaterThan(0);
      expect(d.description.length).toBeGreaterThan(0);
      expect(FAMILIES).toContain(d.family);
      expect(d.builtin).toBe(true);
      if (d.suggestedLevels) {
        expect(SUGGESTED).toContain(d.suggestedLevels);
      }
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

      const open = (d.template.match(/\{#number\}/g) || []).length;
      const close = (d.template.match(/\{\/number\}/g) || []).length;
      expect(open).toBe(close);

      const referenced = [...d.template.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]);
      for (const ref of referenced) {
        expect(d.params[ref]).toBeDefined();
      }
      for (const paramName of Object.keys(d.params)) {
        expect(referenced).toContain(paramName);
      }
    }
  });

  it('params are well-formed (type, label, default, paletteRole)', () => {
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
        if (param.paletteRole) {
          expect(PALETTE_ROLES).toContain(param.paletteRole);
        }
      }
    }
  });

  it('templates do not hardcode root positioning or typography on the text carrier', () => {
    for (const d of library) {
      if (d.id === 'none') continue;
      expect(d.template).not.toContain('margin:auto');
      // The typography triple is injected by the system on the text carrier;
      // decorative elements may still set their own font (e.g. ghostNumber's
      // number div uses font-family:{{numFont}}).
      for (const m of d.template.matchAll(/<[^>]*>\s*\{text\}/g)) {
        expect(m[0]).not.toMatch(/font-family/);
        expect(m[0]).not.toMatch(/font-weight/);
      }
    }
  });

  it('key decorations match the design examples (§2.1)', () => {
    const map = getHeadingDecorationMap();

    expect(map.leafPair.template).toContain('{#number}');
    expect(map.leafPair.template).toContain('{/number}');
    expect(map.leafPair.params.colorA.default).toBe('#86a245');
    expect(map.leafPair.params.colorB.default).toBe('#ce9c61');

    expect(map.ghostNumber.template.trimStart().startsWith('<section')).toBe(true);
    expect(map.ghostNumber.template).toContain('font-size:2.5em');

    expect(map.none.template).toBe('');
    expect(map.bgImage.params.imageUrl.type).toBe('image');
    expect(map.shadowBlock.params.shadowColor.paletteRole).toBe('shadow');
  });

  it('pillTriangle (玉树临风) uses example-derived variables', () => {
    const d = getHeadingDecorationMap().pillTriangle;
    expect(d.name).toBe('Jade Tree');
    expect(d.template).toContain('border-bottom:{{lineWidth}}px solid {{blockColor}}');
    expect(d.template).toContain('background:{{blockColor}}');
    expect(d.template).not.toContain('padding-bottom:12px'); // no gap under the block
    expect(d.template).toContain('font-size:${size}');
    expect(d.template).toContain('calc(1.5em + {{padTop}}px + {{padBottom}}px - {{triDiff}}px)');
    expect(d.params.blockColor.default).toBe('#21a675');
    expect(d.params.shadowColor.default).toBe('#efece9');
    expect(d.params.lineWidth.default).toBe('2');
    expect(d.params.radius.default).toBe('3');
    expect(d.params.padTop.default).toBe('10');
    expect(d.params.padX.default).toBe('15');
    expect(d.params.padBottom.default).toBe('10');
    expect(d.params.gap.default).toBe('3');
    expect(d.params.triDiff.default).toBe('10');
    expect(d.params.triWidth.default).toBe('20');
  });

  it('centerBlock (橙黄中正) uses example-derived variables and ｜ separator', () => {
    const d = getHeadingDecorationMap().centerBlock;
    expect(d.name).toBe('Amber Center Block');
    expect(d.template).toContain('background:{{blockColor}}');
    expect(d.template).toContain('color:#fff');
    expect(d.template).toContain('{#number}{number}<span style="margin:0 {{sepGap}}px">｜</span>{/number}{text}');
    expect(d.params.blockColor.default).toBe('#eeaa33');
    expect(d.params.radius.default).toBe('8');
    expect(d.params.shadowColor.default).toBe('rgba(0,0,0,0.1)');
    expect(d.params.sepGap.default).toBe('0');
  });

  it('pill (蓝色胶囊) uses example-derived variables', () => {
    const d = getHeadingDecorationMap().pill;
    expect(d.name).toBe('Blue Pill');
    expect(d.template).toContain('background:{{blockColor}}');
    expect(d.template).toContain('color:#fff');
    expect(d.template).not.toContain('${bgColor}');
    expect(d.template).not.toContain('${onColor}');
    expect(d.params.blockColor.default).toBe('#0d47a1');
    expect(d.params.padY.default).toBe('5');
    expect(d.params.padX.default).toBe('14');
    expect(d.params.radius).toBeUndefined(); // capsule radius = half height, not a variable
    expect(d.template).toContain('border-radius:999px');
  });

  it('curtain (朱帘映墨) follows align and uses example-derived variables', () => {
    const d = getHeadingDecorationMap().curtain;
    expect(d.name).toBe('Crimson Curtain');
    expect(d.template).toContain('justify-content:${align}');
    expect(d.template).toContain('border-top:2px solid {{blockColor}}');
    expect(d.template).toContain('background:{{blockColor}}');
    expect(d.template).not.toContain('${color}');
    expect(d.params.blockColor.default).toBe('#8c3a3a');
    expect(d.params.padTop.default).toBe('5');
    expect(d.params.padX.default).toBe('18');
    expect(d.params.padBottom.default).toBe('7');
    expect(d.params.radius.default).toBe('12');
    expect(d.params.letterSpacing.default).toBe('2');
  });

  it('cornerNails (素笺留痕) uses example-derived variables and follows align', () => {
    const d = getHeadingDecorationMap().cornerNails;
    expect(d.name).toBe('Corner Nails');
    expect(d.template).toContain('text-align:${align}');
    expect(d.template).toContain('border:1px solid {{borderColor}}');
    expect(d.template).toContain('background:{{bgColor}}');
    expect(d.template).toContain('background:{{dotColor}}');
    expect(d.template).toContain('border-top:2px solid {{shadowColor}}');
    expect(d.template).toContain('padding:{{pad}}px');
    expect(d.template).toContain('margin:-5px 14px -5px 15px');
    expect(d.template).not.toContain('${bgColor}');
    expect(d.template).not.toContain('{{dotA}}');
    expect(d.params.borderColor.default).toBe('#1449db');
    expect(d.params.bgColor.default).toBe('rgba(255,255,255,0.99)');
    expect(d.params.shadowColor.default).toBe('#d7e1ff');
    expect(d.params.pad.default).toBe('12');
    expect(d.params.dotColor.default).toBe('#1449db');
  });

  it('ghostNumber (独标序章) uses example-derived variables and follows align', () => {
    const d = getHeadingDecorationMap().ghostNumber;
    expect(d.name).toBe('Ghost Number');
    expect(d.template).toContain('text-align:${align}');
    expect(d.template).not.toContain('text-align:center');
    expect(d.template).toContain('font-family:{{numFont}}');
    expect(d.template).toContain('font-style:{{numItalic}}');
    expect(d.template).toContain('font-weight:{{numBold}}');
    expect(d.template).toContain('color:{{numColor}}');
    expect(d.template).toContain('margin-bottom:{{gap}}px');
    expect(d.params.numFont.type).toBe('select');
    expect(d.params.numFont.default).toBe('inherit');
    expect(d.params.numFont.options).toContain('宋体');
    expect(d.params.numItalic.type).toBe('select');
    expect(d.params.numItalic.default).toBe('italic');
    expect(d.params.numItalic.options).toEqual(['normal', 'italic']);
    expect(d.params.numBold.type).toBe('select');
    expect(d.params.numBold.default).toBe('bold');
    expect(d.params.numBold.options).toEqual(['normal', 'bold']);
    expect(d.params.numColor.default).toBe('rgba(217,31,0,0.19)');
    expect(d.params.gap.default).toBe('-20');
  });

  it('leafPair (双叶蕴章) carries the renamed display name', () => {
    const d = getHeadingDecorationMap().leafPair;
    expect(d.name).toBe('Twin Leaf Emblem');
    expect(d.template).toContain('{#number}');
    expect(d.template).toContain('{/number}');
  });

  it('lightBg (碧玉门楣) uses example-derived gradient and padding variables', () => {
    const d = getHeadingDecorationMap().lightBg;
    expect(d.name).toBe('Jade Lintel');
    expect(d.template).toContain('linear-gradient(to right,{{from}},{{to}})');
    expect(d.template).toContain('color:#fff');
    expect(d.template).toContain('padding:{{padY}}px {{padX}}px');
    expect(d.template).not.toContain('${bgColor}');
    expect(d.params.from.default).toBe('#42b983');
    expect(d.params.to.default).toBe('#85d7b3');
    expect(d.params.padY.default).toBe('10');
    expect(d.params.padX.default).toBe('16');
    expect(d.params.radius.default).toBe('4');
  });

  it('underlineBlock (彤笺展绪) uses example-derived variables and follows align', () => {
    const d = getHeadingDecorationMap().underlineBlock;
    expect(d.name).toBe('Vermilion Banner');
    expect(d.template).toContain('justify-content:${align}');
    expect(d.template).toContain('border-bottom:2px solid {{blockColor}}');
    expect(d.template).toContain('background:{{blockColor}}');
    expect(d.template).toContain('color:#fff');
    expect(d.template).toContain('padding:{{padTop}}px {{padX}}px {{padBottom}}px');
    expect(d.template).toContain('border-radius:{{radius}}px {{radius}}px 0 0');
    expect(d.template).not.toContain('${color}');
    expect(d.params.blockColor.default).toBe('#ef7060');
    expect(d.params.radius.default).toBe('3');
    expect(d.params.padTop.default).toBe('3');
    expect(d.params.padX.default).toBe('10');
    expect(d.params.padBottom.default).toBe('1');
  });

  it('roundGradient (左滴玉露) carries the renamed display name', () => {
    const d = getHeadingDecorationMap().roundGradient;
    expect(d.name).toBe('Dewdrop Gradient');
    expect(d.template).toContain('linear-gradient(90deg,{{from}},{{to}})');
    expect(d.template).toContain('border-radius:{{radiusA}}px {{radiusA}}px {{radiusA}}px {{radiusB}}px');
  });

  it('bgImage (山水之间) layers the image behind the title and follows align', () => {
    const d = getHeadingDecorationMap().bgImage;
    expect(d.name).toBe('Landscape Backdrop');
    expect(d.template).toContain('text-align:${align}');
    expect(d.template).toContain('position:absolute');
    expect(d.template).toContain('left:{{posX}}%;top:{{posY}}%');
    expect(d.template).toContain('transform:translate(-50%,-50%)');
    expect(d.template).toContain('background:url({{imageUrl}}) center/contain no-repeat');
    expect(d.template).toContain('opacity:{{opacity}}');
    expect(d.template).toContain('color:{{textColor}}');
    expect(d.template).not.toContain('${color}');
    expect(d.params.imageUrl.type).toBe('image');
    expect(d.params.imageUrl.default).toBe('https://mmbiz.qpic.cn/mmbiz_png/icQCHkItGlqjv4TuKguTOCWiaqvfxmBic5aIvw9PEf467Iy2Nj5Rm0v2n3VgWHe9XmCmQvMk1OScZX0CfFy1NDl8K9LRv32suyuvsxUFuFlaLI/');
    expect(d.params.imageSize.default).toBe('160');
    expect(d.params.posX.default).toBe('120');
    expect(d.params.posY.default).toBe('30');
    expect(d.params.opacity.default).toBe('0.8');
    expect(d.params.textColor.default).toBe('#48b378');
  });

  it('gradientBlock (渐变门楣) carries the renamed display name', () => {
    const d = getHeadingDecorationMap().gradientBlock;
    expect(d.name).toBe('Gradient Lintel');
    expect(d.template).toContain('linear-gradient(135deg,{{from}},{{to}})');
  });

  it('shadowBlock (笺简影疏) uses example-derived variables', () => {
    const d = getHeadingDecorationMap().shadowBlock;
    expect(d.name).toBe('Shadow Block');
    expect(d.template).toContain('display:inline-block');
    expect(d.template).toContain('background:{{blockColor}}');
    expect(d.template).toContain('color:#fff');
    expect(d.template).toContain('padding:{{padY}}px {{padX}}px');
    expect(d.template).toContain('border-radius:{{radius}}px');
    expect(d.template).toContain('box-shadow:{{shadowColor}} 5px 5px 0');
    expect(d.template).not.toContain('${bgColor}');
    expect(d.params.blockColor.default).toBe('#10b981');
    expect(d.params.shadowColor.default).toBe('#e9ddff');
    expect(d.params.shadowColor.paletteRole).toBe('shadow');
    expect(d.params.padY.default).toBe('8');
    expect(d.params.padX.default).toBe('12');
    expect(d.params.radius.default).toBe('0');
  });

  it('plaque (任意牌匾) merges borders, background and gradient line controls', () => {
    const d = getHeadingDecorationMap().plaque;
    expect(d.name).toBe('Custom Plaque');
    expect(d.template).toContain('display:inline-block');
    expect(d.template).toContain('color:{{textColor}}');
    expect(d.template).toContain('background-image:linear-gradient(to right,{{fadeFrom}},{{fadeTo}}),linear-gradient(to right,{{bgFrom}},{{bgTo}})');
    expect(d.template).toContain('background-size:{{fadeWidth}}% {{fadeHeight}}px,100% 100%');
    expect(d.template).toContain('border-radius:{{radius}}px');
    expect(d.template).toContain('padding:{{padY}}px {{padX}}px');
    expect(d.template).toContain('border-top:{{topStyle}} {{topWidth}}px {{topColor}}');
    expect(d.template).toContain('border-right:{{rightStyle}} {{rightWidth}}px {{rightColor}}');
    expect(d.template).toContain('border-bottom:{{bottomStyle}} {{bottomWidth}}px {{bottomColor}}');
    expect(d.template).toContain('border-left:{{leftStyle}} {{leftWidth}}px {{leftColor}}');
    expect(d.params.radius.default).toBe('4');
    expect(d.params.bgFrom.default).toBe('transparent');
    expect(d.params.bgTo.default).toBe('transparent');
    expect(d.params.padY.default).toBe('8');
    expect(d.params.padX.default).toBe('12');
    expect(d.params.textColor.default).toBe('#333333');
    expect(d.params.topStyle.options).toEqual(['none', 'solid', 'dashed', 'dotted']);
    expect(d.params.topWidth.default).toBe('1');
    expect(d.params.topColor.default).toBe('#3b82f6');
    expect(d.params.bottomStyle.default).toBe('solid');
    expect(d.params.fadeFrom.default).toBe('transparent');
    expect(d.params.fadeTo.default).toBe('transparent');
    expect(d.params.fadeWidth.default).toBe('60');
    expect(d.params.fadeHeight.default).toBe('2');
  });

  it('built-in templates use the level-agnostic {tag} placeholder', () => {
    for (const d of library) {
      if (d.id === 'none') continue;
      expect(d.template).not.toMatch(/<h[1-6]\b/);
      expect(d.template).toContain('{tag}');
    }
  });
});
