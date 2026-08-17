// Unit tests for Dataview query extraction (pure functions only — the
// rendering half needs the Obsidian + Dataview plugin runtime).

import {
  extractDataviewBlocks,
  escapeMarkdownText,
  addBlockquotePrefix,
} from '../../../src/media/dataview-renderer';

describe('extractDataviewBlocks', () => {
  it('extracts ```dataview fenced blocks', () => {
    const md = [
      '# Title',
      '',
      '```dataview',
      'TABLE file.name, file.mtime',
      'WHERE file.folder = "inbox"',
      'SORT file.mtime DESC',
      '```',
      '',
      'Some text',
    ].join('\n');
    const blocks = extractDataviewBlocks(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('dataview');
    expect(blocks[0].code).toContain('TABLE file.name');
    expect(blocks[0].code).toContain('SORT file.mtime DESC');
    expect(blocks[0].fullMatch).toContain('```dataview');
    expect(blocks[0].fullMatch.endsWith('```')).toBe(true);
  });

  it('extracts ```dataviewjs blocks and does not mislabel them as dataview', () => {
    const md = '```dataviewjs\nconst pages = dv.pages();\ndv.table(["Name"], pages.map(p => [p.file.name]));\n```';
    const blocks = extractDataviewBlocks(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('dataviewjs');
    expect(blocks[0].code).toContain('dv.pages()');
  });

  it('supports a query on the opening fence line', () => {
    const md = '```dataview LIST FROM "projects"\n```';
    const blocks = extractDataviewBlocks(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('dataview');
    expect(blocks[0].code).toBe('LIST FROM "projects"');
  });

  it('extracts inline $= expressions', () => {
    const md = 'Note count: $= dv.pages().length';
    const blocks = extractDataviewBlocks(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('inline');
    expect(blocks[0].code).toBe('dv.pages().length');
    expect(blocks[0].fullMatch).toBe('$= dv.pages().length');
  });

  it('ignores $= inside fenced code blocks (any language)', () => {
    const md = [
      '```js',
      'const x = 1; // $= not a dataview query',
      '```',
      '```dataviewjs',
      'const s = "$= still inside a block";',
      '```',
      'real: $= dv.pages().length',
    ].join('\n');
    const blocks = extractDataviewBlocks(md);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe('dataviewjs');
    expect(blocks[1].type).toBe('inline');
    expect(blocks[1].code).toBe('dv.pages().length');
  });

  it('ignores $= inside inline code spans', () => {
    const md = 'Use `$= dv.pages()` carefully — and real: $= 42';
    const blocks = extractDataviewBlocks(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].code).toBe('42');
  });

  it('skips empty inline expressions', () => {
    const md = 'Trailing $= \nnext line';
    const blocks = extractDataviewBlocks(md);
    expect(blocks).toHaveLength(0);
  });

  it('returns blocks sorted by document offset', () => {
    const md = 'inline: $= 1\n\n```dataview\nTABLE file.name\n```\n\ntail $= 2';
    const blocks = extractDataviewBlocks(md);
    expect(blocks.map((b) => b.type)).toEqual(['inline', 'dataview', 'inline']);
    expect(blocks[0].offset).toBeLessThan(blocks[1].offset);
    expect(blocks[1].offset).toBeLessThan(blocks[2].offset);
  });

  it('returns an empty array when no dataview syntax is present', () => {
    expect(extractDataviewBlocks('plain markdown\n\n```js\ncode\n```')).toEqual([]);
  });

  it('extracts dataview blocks inside blockquotes/callouts and strips the `> ` prefix', () => {
    const md = [
      '> [!bug] Bug',
      '> ',
      '> ```dataview',
      '> TASK FROM "inbox"',
      '> ```',
    ].join('\n');
    const blocks = extractDataviewBlocks(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('dataview');
    expect(blocks[0].prefix).toBe('> ');
    expect(blocks[0].code).toBe('TASK FROM "inbox"');
    expect(blocks[0].fullMatch).toContain('> ```dataview');
  });

  it('extracts dataview blocks at nested blockquote depth', () => {
    const md = '> > ```dataview\n> > LIST FROM "x"\n> > ```';
    const blocks = extractDataviewBlocks(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].prefix).toBe('> > ');
    expect(blocks[0].code).toBe('LIST FROM "x"');
  });
});

describe('addBlockquotePrefix', () => {
  it('prefixes every non-empty line so the block stays inside a callout', () => {
    expect(addBlockquotePrefix('- [ ] a\n- [ ] b', '> ')).toBe('> - [ ] a\n> - [ ] b');
  });

  it('returns the markdown unchanged when there is no prefix', () => {
    expect(addBlockquotePrefix('- a', undefined)).toBe('- a');
    expect(addBlockquotePrefix('- a', '')).toBe('- a');
  });
});

describe('escapeMarkdownText', () => {
  it('escapes markdown-significant characters so values render literally', () => {
    expect(escapeMarkdownText('3 notes *unchecked*')).toBe('3 notes \\*unchecked\\*');
    expect(escapeMarkdownText('a_b.md')).toBe('a\\_b\\.md');
    expect(escapeMarkdownText('score: 0.42')).toBe('score: 0\\.42');
    expect(escapeMarkdownText('plain text')).toBe('plain text');
  });
});
