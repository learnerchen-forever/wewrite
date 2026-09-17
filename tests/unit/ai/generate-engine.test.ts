// generate-engine.test.ts — Mermaid / math generation: normalising the reply,
// checking it locally, and repairing it once when the check fails.

jest.mock('obsidian', () => ({ requestUrl: jest.fn() }));

import { generateMath, generateMermaid } from '../../../src/ai/generate-engine';
import { normalizeMermaidSource, validateMermaid } from '../../../src/ai/mermaid-output';
import {
  ensureMathMarkdown,
  parseMathOutput,
  renderMathMarkdown,
  structuralMathIssues,
  validateLatex,
} from '../../../src/ai/math-output';
import { requestUrl } from 'obsidian';

const ACCOUNT = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: 'k',
  model: 'gpt-4o',
  provider: 'openai' as const,
};

const mockRequest = requestUrl as jest.Mock;

/** Queue provider replies, one per request. */
function replies(...contents: string[]): void {
  for (const content of contents) {
    mockRequest.mockResolvedValueOnce({
      status: 200,
      json: { choices: [{ message: { content } }] },
      text: '{}',
    });
  }
}

afterEach(() => {
  mockRequest.mockReset();
});

describe('normalizeMermaidSource', () => {
  it('unwraps a fenced block', () => {
    expect(normalizeMermaidSource('```mermaid\nflowchart LR\n  A --> B\n```'))
      .toBe('flowchart LR\n  A --> B');
  });

  it('drops prose written before the diagram', () => {
    expect(normalizeMermaidSource('Here is the diagram:\n\nflowchart LR\n  A --> B'))
      .toBe('flowchart LR\n  A --> B');
  });

  it('drops a trailing sentence but keeps a mindmap body of plain text lines', () => {
    expect(normalizeMermaidSource('flowchart LR\n  A --> B\n\n以上图表展示了完整流程。'))
      .toBe('flowchart LR\n  A --> B');
    const mindmap = 'mindmap\n  root((主题))\n    分支一\n    分支二';
    expect(normalizeMermaidSource(mindmap)).toBe(mindmap);
  });

  it('keeps an unterminated fence body', () => {
    expect(normalizeMermaidSource('```mermaid\nflowchart LR\n  A --> B')).toBe('flowchart LR\n  A --> B');
  });
});

describe('validateMermaid', () => {
  it('accepts a well-formed diagram', () => {
    expect(validateMermaid('flowchart LR\n  A["开始"] --> B["结束"]')).toEqual([]);
  });

  it('accepts a sequence diagram with balanced blocks', () => {
    expect(validateMermaid('sequenceDiagram\n  A->>B: hi\n  loop 重试\n    B-->>A: ok\n  end')).toEqual([]);
  });

  it('reports an empty answer', () => {
    expect(validateMermaid('   ')).toEqual([{ code: 'empty' }]);
  });

  it('reports a reply that is not a diagram at all', () => {
    const issues = validateMermaid('Sure, here is a flowchart for you.');
    expect(issues[0].code).toBe('unknown-first-line');
  });

  it('reports a fence left in the source', () => {
    const issues = validateMermaid('```mermaid\nflowchart LR\n  A --> B\n```');
    expect(issues.map((i) => i.code)).toContain('fence-left');
  });

  it('reports an unclosed label quote', () => {
    const issues = validateMermaid('flowchart LR\n  A["未闭合 --> B');
    expect(issues.map((i) => i.code)).toContain('unbalanced-quote');
  });

  it('reports a subgraph without its end', () => {
    const issues = validateMermaid('flowchart LR\n  subgraph 一组\n  A --> B');
    expect(issues).toContainEqual({
      code: 'unbalanced-block',
      detail: 'expected 1 "end", found 0',
    });
  });

  it('reports `end` used as a node id', () => {
    const issues = validateMermaid('flowchart LR\n  A --> end');
    expect(issues.map((i) => i.code)).toContain('end-as-node');
  });

  it('ignores the word end inside a quoted label', () => {
    expect(validateMermaid('flowchart LR\n  A["weekend"] --> B["结束"]')).toEqual([]);
  });
});

