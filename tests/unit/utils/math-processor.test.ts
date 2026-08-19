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

  it('ignores $ inside fenced code blocks (no bogus cross-fence formula)', () => {
    const md = [
      '正文 $E=mc^2$',
      '```js',
      'const response = await fetch(`/api/users/${id}`);',
      'throw new Error(`Failed to fetch user: ${response.statusText}`);',
      '```',
      '$$\\frac{a}{b}$$',
    ].join('\n');
    const formulas = extractMathFormulas(md);
    expect(formulas.map((f) => [f.tex, f.display])).toEqual([
      ['E=mc^2', false],
      ['\\frac{a}{b}', true],
    ]);
  });

  it('ignores math inside inline code spans', () => {
    const md = '前文 `$x_1$` 是代码，$x_1$ 才是公式';
    const formulas = extractMathFormulas(md);
    expect(formulas.map((f) => f.tex)).toEqual(['x_1']);
  });

  it('ignores math inside tilde-fenced code blocks', () => {
    const md = ['~~~bash', 'echo $HOME', '~~~', '$y=2$'].join('\n');
    const formulas = extractMathFormulas(md);
    expect(formulas.map((f) => [f.tex, f.display])).toEqual([['y=2', false]]);
  });
});
