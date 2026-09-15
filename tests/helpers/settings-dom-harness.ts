// Shared DOM + layout harness for settings-pane tests.
//
// jsdom has no layout engine: every getBoundingClientRect() is 0×0 and no
// element scrolls, so tests that care about *where* something sits on screen
// have to declare the geometry themselves. This module boots a jsdom document
// with Obsidian's HTMLElement augmentations and installs a tiny block-layout
// stub — children are stacked in document order, each with an explicit height,
// and the pane clamps scrollTop to its content.
//
// The numbers mirror the real settings pane: one scrollable
// `.vertical-tab-content` (Obsidian gives it `overflow-y: auto`) whose first
// child is the sticky section heading, with account cards below it.

import { JSDOM } from 'jsdom';

export interface Harness {
  dom: JSDOM;
  /** The scrollable pane (Obsidian's `.vertical-tab-content`). */
  container: HTMLElement;
  /** Sticky heading, the pane's first child. */
  header: HTMLElement;
  /** Height of an element in the stub layout. */
  heights: Map<Element, number>;
  /** Every element that received focus() since the harness booted. */
  focused: HTMLElement[];
  /** Visible strip of the pane. */
  viewport: { top(): number; bottom(): number };
  /** Pane top padding, i.e. where content sits at scrollTop 0. */
  paneTop: number;
}

export function bootJsdom(): Harness {
  const dom = new JSDOM(
    '<!doctype html><html><body>' +
      '<div class="settings-pane"><div class="settings-header"></div></div>' +
      '</body></html>',
  );
  const win = dom.window;
  const doc = win.document;

  globalThis.document = doc as unknown as Document;
  globalThis.HTMLElement = win.HTMLElement as unknown as typeof HTMLElement;

  // Obsidian augments the DOM; jsdom does not.
  const proto = win.HTMLElement.prototype as unknown as Record<string, unknown>;
  const fragmentProto = win.DocumentFragment.prototype as unknown as Record<string, unknown>;
  proto.addClass = function (this: HTMLElement, ...classes: string[]): void {
    this.classList.add(...classes);
  };
  proto.removeClass = function (this: HTMLElement, ...classes: string[]): void {
    this.classList.remove(...classes);
  };
  proto.hasClass = function (this: HTMLElement, cls: string): boolean {
    return this.classList.contains(cls);
  };
  proto.isShown = function (this: HTMLElement): boolean {
    return this.style.display !== 'none';
  };
  proto.setText = function (this: HTMLElement, text: string): void {
    this.textContent = text;
  };
  proto.empty = function (this: HTMLElement): void {
    while (this.firstChild) this.removeChild(this.firstChild);
  };
  fragmentProto.appendText = function (this: DocumentFragment, text: string): void {
    this.appendChild(this.ownerDocument.createTextNode(text));
  };

  const container = doc.querySelector('.settings-pane') as HTMLElement;
  const header = doc.querySelector('.settings-header') as HTMLElement;

  const headerHeight = 40;
  const panePadding = 12;
  const viewportHeight = 500;
  const heights = new Map<Element, number>();
  heights.set(header, headerHeight);

  Object.defineProperty(container, 'clientHeight', {
    configurable: true,
    get: () => viewportHeight,
  });

  /** Offset of an element's top from the top of the pane's own box. */
  const contentTop = (el: Element): number => {
    let top = 0;
    for (const child of Array.from(container.children)) {
      if (child === el) break;
      top += heights.get(child) ?? 0;
    }
    return top;
  };

  const scrollHeight = (): number =>
    Array.from(container.children).reduce((sum, child) => sum + (heights.get(child) ?? 0), 0);

  let scrollTop = 0;
  const maxScrollTop = (): number => Math.max(0, scrollHeight() - viewportHeight);
  Object.defineProperty(container, 'scrollHeight', { configurable: true, get: scrollHeight });
  Object.defineProperty(container, 'scrollTop', {
    configurable: true,
    // Clamped on read as well as on write: a browser re-clamps the scroll offset
    // as soon as content shrinks, which is exactly the behaviour under test.
    get: () => Math.min(scrollTop, maxScrollTop()),
    set: (value: number) => {
      scrollTop = Math.max(0, Math.min(value, maxScrollTop()));
    },
  });

  proto.getBoundingClientRect = function (this: HTMLElement): DOMRect {
    const isContainer = this === container;
    const isHeader = this === header;
    const height = isContainer ? viewportHeight : heights.get(this) ?? 0;
    let top = 0;
    if (isContainer) {
      top = 0;
    } else if (isHeader) {
      // Sticky: stays pinned while the rest of the pane scrolls under it.
      top = panePadding;
    } else {
      top = panePadding + contentTop(this) - scrollTop;
    }
    const rect = {
      x: 0, y: top, top, left: 0, right: 400, bottom: top + height, width: 400, height,
      toJSON: () => ({}),
    };
    return rect as DOMRect;
  };

  const focused: HTMLElement[] = [];
  proto.focus = function (this: HTMLElement): void {
    focused.push(this);
    Object.defineProperty(doc, 'activeElement', { configurable: true, get: () => this });
  };
  Object.defineProperty(doc, 'hasFocus', { configurable: true, value: () => true });

  return {
    dom,
    container,
    header,
    heights,
    focused,
    viewport: {
      top: () => 0,
      bottom: () => viewportHeight,
    },
    paneTop: panePadding,
  };
}

/** A block of `height` px in the pane, optionally inserted before `before`. */
export function block(
  harness: Harness,
  height: number,
  attrs: Record<string, string> = {},
  before?: Element,
): HTMLElement {
  const el = harness.dom.window.document.createElement('div');
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
  harness.container.insertBefore(el, before ?? null);
  harness.heights.set(el, height);
  return el;
}
