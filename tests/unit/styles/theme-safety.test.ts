// The static gate in front of a downloaded theme note (`theme-safety.ts`).
//
// The interesting assertions are the two asymmetry guards: everything that
// must be refused is refused, and the note *body* — which is a demonstration
// document and may legitimately show an XSS payload inside a code fence — is
// never touched. A gate that rejects honest themes gets removed by the next
// person who trips over it, so both halves are pinned here.

import { inspectThemeNote, THEME_SAFETY_RULES } from '../../../src/styles/theme-safety';

function theme(frontmatterExtra: string, body = '# 一级标题\n\n正文段落。\n'): string {
  return [
    '---',
    'wewrite_theme: true',
    "wewrite_theme_version: '3.0'",
    'wewrite_theme_name: 测试主题',
    frontmatterExtra,
    '---',
    body,
  ].join('\n');
}

/** A `custom_values` block holding one decoration template. */
function customValues(template: string): string {
  return [
    'custom_values:',
    '  heading.decoration:',
    '    - id: custom_x',
    '      name: 自定义',
    `      template: '${template.replace(/'/g, "''")}'`,
    '',
  ].join('\n');
}

describe('inspectThemeNote', () => {
  it('accepts a theme that declares no custom values', () => {
    expect(inspectThemeNote(theme('heading.decoration: lightBg'))).toEqual([]);
  });

  it('accepts a custom decoration built from inline styles and placeholders', () => {
    const note = theme(
      customValues('<{tag} style="display:flex;background:{{blockColor}};border-radius:{{radius}}px">{text}</{tag}>'),
    );
    expect(inspectThemeNote(note)).toEqual([]);
  });

  it('accepts a background image url() in a template', () => {
    const note = theme(customValues('<section style="background:url({{imageUrl}}) center/contain no-repeat"></section>'));
    expect(inspectThemeNote(note)).toEqual([]);
  });

  it('does not look at the note body, where a payload may be a legitimate example', () => {
    const note = theme(
      'heading.decoration: lightBg',
      '# 一篇讲 XSS 的文章\n\n```html\n<script>alert(1)</script>\n<a onmouseover="x()">hi</a>\n```\n',
    );
    expect(inspectThemeNote(note)).toEqual([]);
  });

  it('does not look at frontmatter keys outside custom_values', () => {
    const note = theme('wewrite_theme_description: "<script>alert(1)</script>"');
    expect(inspectThemeNote(note)).toEqual([]);
  });

  it('returns nothing for a note without frontmatter, or with broken YAML', () => {
    expect(inspectThemeNote('# 只有正文\n')).toEqual([]);
    expect(inspectThemeNote('---\nwewrite_theme: true\n  bad indentation: [\n---\nbody\n')).toEqual([]);
  });

  it('returns nothing when custom_values is not an object', () => {
    expect(inspectThemeNote(theme('custom_values: 42'))).toEqual([]);
    expect(inspectThemeNote(theme('custom_values: []'))).toEqual([]);
  });

  it('reports one issue per rule that fired', () => {
    const note = theme(customValues('<script>alert(1)</script><a onclick="x()">hi</a>'));
    const issues = inspectThemeNote(note);
    expect(issues.map((i) => i.rule).sort()).toEqual(['event-handler', 'script-tag']);
    for (const issue of issues) expect(issue.sample.length).toBeGreaterThan(0);
  });

  // Every rule in the shared table has a sample that trips it. Adding a rule
  // without a sample fails here, which keeps `tools/theme-lint.mjs` honest:
  // the tool reads the same table, so an untested rule would ship to CI
  // unverified.
  describe('every rule fires on its sample', () => {
    const SAMPLES: Record<string, string> = {
      'script-tag': '<script src="x.js"></script>',
      'event-handler': '<a onmouseover=alert(1)>x</a>',
      'script-url': '<a href="javascript:alert(1)">x</a>',
      'html-data-url': '<a href="data:text/html;base64,PHNjcmlwdD4=">x</a>',
      'active-element': '<iframe src="https://evil.example"></iframe>',
      'css-expression': 'width:expression(alert(1))',
      'at-import': '@import url("https://evil.example/x.css");',
    };

    it('covers the rule table exactly', () => {
      expect(Object.keys(SAMPLES).sort()).toEqual(THEME_SAFETY_RULES.map((r) => r.id).sort());
    });

    for (const [id, sample] of Object.entries(SAMPLES)) {
      it(`${id} is caught`, () => {
        const rules = inspectThemeNote(theme(customValues(sample))).map((i) => i.rule);
        expect(rules).toContain(id);
      });
    }
  });
});
