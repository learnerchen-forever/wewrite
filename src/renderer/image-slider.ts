// image-slider.ts — the "图片轮播" (image carousel)
//
// In a note, a run of images that are only separated by single line breaks (no
// blank line) renders as *one paragraph* holding several <img>. Stacked inside
// a paragraph they read cramped, so when the theme turns the image window on,
// such a run is moved into its own <section>: the images become slides of a
// carousel, each one article width wide, and the reader swipes from one picture
// to the next (the scrolling/snapping itself is pure CSS — see
// buildImageSliderStyle).
//
// A blank line between two images makes them separate paragraphs, which is what
// separates one window from the next (and keeps a lone image a lone image).
//
// The grouping runs on the rendered DOM: every image is only reachable through
// its parent, and a run is the set of adjacent image slots of one parent.
// "Adjacent" tolerates what the markdown renderer leaves between two images:
// whitespace and <br>. A captioned image is never part of a window — the
// renderer emits its <figcaption> next to the <img>, which a carousel would
// strand.

/** Elements that may host the new <section> directly (hoisting stops there). */
const HOIST_HOSTS = new Set([
	'BODY', 'ARTICLE', 'DIV', 'SECTION', 'LI', 'UL', 'OL',
	'TD', 'TH', 'BLOCKQUOTE', 'FIGURE',
]);

/** Paragraph-like containers that exist only to hold the run → replaceable. */
const REPLACEABLE = new Set(['P', 'DIV']);

/**
 * Inline wrappers an image may sit in without ceasing to be its own slide:
 * Obsidian puts a linked image inside an `<a>`, some plugins add a `<span>`.
 * A block container must never count — two one-image paragraphs separated by a
 * blank line are not one run, and moving them would take the paragraphs with.
 */
const INLINE_WRAPPERS = new Set([
	'A', 'SPAN', 'EM', 'STRONG', 'B', 'I', 'U', 'S', 'DEL', 'INS', 'SUP', 'SUB', 'MARK', 'SMALL',
]);

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

/** One image of a run, with the node that has to move into the window. */
export interface ImageSliderSlide {
	/** The <img> itself, or its inline wrapper (e.g. an <a> around a link). */
	node: ChildNode;
	img: HTMLImageElement;
}

/** The line printed under a carousel (see buildImageSliderHint). */
export interface ImageSliderHint {
	style: string;
	text: string;
}

/** True when a node between two images does not break the run. */
function isTransparent(node: ChildNode): boolean {
	if (node.nodeType === TEXT_NODE) return !(node.textContent || '').trim();
	if (node.nodeType !== ELEMENT_NODE) return true;
	const el = node as Element;
	if (el.tagName === 'BR') return true;
	return !(el.textContent || '').trim() && el.querySelector('img') === null;
}
/**
 * The image slot a child node represents, or null when the node is not one.
 * A wrapper holding a single image and no other content (the <a> Obsidian puts
 * around a linked image) is one slot, so the link survives the move.
 */
function slotFor(node: ChildNode): ImageSliderSlide | null {
	if (node.nodeType !== ELEMENT_NODE) return null;
	const el = node as Element;
	if (el.tagName === 'IMG') return { node, img: el as HTMLImageElement };
	if (el.tagName === 'BR') return null;
	if (!INLINE_WRAPPERS.has(el.tagName)) return null;
	const imgs = el.querySelectorAll('img');
	if (imgs.length !== 1) return null;
	if ((el.textContent || '').trim()) return null;
	return { node, img: imgs[0] };
}

/** Adjacent image slots of one parent, in document order. */
function runsIn(parent: Element, isEligible: (img: HTMLImageElement) => boolean): ImageSliderSlide[][] {
	const runs: ImageSliderSlide[][] = [];
	let current: ImageSliderSlide[] = [];

	for (const child of Array.from(parent.childNodes)) {
		const slot = slotFor(child);
		// An image ends the run only when it cannot be a slide (a caption, a
		// figure); anything else that is not whitespace also ends it.
		if (slot ? !isEligible(slot.img) : !isTransparent(child)) {
			if (current.length > 0) runs.push(current);
			current = [];
			continue;
		}
		if (slot) current.push(slot);
	}
	if (current.length > 0) runs.push(current);

	return runs.filter((run) => run.length > 1);
}

/**
 * Every run of two or more adjacent, eligible images under `root` — one entry
 * per run, in document order. Runs of a single image are not returned: a lone
 * image stays a plain image.
 */
export function collectImageSliderRuns(
	root: Element,
	isEligible: (img: HTMLImageElement) => boolean = () => true,
): ImageSliderSlide[][] {
	const elements: Element[] = [root, ...Array.from(root.querySelectorAll('*'))];
	const groups: ImageSliderSlide[][] = [];
	for (const el of elements) {
		for (const run of runsIn(el, isEligible)) groups.push(run);
	}
	return groups;
}

/** Remove wrappers the move left behind, so they cannot render as blank lines. */
function pruneEmptyWrappers(start: Element | null): void {
	let el: Element | null = start;
	while (el && el.parentElement) {
		if (el.tagName === 'BODY' || el.tagName === 'HTML') return;
		if ((el.textContent || '').trim() || el.querySelector('img') !== null) return;
		const parent: Element = el.parentElement;
		el.remove();
		el = parent;
	}
}

/**
 * Move one run into a new <section> carrying `containerStyle`, and put the
 * hint line right after it. The section replaces the paragraph when that
 * paragraph held nothing but the run; otherwise it is hoisted out to the
 * nearest block host, because a <section> nested inside a <p> is not valid HTML
 * and WeChat's editor would rewrite it.
 *
 * The hint is a sibling, never a child: inside the carousel it would be one
 * more slide to scroll past, and on the last page it would sit in the middle of
 * the frame.
 *
 * Every slide's own style must already be on the slide node.
 */
export function wrapImageSlider(
	run: ImageSliderSlide[],
	containerStyle: string,
	hint?: ImageSliderHint,
): void {
	if (run.length < 2) return;
	const firstParent = run[0].node.parentElement;
	if (!firstParent) return;

	const section = createEl('section');
	section.setAttribute('style', containerStyle);

	const runNodes = new Set<ChildNode>(run.map((slide) => slide.node));
	const others = Array.from(firstParent.childNodes).filter(
		(child) => !isTransparent(child) && !runNodes.has(child),
	);

	if (others.length === 0 && REPLACEABLE.has(firstParent.tagName)) {
		firstParent.parentNode?.insertBefore(section, firstParent);
		firstParent.remove();
	} else {
		// Walk up while the run is still nested in an inline-ish wrapper, so the
		// section ends up a direct child of a block host.
		let anchor: Element = firstParent;
		while (anchor.parentElement && !HOIST_HOSTS.has(anchor.parentElement.tagName)) {
			anchor = anchor.parentElement;
		}
		anchor.parentNode?.insertBefore(section, anchor);
		pruneEmptyWrappers(firstParent);
	}

	for (const slide of run) section.appendChild(slide.node);

	if (hint) {
		const line = createEl('section');
		line.setAttribute('style', hint.style);
		line.textContent = hint.text;
		section.parentNode?.insertBefore(line, section.nextSibling);
	}
}
