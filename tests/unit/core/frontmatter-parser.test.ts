import { parseFlatFrontmatter, registerCustomValues } from '../../../src/core/frontmatter-parser';
import { getModifierRegistry } from '../../../src/core/modifier-registry';

describe('parseFlatFrontmatter', () => {
  test('parses heading.h2.decoration', () => {
    const { config } = parseFlatFrontmatter({ 'heading.h2.decoration': 'underline' });
    expect(config['heading.h2']?.decoration).toBe('underline');
  });

  test('parses multiple variables for same element', () => {
    const { config } = parseFlatFrontmatter({
      'blocks.code.theme': 'oneDark',
      'blocks.code.macBar': 'dark',
    });
    expect(config['blocks.code']).toEqual({ theme: 'oneDark', macBar: 'dark' });
  });

  test('skips palette.* and typography.* keys', () => {
    const { config } = parseFlatFrontmatter({ 'palette.accent': '#009688', 'typography.baseSize': 18 });
    expect(config['palette']).toBeUndefined();
    expect(config['typography']).toBeUndefined();
  });

  test('skips wewrite_theme meta keys', () => {
    const { config } = parseFlatFrontmatter({
      'wewrite_theme': true,
      'wewrite_theme_name': 'test',
      'heading.h2.decoration': 'underline',
    });
    expect(config['wewrite_theme']).toBeUndefined();
    expect(config['heading.h2']?.decoration).toBe('underline');
  });

  test('parses custom_values', () => {
    const { config, customValues } = parseFlatFrontmatter({
      'heading.h2.decoration': '@myStyle',
      custom_values: {
        'heading.decoration': [
          { id: 'myStyle', name: 'My Style', css: 'border-bottom:3px solid red' },
        ],
      },
    });
    expect(config['heading.h2']?.decoration).toBe('@myStyle');
    expect(customValues).toHaveLength(1);
    expect(customValues[0].value.id).toBe('myStyle');
    expect(customValues[0].value.css).toBe('border-bottom:3px solid red');
  });

  test('handles non-string values gracefully', () => {
    const { config } = parseFlatFrontmatter({
      'heading.h2.decoration': true,
      'blocks.code.lineNumbers': 1,
    });
    expect(config['heading.h2']).toBeUndefined();
    expect(config['blocks.code']).toBeUndefined();
  });

  test('skips keys without dots', () => {
    const { config } = parseFlatFrontmatter({ 'title': 'test' });
    expect(Object.keys(config)).toHaveLength(0);
  });

  test('handles empty frontmatter', () => {
    const { config, customValues } = parseFlatFrontmatter({});
    expect(Object.keys(config)).toHaveLength(0);
    expect(customValues).toHaveLength(0);
  });

  test('parses list variables', () => {
    const { config } = parseFlatFrontmatter({
      'blocks.list.bullet': 'disc',
      'blocks.list.bulletSpacing': 'wide',
      'blocks.list.indent': 'normal',
      'blocks.list.taskChecked': 'check',
    });
    expect(config['blocks.list']?.bullet).toBe('disc');
    expect(config['blocks.list']?.bulletSpacing).toBe('wide');
    expect(config['blocks.list']?.indent).toBe('normal');
    expect(config['blocks.list']?.taskChecked).toBe('check');
  });
});

describe('registerCustomValues', () => {
  test('registers custom value into registry', () => {
    const originalLength = getModifierRegistry()['heading.h2'].decoration.values.length;
    registerCustomValues([{
      elementPath: 'heading.h2',
      variableId: 'decoration',
      value: { id: 'testCustom', name: 'Test', css: 'color:red' },
    }]);
    const values = getModifierRegistry()['heading.h2'].decoration.values;
    expect(values.length).toBe(originalLength + 1);
    const added = values.find(v => v.id === 'testCustom');
    expect(added).toBeDefined();
    expect(added!.builtin).toBe(false);
    expect(added!.css).toBe('color:red');
  });

  test('does not add duplicate custom values', () => {
    const before = getModifierRegistry()['heading.h2'].decoration.values.length;
    registerCustomValues([{
      elementPath: 'heading.h2',
      variableId: 'decoration',
      value: { id: 'testCustom', name: 'Test', css: 'color:red' },
    }]);
    expect(getModifierRegistry()['heading.h2'].decoration.values.length).toBe(before);
  });

  test('ignores non-customizable variables', () => {
    const before = getModifierRegistry()['heading.h2'].size.values.length;
    registerCustomValues([{
      elementPath: 'heading.h2',
      variableId: 'size',
      value: { id: 'huge', name: 'Huge', css: '' },
    }]);
    expect(getModifierRegistry()['heading.h2'].size.values.length).toBe(before);
  });
});
