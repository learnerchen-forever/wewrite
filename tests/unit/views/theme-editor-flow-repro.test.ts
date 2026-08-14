// Full editor data flow against the real theme file:
// load frontmatter → change a heading background slot → build file content
// (matter.stringify with raw frontmatter + modifierConfig) → re-parse.

import matter from 'gray-matter';
import * as fs from 'fs';
import * as path from 'path';
import { parseFlatFrontmatter, registerCustomValues } from '../../../src/core/frontmatter-parser';
import { isKnownSlotKey } from '../../../src/views/wewrite-theme-view';

const THEME_PATH = path.join(__dirname, '..', '..', '..', 'themes', '001-晨曦蓝调.md');

function loadConfig(content: string) {
  const fm = matter(content).data as Record<string, unknown>;
  const { config, customValues } = parseFlatFrontmatter(fm);
  registerCustomValues(customValues);
  return { fm, config, customValues };
}

describe('Theme editor full flow (real theme file)', () => {
  it('a heading background dropdown change survives save + reload', () => {
    const content = fs.readFileSync(THEME_PATH, 'utf8');
    const { fm, config, customValues } = loadConfig(content);

    // Simulate the dropdown change: user picks a valid built-in value
    if (!config['heading.h1']) config['heading.h1'] = {};
    config['heading.h1'].background = 'lightBg';

    // Simulate buildFileContent: raw frontmatter + current slot config
    const outFm: Record<string, unknown> = { ...fm };
    for (const [elemPath, slots] of Object.entries(config)) {
      for (const [slotId, valueId] of Object.entries(slots)) {
        outFm[`${elemPath}.${slotId}`] = valueId;
      }
    }
    if (customValues.length > 0) {
      outFm['custom_values'] = { 'heading.h1.background': customValues.map((c) => c.value) };
    }
    const saved = matter.stringify(matter(content).content, outFm);

    // Reload
    const reloaded = loadConfig(saved);
    expect(reloaded.config['heading.h1']?.background).toBe('lightBg');
  });

  it('drops stale raw slot keys that are no longer configured', () => {
    const raw: Record<string, unknown> = {
      wewrite_theme: true,
      'heading.h1.background': 'gradientBg', // previously saved, now reset to default
      'heading.font': 'serif',
      custom_values: { 'heading.h1.background': [] },
    };
    const modifierConfig: Record<string, Record<string, string>> = {
      heading: { font: 'serif' },
    };

    // Replicate buildFileContent's stale-key filtering
    const activeSlotKeys = new Set<string>();
    for (const [elemPath, slots] of Object.entries(modifierConfig)) {
      for (const slotId of Object.keys(slots)) activeSlotKeys.add(`${elemPath}.${slotId}`);
    }
    const fm: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (isKnownSlotKey(key) && !activeSlotKeys.has(key)) continue;
      fm[key] = value;
    }

    const parsed = matter(matter.stringify('body', fm)).data as Record<string, unknown>;
    expect(parsed['heading.h1.background']).toBeUndefined();
    expect(parsed['heading.font']).toBe('serif');
    expect(parsed['custom_values']).toBeDefined();
  });

  it('normalizes legacy record-key values on load', () => {
    const fm = matter(matter.stringify('# t', {
      wewrite_theme: true,
      'heading.background': 'gradient',
      'heading.border': 'bottomLine',
      'heading.h1.background': 'accentFill',
      'heading.h1.border': 'leftBar',
      'blocks.table.headerStyle': 'plain',
    })).data as Record<string, unknown>;

    const { config } = parseFlatFrontmatter(fm);
    expect(config['heading']?.background).toBe('gradientBg');
    expect(config['heading']?.border).toBe('underline');
    expect(config['heading.h1']?.background).toBe('filled');
    expect(config['heading.h1']?.border).toBe('leftBorder');
    expect(config['blocks.table']?.headerStyle).toBe('none');
  });
});
