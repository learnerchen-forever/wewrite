// Regression tests for the Settings pane's add/remove-account scrolling.
//
// The bug: after adding or deleting an account the pane jumped away from the
// card the user was editing. The scroll position was being restored as a raw
// pixel offset (or a ratio of scrollHeight, or Obsidian's own `_scrollLock`
// replay of the old scrollTop) captured before the DOM was rebuilt. Every one of
// those is a *number*, and a number stops meaning anything the moment the
// content changes height: the browser clamps it to the new content and the view
// snaps to the top.
//
// The behaviour pinned down here is the one a list has natively:
//   remove — hold the offset, so the cards below the removed one slide up into
//            the gap;
//   add    — hold the offset too, then reveal the new card (and focus its first
//            parameter field) only if it landed outside the viewport.
//
// These tests drive ScrollKeeper against a jsdom block-layout harness
// (tests/helpers/settings-dom-harness.ts) that mirrors the real pane: one 500px
// scroll container whose first child is a sticky heading, 300px account cards
// below it, and a scrollTop that clamps exactly like a browser's.

import { ACCOUNT_CARD_ATTR, ScrollKeeper } from '../../../src/views/settings-scroll-keeper';
import { block, bootJsdom, type Harness } from '../../helpers/settings-dom-harness';

interface Setup {
  harness: Harness;
  keeper: ScrollKeeper;
  cards: HTMLElement[];
}

function makeCards(harness: Harness, count: number): HTMLElement[] {
  const cards: HTMLElement[] = [];
  // Pane content follows the sticky heading, like real `createDiv` calls, so
  // every card is appended after the one before it.
  for (let i = 1; i <= count; i++) {
    cards.push(block(harness, 300, { [ACCOUNT_CARD_ATTR]: `card-${i}` }));
  }
  return cards;
}

function setup(count = 5): Setup {
  const harness = bootJsdom();
  const keeper = new ScrollKeeper(
    () => harness.container,
    () => harness.dom.window.document,
  );
  return { harness, keeper, cards: makeCards(harness, count) };
}

/** Scroll so `offsetWithinCard` px into `card` sits at the pane's viewport top. */
function scrollToCard(harness: Harness, card: HTMLElement, offsetWithinCard = 0): void {
  // rendered(top) = paneTop + offsetInPane - scrollTop, so a change of d in
  // scrollTop moves every rendered card by exactly -d.
  harness.container.scrollTop += card.getBoundingClientRect().top + offsetWithinCard;
}

function removeCard(harness: Harness, card: HTMLElement): void {
  card.remove();
  harness.heights.delete(card);
}

function topOf(card: HTMLElement): number {
  return card.getBoundingClientRect().top;
}

describe('ScrollKeeper — deleting an account', () => {
  it('holds the offset so the cards below slide up into the gap', () => {
    const { harness, keeper, cards } = setup();
    scrollToCard(harness, cards[1], 0);
    expect(harness.container.scrollTop).toBe(352);

    keeper.capture();
    removeCard(harness, cards[1]);
    keeper.restoreSync();

    expect(harness.container.scrollTop).toBe(352);
    expect(topOf(cards[0])).toBe(-300);
    expect(topOf(cards[2])).toBe(0);
  });

  it('closes the gap downwards, not from the top of the pane', () => {
    const { harness, keeper, cards } = setup();
    scrollToCard(harness, cards[1], 0);
    const cardTopBefore = topOf(cards[2]);

    keeper.capture();
    removeCard(harness, cards[0]);
    keeper.restoreSync();

    // The removed card was above the viewport, so what is on screen slides up
    // by its height — the list collapses downwards from the removed card.
    expect(topOf(cards[2])).toBe(cardTopBefore - 300);
    expect(harness.container.scrollTop).toBe(352);
  });

  it('does not move the pane when the deleted card is below the viewport', () => {
    const { harness, keeper, cards } = setup();
    scrollToCard(harness, cards[0], 0);
    const cardTopBefore = topOf(cards[0]);

    keeper.capture();
    removeCard(harness, cards[4]);
    keeper.restoreSync();

    expect(topOf(cards[0])).toBe(cardTopBefore);
    expect(harness.container.scrollTop).toBe(52);
  });

  it('keeps the reading position when the pane has room below the cards', () => {
    const { harness, keeper, cards } = setup(8);
    // Not at the bottom: the offset survives the shorter content untouched.
    harness.container.scrollTop = 900;
    const cardTopBefore = topOf(cards[7]);

    keeper.capture();
    removeCard(harness, cards[0]);
    keeper.restoreSync();

    // Removing a card above the viewport shifts the list up by its height, but
    // the offset — and so everything else on screen — stays put.
    expect(topOf(cards[7])).toBe(cardTopBefore - 300);
    expect(harness.container.scrollTop).toBe(900);
  });

  it('undoes the pane restoring a stale offset of its own', () => {
    const { harness, keeper, cards } = setup(8);
    // The user is at the bottom of the list, reading the last card.
    harness.container.scrollTop = 2000;
    const cardTopBefore = topOf(cards[7]);
    // 52px of heading and padding, eight 300px cards above this one; the pane
    // clamps 2000 down to the 1940 the content can actually scroll.
    expect(cardTopBefore).toBe(52 + 7 * 300 - 1940);

    keeper.capture();
    removeCard(harness, cards[0]);

    // Removing a card shrinks the content, so the browser clamps the offset it
    // had — the reading position is already gone before anything else runs.
    expect(harness.container.scrollTop).toBe(1640);

    // Obsidian's _scrollLock then puts the stale offset back verbatim, which
    // clamps again: this is the jump users see.
    harness.container.scrollTop = 1852;

    keeper.restoreSync();

    expect(topOf(cards[7])).toBe(cardTopBefore);
  });
});