describe('generateMermaid', () => {
  it('returns the diagram and no problems when the first answer passes', async () => {
    replies('```mermaid\nflowchart LR\n  A --> B\n```');
    const result = await generateMermaid(ACCOUNT, 'a flow');
    expect(result.code).toBe('flowchart LR\n  A --> B');
    expect(result.problems).toEqual([]);
    expect(result.calls).toBe(1);
  });

  it('sends the problem back for one repair turn and keeps the fixed diagram', async () => {
    replies('Sure! Here you go.', 'flowchart LR\n  A --> B');
    const result = await generateMermaid(ACCOUNT, 'a flow');
    expect(result.calls).toBe(2);
    expect(result.code).toBe('flowchart LR\n  A --> B');
    expect(result.problems).toEqual([]);
    // The retry has to know what was wrong with the first answer.
    const repairPrompt = mockRequest.mock.calls[1][0].body as string;
    expect(repairPrompt).toContain('does not start with a known diagram type');
  });

  it('keeps the first answer when the repair turn is no better', async () => {
    replies('flowchart LR\n  A --> end', 'still not a diagram');
    const result = await generateMermaid(ACCOUNT, 'a flow');
    expect(result.calls).toBe(1);
    expect(result.code).toBe('flowchart LR\n  A --> end');
    expect(result.problems.map((p) => p.kind === 'mermaid' && p.issue.code)).toEqual(['end-as-node']);
  });

  it('pins the diagram type when the user chose one', async () => {
    replies('sequenceDiagram\n  A->>B: hi');
    await generateMermaid(ACCOUNT, 'a flow', { diagramType: 'sequenceDiagram' });
    expect(mockRequest.mock.calls[0][0].body as string).toContain('sequenceDiagram');
  });
});

describe('parseMathOutput / renderMathMarkdown', () => {
  it('reads a display block', () => {
    expect(parseMathOutput('$$\nx = 1\n$$')).toEqual([{ tex: 'x = 1', display: true }]);
  });

  it('does not wrap an already-delimited answer a second time', () => {
    expect(renderMathMarkdown(parseMathOutput('$x = 1$', 'display'))).toBe('$$\nx = 1\n$$');
    expect(ensureMathMarkdown('$$\nx = 1\n$$')).toBe('$$\nx = 1\n$$');
    expect(ensureMathMarkdown('$x = 1$')).toBe('$x = 1$');
    expect(ensureMathMarkdown('x = 1')).toBe('$$\nx = 1\n$$');
  });

  it('turns a single short formula into inline math when that is what was asked', () => {
    expect(parseMathOutput('$$\nx = 1\n$$', 'inline')).toEqual([{ tex: 'x = 1', display: false }]);
  });

  it('keeps a multi-line formula in display form even when inline was asked', () => {
    const formulas = parseMathOutput('$$\\begin{aligned}a &= b\\\\c &= d\\end{aligned}$$', 'inline');
    expect(formulas[0].display).toBe(true);
  });

  it('keeps several equations in document order', () => {
    const formulas = parseMathOutput('先 $a$ 再 $$b$$ 最后 $c$');
    expect(formulas.map((f) => f.tex)).toEqual(['a', 'b', 'c']);
  });

  it('keeps the inline form when that is what the user asked for', () => {
    const formulas = parseMathOutput('见 $a$ 与 $b$', 'inline');
    expect(formulas.map((f) => f.display)).toEqual([false, false]);
  });

  it('never turns a multi-line formula into inline math', () => {
    const formulas = parseMathOutput('$$\\begin{aligned}a &= b\\\\c &= d\\end{aligned}$$', 'inline');
    expect(formulas[0].display).toBe(true);
  });

  it('drops a leading "here is the formula:" line', () => {
    expect(parseMathOutput('这是求根公式：\n$$x = 1$$')).toEqual([{ tex: 'x = 1', display: true }]);
  });

  it('accepts bare LaTeX and the other delimiter styles', () => {
    expect(parseMathOutput('\\frac{a}{b}')).toEqual([{ tex: '\\frac{a}{b}', display: true }]);
    expect(parseMathOutput('\\[E = mc^2\\]')).toEqual([{ tex: 'E = mc^2', display: true }]);
    // `\(…\)` is explicit inline intent, honoured when inline is what was asked.
    expect(parseMathOutput('\\(a + b\\)', 'inline')).toEqual([{ tex: 'a + b', display: false }]);
    expect(parseMathOutput('\\(a + b\\)')).toEqual([{ tex: 'a + b', display: true }]);
  });

  it('does not read prices as inline math', () => {
    // "$100 和 $200" is money, not a formula — and it is not LaTeX either.
    expect(parseMathOutput('花了 $100 和 $200')).toEqual([]);
  });

  it('finds no formula in an apology', () => {
    expect(parseMathOutput('I cannot express that as a formula.')).toEqual([]);
    expect(parseMathOutput('抱歉，这段描述无法转成公式。')).toEqual([]);
  });
});

