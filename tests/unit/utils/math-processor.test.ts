import { extractMathFormulas } from '../../../src/utils/math-processor';

describe('extractMathFormulas', () => {
  it('extracts inline and block math in document order', () => {
    const md = '前文 $E=mc^2$ 中间 $$\\frac{a}{b}$$ 结尾 $x_1$';
    const formulas = extractMathFormulas(md);
    expect(formulas.map((f) => [f.tex, f.display])).toEqual([
      ['E=mc^2', false],
      ['\\frac{a}{b}', true],
      ['x_1', false],
    ]);
  });

  it('returns empty when there is no math', () => {
    expect(extractMathFormulas('普通文本，没有公式')).toEqual([]);
  });
});