describe('ScrollKeeper — adding an account', () => {
  it('holds the offset so the list grows in place', () => {
    const { harness, keeper, cards } = setup();
    scrollToCard(harness, cards[1], 120);
    const cardTopBefore = topOf(cards[1]);

    keeper.capture();
    // The rebuild: the new card lands after card 3, not at the end.
    block(harness, 300, { [ACCOUNT_CARD_ATTR]: 'card-new' }, cards[3]);
    keeper.restoreSync();

    expect(topOf(cards[1])).toBe(cardTopBefore);
    expect(harness.container.scrollTop).toBe(472);
  });

  it('holds the offset when the new card goes in at the top', () => {
    const { harness, keeper, cards } = setup();
    scrollToCard(harness, cards[2], 0);
    const cardTopBefore = topOf(cards[2]);

    keeper.capture();
    // Inserted before the first card: everything below it moves down.
    block(harness, 300, { [ACCOUNT_CARD_ATTR]: 'card-new' }, cards[0]);
    keeper.restoreSync();

    // The offset is held, so the list the user was reading slides down by the
    // height of the inserted card instead of the pane jumping to the top.
    expect(topOf(cards[2])).toBe(cardTopBefore + 300);
    expect(harness.container.scrollTop).toBe(652);
  });

  it('reveals a newly added card that landed below the fold', () => {
    const { harness, keeper, cards } = setup();
    scrollToCard(harness, cards[0], 0);

    keeper.capture();
    // Inserted after the last card, i.e. past the bottom of the viewport.
    const added = block(harness, 300, { [ACCOUNT_CARD_ATTR]: 'card-new' });
    keeper.restoreSync();
    expect(added.getBoundingClientRect().top).toBeGreaterThan(harness.viewport.bottom());

    keeper.revealCard('card-new');

    expect(added.getBoundingClientRect().top).toBeLessThan(harness.viewport.bottom());
    expect(added.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      harness.viewport.bottom() + harness.paneTop,
    );
  });

  it('scrolls a partially visible new card the rest of the way in', () => {
    const { harness, keeper, cards } = setup();
    // Card 3 sits at the top of the pane, so card 4 straddles the bottom edge
    // with 200px showing.
    harness.container.scrollTop += topOf(cards[2]);
    const scrollBefore = harness.container.scrollTop;

    keeper.capture();
    keeper.revealCard('card-4');

    // Minimal movement: exactly the 100px it was hanging over by.
    expect(harness.container.scrollTop).toBe(scrollBefore + 100);
    expect(topOf(cards[3])).toBe(200);
  });

  it('does not scroll when the new card lands inside the viewport', () => {
    const { harness, keeper, cards } = setup();
    scrollToCard(harness, cards[0], 0);

    keeper.capture();
    const added = block(harness, 150, { [ACCOUNT_CARD_ATTR]: 'card-new' }, cards[1]);
    keeper.restoreSync();
    const scrollBefore = harness.container.scrollTop;
    expect(added.getBoundingClientRect().top).toBeGreaterThanOrEqual(harness.viewport.top());
    expect(added.getBoundingClientRect().bottom).toBeLessThanOrEqual(harness.viewport.bottom());

    keeper.revealCard('card-new');

    expect(harness.container.scrollTop).toBe(scrollBefore);
  });

  it('anchors a card taller than the pane on its first row', () => {
    const { harness, keeper, cards } = setup(3);
    scrollToCard(harness, cards[0], 0);
    keeper.capture();

    // A tall card (every field of an image-gen account) at the end.
    const added = block(harness, 700, { [ACCOUNT_CARD_ATTR]: 'card-new' });
    keeper.restoreSync();
    keeper.revealCard('card-new');

    expect(added.getBoundingClientRect().top).toBe(harness.viewport.top());
  });

  it('focuses the first parameter field of the new card', () => {
    const { harness, keeper } = setup();
    const added = block(harness, 300, { [ACCOUNT_CARD_ATTR]: 'card-new' });
    const label = harness.dom.window.document.createElement('div');
    added.appendChild(label);
    const input = harness.dom.window.document.createElement('input');
    added.appendChild(input);

    keeper.revealCard('card-new');

    expect(harness.focused).toContain(input);
  });

  it('leaves focus alone when the settings window is in the background', () => {
    const { harness, keeper } = setup();
    const added = block(harness, 300, { [ACCOUNT_CARD_ATTR]: 'card-new' });
    const input = harness.dom.window.document.createElement('input');
    added.appendChild(input);
    Object.defineProperty(harness.dom.window.document, 'hasFocus', {
      configurable: true,
      value: () => false,
    });

    keeper.revealCard('card-new');

    expect(harness.focused).not.toContain(input);
  });
});

describe('ScrollKeeper — no-op paths', () => {
  it('is a no-op when nothing was captured', () => {
    const { harness, keeper } = setup();
    harness.container.scrollTop = 137;

    keeper.restoreSync();

    expect(harness.container.scrollTop).toBe(137);
  });

  it('ignores a reveal for a card that is not in the pane', () => {
    const { harness, keeper } = setup();
    harness.container.scrollTop = 137;

    keeper.revealCard('card-missing');

    expect(harness.container.scrollTop).toBe(137);
    expect(harness.focused).toHaveLength(0);
  });
});
