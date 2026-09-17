// prompt-templates.test.ts — message builders for the AI assistance features.
//
// What matters here is the contract each prompt states: the exact JSON shape
// the parser expects, the sentinel that delimits the user text, and the rules
// that keep non-translatable spans out of the model's reach.

jest.mock('obsidian', () => ({ requestUrl: jest.fn() }));

import {
  buildMermaidMessages,
  buildMermaidRepairMessages,
  buildMathMessages,
  buildMathRepairMessages,
  buildProofreadMessages,
  buildSynonymsMessages,
  buildTranslateMessages,
} from '../../../src/ai/prompt-templates';

describe('proofread messages', () => {
  it('carry the text and the JSON rules', () => {
    const msgs = buildProofreadMessages('Some text.', 'ctx-before', 'ctx-after');
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toContain('corrections');
    expect(msgs[1].content).toContain('Some text.');
    expect(msgs[1].content).toContain('ctx-before');
    expect(msgs[1].content).toContain('ctx-after');
  });

  it('delimits the text with a sentinel that cannot appear in a note', () => {
    expect(buildProofreadMessages('a """ b')[1].content).toContain('<text>\na """ b\n</text>');
  });
});

describe('synonyms messages', () => {
  it('ask for the documented JSON object', () => {
    const msgs = buildSynonymsMessages('happy', 'She was happy to help.');
    expect(msgs[0].content).toContain('"sense"');
    expect(msgs[0].content).toContain('"synonyms"');
    expect(msgs[0].content).toContain('JSON object');
    expect(msgs[1].content).toContain('<word>\nhappy\n</word>');
    expect(msgs[1].content).toContain('She was happy to help.');
    expect(msgs[1].content).toContain('READ-ONLY');
  });

  it('omit the context block when there is no context', () => {
    expect(buildSynonymsMessages('happy')[1].content).not.toContain('<context>');
  });
});

describe('translate messages', () => {
  it('state the target language and delimit the text', () => {
    const msgs = buildTranslateMessages('你好', 'English');
    expect(msgs[1].content).toContain('<target_language>English</target_language>');
    expect(msgs[1].content).toContain('<text>\n你好\n</text>');
  });

  it('add the placeholder rules only when the text has placeholders', () => {
    expect(buildTranslateMessages('hi', 'English').at(0)?.content).not.toContain('{{0}}');
    const withPlaceholders = buildTranslateMessages('see {{0}}', 'English', { hasPlaceholders: true });
    expect(withPlaceholders[0].content).toContain('{{0}}');
    expect(withPlaceholders[0].content).toContain('Never translate, rename, renumber');
  });

  it('pass the terminology anchor as read-only', () => {
    const msgs = buildTranslateMessages('text', '简体中文', { context: 'Earlier paragraph.' });
    expect(msgs[1].content).toContain('<context>\nEarlier paragraph.\n</context>');
    expect(msgs[1].content).toContain('READ-ONLY');
  });
});

describe('mermaid messages', () => {
  it('include the skill and the selection context', () => {
    const msgs = buildMermaidMessages('draw a flow', 'selection context');
    expect(msgs[0].content).toContain('Mermaid');
    expect(msgs[0].content).toContain('end');           // the reserved-word rule
    expect(msgs[1].content).toContain('draw a flow');
    expect(msgs[1].content).toContain('selection context');
  });

  it('pin the diagram type when one was chosen', () => {
    const msgs = buildMermaidMessages('draw a flow', '', { diagramType: 'sequenceDiagram' });
    expect(msgs[0].content).toContain('Use `sequenceDiagram`');
    expect(buildMermaidMessages('draw a flow', '')[0].content).not.toContain('This request');
  });

  it('omit the context block when nothing is selected', () => {
    expect(buildMermaidMessages('draw a flow', '')[1].content).not.toContain('<note_context>');
  });

  it('hand the previous answer back on the repair turn', () => {
    const msgs = buildMermaidRepairMessages('flow', '', 'broken', ['Unknown diagram type.']);
    expect(msgs.at(-1)?.content).toContain('Unknown diagram type.');
    expect(msgs.some((m) => m.role === 'assistant' && m.content === 'broken')).toBe(true);
    expect(msgs[0].content).toContain('Repair turn');
  });
});

describe('math messages', () => {
  it('include the skill and skip an empty selection context', () => {
    const msgs = buildMathMessages('e=mc2', '');
    expect(msgs[0].content).toContain('MathJax');
    expect(msgs[1].content).toContain('e=mc2');
    expect(msgs[1].content).not.toContain('<note_context>');
  });

  it('ask for the form the user picked', () => {
    expect(buildMathMessages('x', '', { mathDisplay: 'inline' })[0].content).toContain('INLINE math');
    expect(buildMathMessages('x', '', { mathDisplay: 'display' })[0].content).toContain('DISPLAY math');
  });

  it('carry the compiler error on the repair turn', () => {
    const msgs = buildMathRepairMessages('x', '', '$$a$$', 'Missing close brace');
    expect(msgs.at(-1)?.content).toContain('Missing close brace');
    expect(msgs[0].content).toContain('Repair turn');
  });
});
