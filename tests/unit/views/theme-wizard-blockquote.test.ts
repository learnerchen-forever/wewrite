// The theme wizard must emit the 3.0 blockquote decoration schema
// (`blocks.blockquote.decoration` + `decorationParams`), not the legacy
// `blocks.blockquote.background/border/icon` slots that no longer render.

import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;

// Obsidian augments HTMLElement with class helpers; the node test environment
// has no such augmentation and `WeWriteModal` uses `addClass` on its title bar.
type ElementWithAddClass = { addClass(...classes: string[]): HTMLElement };
(dom.window.HTMLElement.prototype as unknown as ElementWithAddClass).addClass = function (
  this: HTMLElement,
  ...classes: string[]
): HTMLElement {
  this.classList.add(...classes);
  return this;
};

import { App } from 'obsidian';
import { ThemeWizardModal } from '../../../src/views/theme-wizard-modal';
import { parseBlockquoteFrontmatter, resolveBlockquoteDecoration } from '../../../src/core/blockquote-config';
import { parseFrontmatter } from '../../../src/utils/frontmatter';

/** The wizard keeps its draft in a private field; tests drive it directly. */
type WizardInternals = {
  state: { elementPicks: Record<string, string> };
  buildFrontmatter(): string;
};

function frontmatterForBlockquotePick(pickId: string): string {
  const wizard = new ThemeWizardModal(new App()) as unknown as WizardInternals;
  wizard.state.elementPicks = { 'blockquote': pickId };
  return wizard.buildFrontmatter();
}

const QUOTE_PICKS = ['light', 'warmCard', 'cleanLine'];

describe('theme wizard blockquote picks', () => {
  it.each(QUOTE_PICKS)('%s writes the decoration schema, not legacy slots', (pickId) => {
    const frontmatter = frontmatterForBlockquotePick(pickId);

    expect(frontmatter).toContain('blockquote.decoration: "classicBar"');
    expect(frontmatter).toContain('blockquote.decorationParams: {');
    expect(frontmatter).not.toMatch(/blocks\.blockquote\.(background|border|icon)/);
  });

  it('round-trips through the blockquote config parser and resolves params', () => {
    const frontmatter = frontmatterForBlockquotePick('light');
    const fm = parseFrontmatter(frontmatter) as Record<string, unknown>;
    const { config } = parseBlockquoteFrontmatter(fm);

    expect(config.decoration).toBe('classicBar');
    const { decoration, params } = resolveBlockquoteDecoration(config.decoration, config.decorationParams, []);
    expect(decoration.id).toBe('classicBar');
    expect(params['bgColor']).toBe('${accentBg}');
    expect(params['barColor']).toBe('${accent}');
  });
});
