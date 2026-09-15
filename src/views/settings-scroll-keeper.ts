/**
 * Scrolling for the Settings pane's account lists.
 *
 * The pane renders account cards imperatively (`renderTab()`, Obsidian ≤ 1.12)
 * or declaratively (`getSettingDefinitions()`, Obsidian 1.13+). Both rebuild the
 * pane's DOM after an account is added or removed, and both then try to restore
 * the scroll position — as a raw pixel offset, or as a ratio of `scrollHeight`,
 * or via Obsidian's own `_scrollLock` which puts the old `scrollTop` back
 * synchronously. Every one of those restores a *number*, and a number is not a
 * position once the content changes height: the browser clamps it to the new
 * content and the view snaps away, or the ratio stretches and the view drifts.
 *
 * The honest model is the one a list has natively:
 *
 * - **remove** — nothing moves. Hold the offset and the cards below the removed
 *   one slide up into the gap;
 * - **add** — nothing moves either: the new card takes its place in the list.
 *   It is then scrolled into view (and focused) only if it landed off-screen.
 *
 * Which element scrolls is left to the browser, so this works on desktop and on
 * mobile, where the pane scrolls inside a different ancestor.
 */

/** Marks the first row of an account card so it can be found again after a rebuild. */
export const ACCOUNT_CARD_ATTR = 'data-wewrite-account-id';

/**
 * The strip of the pane the user can actually see. On mobile the soft keyboard
 * shrinks the visual viewport without changing `clientHeight`, so prefer it when
 * the host exposes one.
 */
function visibleRange(container: HTMLElement): { top: number; bottom: number } {
  const top = container.getBoundingClientRect().top;
  const visual = container.ownerDocument.defaultView?.visualViewport;
  const height = visual && visual.height > 0
    ? Math.min(visual.height, container.clientHeight)
    : container.clientHeight;
  return { top, bottom: top + height };
}

function cardEl(container: ParentNode, id: string): HTMLElement | null {
  if (!id) return null;
  // Compare the attribute value explicitly: it avoids having to escape the id
  // for use inside a CSS selector. The lookup is typed as HTMLElement because
  // only the settings pane writes this attribute, and only on elements — an
  // `instanceof HTMLElement` guard would add nothing here, and would misfire in
  // a popout window, whose elements have a different `HTMLElement`.
  const found = Array.from(container.querySelectorAll<HTMLElement>(`[${ACCOUNT_CARD_ATTR}]`)).find(
    (el) => el.getAttribute(ACCOUNT_CARD_ATTR) === id,
  );
  return found ?? null;
}

function isHidden(el: HTMLElement): boolean {
  const style = el.ownerDocument.defaultView?.getComputedStyle(el);
  if (!style) return false;
  return style.display === 'none' || style.visibility === 'hidden';
}

function firstFocusableField(root: HTMLElement): HTMLElement | null {
  // The selector is tag-limited, so the explicit type argument is the whole
  // guard: only an input/textarea/select can come back. A runtime
  // `instanceof HTMLElement` would add nothing here and would actually be wrong
  // in a popout window, whose elements have a different `HTMLElement`.
  const candidates = root.querySelectorAll<HTMLElement>('input, textarea, select');
  for (let i = 0; i < candidates.length; i++) {
    const el = candidates[i];
    if (el.hasAttribute('disabled') || isHidden(el)) continue;
    return el;
  }
  return null;
}

export class ScrollKeeper {
  /** Offset to put back once the rebuilt DOM has settled. */
  private heldScrollTop: number | null = null;

  constructor(
    private readonly container: () => HTMLElement | null,
    private readonly doc: () => Document,
  ) {}

  /**
   * Remember where the pane is before its DOM is replaced. Used for every
   * rebuild — account edits, section toggles, provider changes — because in all
   * of them the view should simply stay where it is.
   */
  capture(): void {
    const container = this.container();
    this.heldScrollTop = container ? container.scrollTop : null;
  }

  /**
   * Undo the pane's own scroll restore, synchronously, right after the rebuild.
   * This is the step that matters: Obsidian's `_scrollLock` re-applies the stale
   * offset before the browser has laid the new content out, and the layout pass
   * then clamps it — which is the jump to the top that people see.
   */
  restoreSync(): void {
    const held = this.heldScrollTop;
    if (held === null) return;
    const container = this.container();
    if (container && container.isConnected) container.scrollTop = held;
    this.heldScrollTop = null;
  }

  /**
   * Reveal an account card once layout has settled, and focus its first
   * parameter field. A card that is already visible does not move at all.
   */
  revealCard(id: string, focus = true): void {
    const container = this.container();
    const card = container ? cardEl(container, id) : null;
    if (!container || !card) return;

    const view = visibleRange(container);
    const box = card.getBoundingClientRect();
    if (box.bottom > view.bottom || box.top < view.top) {
      // Scroll the card fully into view, but never further than its own top
      // edge: a card taller than the pane lands on its first row, not its last.
      container.scrollTop += Math.min(box.bottom - view.bottom, box.top - view.top);
    }

    if (focus) this.focusFirstField(card);
  }

  private focusFirstField(card: HTMLElement): void {
    const field = firstFocusableField(card);
    // Focusing while the settings window is in the background would steal focus
    // from wherever the user has moved on to.
    if (!field || !this.doc().hasFocus()) return;
    field.focus({ preventScroll: true });
  }
}
