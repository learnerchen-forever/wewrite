import { getModifierRegistry } from '../../../src/core/modifier-registry';

describe('getModifierRegistry', () => {
  test('contains all expected element paths', () => {
    const paths = Object.keys(getModifierRegistry());
    const expected = [
      'article', 'heading',
      'heading.h1', 'heading.h2', 'heading.h3', 'heading.h4', 'heading.h5', 'heading.h6',
      'blocks.code', 'blocks.table', 'blocks.list', 'blocks.hr',
      'media.mermaid',
      'inline.link', 'inline.strong', 'inline.code',
    ];
    for (const p of expected) expect(paths).toContain(p);
  });

  test('heading has 5 variables', () => {
    const vars = Object.keys(getModifierRegistry().heading);
    expect(vars).toHaveLength(5);
    ['size', 'color', 'decoration', 'numbering', 'align'].forEach(v => expect(vars).toContain(v));
  });

  test('heading.decoration has 10 builtin values', () => {
    const deco = getModifierRegistry().heading.decoration;
    const builtins = deco.values.filter(v => v.builtin);
    expect(builtins.length).toBe(10);
    ['none', 'underline', 'leftBorder', 'gradientBg', 'card'].forEach(id =>
      expect(builtins.map(v => v.id)).toContain(id));
  });

  test('blocks.code has 5 variables', () => {
    const vars = Object.keys(getModifierRegistry()['blocks.code']);
    expect(vars.length).toBeGreaterThanOrEqual(5);
    ['theme', 'macBar', 'lineNumbers', 'languageTag', 'borderRadius'].forEach(v =>
      expect(vars).toContain(v));
  });

  test('blocks.code.theme has 12 builtin values (6 dark + 6 light)', () => {
    const theme = getModifierRegistry()['blocks.code'].theme;
    expect(theme.values).toHaveLength(12);
    expect(theme.values.map(v => v.id)).toEqual([
      'oneDark', 'githubDark', 'nord', 'dracula', 'monokai', 'slateDark',
      'githubLight', 'oneLight', 'solarizedLight', 'warmPaper', 'vsLight', 'rosePineDawn',
    ]);
  });

  test('blocks.code has font, fontSize, padding, wrap, shadow variables', () => {
    const vars = Object.keys(getModifierRegistry()['blocks.code']);
    ['font', 'fontSize', 'padding', 'wrap', 'shadow'].forEach(v =>
      expect(vars).toContain(v));
  });

  test('blocks.list has bullet, bulletSpacing, indent, taskChecked, taskUnchecked', () => {
    const vars = Object.keys(getModifierRegistry()['blocks.list']);
    ['bullet', 'bulletSpacing', 'indent', 'taskChecked', 'taskUnchecked'].forEach(v =>
      expect(vars).toContain(v));
  });

  test('heading.h1 is separate from heading', () => {
    expect(getModifierRegistry()['heading.h1']).toBeDefined();
    expect(getModifierRegistry()['heading.h1']).not.toBe(getModifierRegistry().heading);
  });

  test('all values have non-empty id and name', () => {
    for (const [, mods] of Object.entries(getModifierRegistry())) {
      for (const [, variable] of Object.entries(mods)) {
        for (const value of variable.values) {
          expect(value.id).toBeTruthy();
          expect(value.name).toBeTruthy();
        }
      }
    }
  });
});
