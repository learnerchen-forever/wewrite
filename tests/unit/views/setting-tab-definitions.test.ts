// The settings pane is built twice over: Obsidian 1.13+ renders
// getSettingDefinitions() and never calls display(), while older versions still
// call display() → renderTab(). A setting carried by only one of the two paths
// is invisible to half the users — that is how the "What's New" toggle went
// missing on 1.13 — so the declarative path is asserted here.

import { JSDOM } from 'jsdom';

// jsdom is installed as a dependency, but jest-environment-jsdom is not: give
// the tab the DOM globals its Obsidian base class touches when it is built.
const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;

// Obsidian augments HTMLElement with addClass/removeClass; jsdom does not.
const proto = dom.window.HTMLElement.prototype as unknown as Record<string, unknown>;
proto.addClass = function (this: HTMLElement, ...classes: string[]): void {
  this.classList.add(...classes);
};
proto.removeClass = function (this: HTMLElement, ...classes: string[]): void {
  this.classList.remove(...classes);
};
const fragmentProto = dom.window.DocumentFragment.prototype as unknown as Record<string, unknown>;
fragmentProto.appendText = function (this: DocumentFragment, text: string): void {
  this.appendChild(this.ownerDocument.createTextNode(text));
};

import { WeWriteSettingTab } from '../../../src/views/setting-tab';
import { DEFAULT_SETTINGS } from '../../../src/core/interfaces';
import { t } from '../../../src/i18n';
import type WeWritePlugin from '../../../src/main';

interface SettingDef {
  name: string;
  desc?: string;
  render?: unknown;
}

interface SettingGroup {
  type: string;
  heading?: string;
  items?: SettingDef[];
}

function makeTab(): WeWriteSettingTab {
  const settings = { ...DEFAULT_SETTINGS };
  const plugin = {
    app: {},
    settingsManager: {
      getSettings: () => settings,
      updateSettings: (patch: Record<string, unknown>) => Object.assign(settings, patch),
    },
  } as unknown as WeWritePlugin;
  return new WeWriteSettingTab(plugin);
}

/** The group getters are private; the tab under test is the object itself. */
function generalDefinitions(tab: WeWriteSettingTab): SettingDef[] {
  return (tab as unknown as { getGeneralDefinitions(): SettingDef[] }).getGeneralDefinitions();
}

describe('declarative settings (Obsidian 1.13+)', () => {
  it('carries the What\'s New toggle in the general group', () => {
    const names = generalDefinitions(makeTab()).map((d) => d.name);
    expect(names).toContain(t('settings.whats_new'));
  });

  it('gives that toggle a render function, not just a label', () => {
    const def = generalDefinitions(makeTab()).find((d) => d.name === t('settings.whats_new'));
    expect(def).toBeDefined();
    expect(typeof def?.render).toBe('function');
  });

  it('exposes the general group through getSettingDefinitions()', () => {
    const defs = makeTab().getSettingDefinitions() as unknown as SettingGroup[];
    const group = defs.find((d) => d.heading === t('settings.general'));
    expect(group?.items?.map((i) => i.name)).toContain(t('settings.whats_new'));
  });
});
