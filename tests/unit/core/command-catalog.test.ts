// Every WeWrite command must carry an icon that actually exists.
//
// Obsidian's mobile editor toolbar renders `Command.icon` and falls back to a
// "?" placeholder for a command registered without one, which is what made the
// WeWrite commands unusable there. Rather than let that regress silently, the
// catalog (src/core/command-catalog.ts) is the single source of truth for the
// palette, the context menus and the mobile toolbar, and it is asserted here.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  AI_EDITOR_MENU_COMMANDS,
  WEWRITE_COMMANDS,
  getCommandEntry,
} from '../../../src/core/command-catalog';
import { WEWRITE_ICON_IDS } from '../../../src/core/icon-registry';
import { hasTranslation } from '../../../src/i18n';

/** Command ids the editor / file-explorer context menus in main.ts reference. */
const CONTEXT_MENU_IDS: readonly string[] = [
  'wewrite-edit-theme',
  'open-wechat-news-view',
  'open-wechat-newspic-view',
  ...AI_EDITOR_MENU_COMMANDS.map((entry) => entry.id),
];

const MAIN_TS = join(__dirname, '..', '..', '..', 'src', 'main.ts');

describe('WeWrite command catalog', () => {
  it('gives every command an icon that is actually registered', () => {
    for (const entry of WEWRITE_COMMANDS) {
      expect(entry.icon).toBeTruthy();
      expect(WEWRITE_ICON_IDS).toContain(entry.icon);
    }
  });

  it('keeps command ids unique', () => {
    const ids = WEWRITE_COMMANDS.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('points every label at a real translation', () => {
    for (const entry of WEWRITE_COMMANDS) {
      expect(hasTranslation(entry.nameKey)).toBe(true);
      if (entry.menuKey) expect(hasTranslation(entry.menuKey)).toBe(true);
    }
  });

  it('offers every context-menu action as a registered command', () => {
    for (const id of CONTEXT_MENU_IDS) {
      expect(() => getCommandEntry(id)).not.toThrow();
    }
  });

  it('rejects an id that is not catalogued', () => {
    expect(() => getCommandEntry('wewrite-not-a-command')).toThrow();
  });

  it('registers every catalogued command in main.ts', () => {
    const source = readFileSync(MAIN_TS, 'utf8');
    const aiIds = new Set<string>(AI_EDITOR_MENU_COMMANDS.map((entry) => entry.id));

    // Non-AI commands are registered one by one through the catalog helper.
    const unregistered = WEWRITE_COMMANDS
      .filter((entry) => !aiIds.has(entry.id))
      .filter((entry) => !source.includes(`commandMeta('${entry.id}')`))
      .map((entry) => entry.id);
    expect(unregistered).toEqual([]);

    // AI commands are registered by looping the catalog, so what has to exist
    // per id is its entry in the runner table.
    const withoutRunner = AI_EDITOR_MENU_COMMANDS
      .filter((entry) => !source.includes(`'${entry.id}':`))
      .map((entry) => entry.id);
    expect(withoutRunner).toEqual([]);
  });

  it('routes every addCommand() call through the catalog helper', () => {
    const source = readFileSync(MAIN_TS, 'utf8');
    const registrations = source.match(/this\.addCommand\(/g) ?? [];
    // `commandMeta()` is what supplies the icon — a command registered without
    // it is exactly the "?" mobile-toolbar button this suite exists to prevent.
    const viaCatalog = source.match(/\.\.\.this\.commandMeta\(/g) ?? [];
    expect(registrations.length).toBeGreaterThan(0);
    expect(viaCatalog.length).toBe(registrations.length);
  });
});