describe('structuralMathIssues', () => {
  it('accepts balanced LaTeX', () => {
    expect(structuralMathIssues('\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}')).toEqual([]);
  });

  it('reports an unclosed brace', () => {
    expect(structuralMathIssues('\\frac{a}{b')).toContain('1 unclosed brace(s) {');
  });

  it('reports a begin without its end', () => {
    expect(structuralMathIssues('\\begin{cases} a & b')).toContain('\\begin{cases} is never closed');
  });

  it('reports unbalanced \\left', () => {
    expect(structuralMathIssues('\\left( a + b')).toContain('\\left appears 1 time(s) and \\right 0 time(s)');
  });

  it('ignores escaped braces', () => {
    expect(structuralMathIssues('\\{ x \\}')).toEqual([]);
  });
});

describe('validateLatex', () => {
  it('compiles a valid formula with MathJax', async () => {
    await expect(validateLatex('\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}', true)).resolves.toBeNull();
  });

  it("returns MathJax's own error for an invalid one", async () => {
    await expect(validateLatex('\\frac{a}{b', true)).resolves.toBe('Missing close brace');
  });
});

describe('generateMath', () => {
  it('returns the formula with delimiters when it compiles', async () => {
    replies('$$\nx = \\frac{1}{2}\n$$');
    const result = await generateMath(ACCOUNT, 'one half');
    expect(result.code).toBe('$$\nx = \\frac{1}{2}\n$$');
    expect(result.problems).toEqual([]);
    expect(result.calls).toBe(1);
  });

  it('repairs a formula MathJax rejects, using the reported error', async () => {
    replies('$$E = mc^2 &$$', '$$E = mc^2$$');
    const result = await generateMath(ACCOUNT, 'mass energy');
    expect(result.calls).toBe(2);
    expect(result.code).toBe('$$\nE = mc^2\n$$');
    expect(result.problems).toEqual([]);
    expect(mockRequest.mock.calls[1][0].body as string).toContain('Misplaced &');
  });

  it('keeps the broken formula but reports why when the retry does not help', async () => {
    replies('$$E = mc^2 &$$', '$$F = ma &$$');
    const result = await generateMath(ACCOUNT, 'mass energy');
    expect(result.calls).toBe(1);
    expect(result.code).toBe('$$\nE = mc^2 &\n$$');
    expect(result.problems).toEqual([{ kind: 'math', message: 'Misplaced &' }]);
  });

  it('reports a structural problem without asking MathJax', async () => {
    replies('$$\\frac{a}{b$$', '$$\\frac{a}{b}$$');
    const result = await generateMath(ACCOUNT, 'a over b');
    expect(result.calls).toBe(2);
    expect(result.code).toBe('$$\n\\frac{a}{b}\n$$');
    expect(mockRequest.mock.calls[1][0].body as string).toContain('unclosed brace');
  });

  it('reports an answer with no formula in it, and offers nothing to insert', async () => {
    replies('I cannot express that as a formula.', 'Sorry, still not possible.');
    const result = await generateMath(ACCOUNT, 'something vague');
    expect(result.code).toBe('');
    expect(result.problems).toEqual([{ kind: 'math', message: 'No formula found in the answer.' }]);
  });
});
