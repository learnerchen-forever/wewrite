// Shared callout & admonition DOM post-processing.
// Used by both the WeChat news view and the theme editor preview.
//
// After MarkdownRenderer.render() produces live DOM, callouts and admonitions
// exist as .callout divs with nested title/content children. The Admonition
// plugin renders the same .callout structure (just with extra .admonition-*
// classes), so we only need to target .callout.

/**
 * Wait for async plugins (callout rendering, admonition plugin) to finish
 * populating the DOM. Polls up to maxWait ms, returns early once stable.
 */
export async function waitForCalloutPlugins(el: HTMLElement, maxWait = 5000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const callouts = el.querySelectorAll('.callout');

    // Check for still-loading callouts (Obsidian native)
    const hasLoadingCallouts = Array.from(callouts).some((c) =>
      c.querySelector('.is-loaded') === null &&
      c.querySelector('[data-callout]') !== null,
    );

    // Check for blocks without content yet (admonition plugin may be async)
    const hasPendingContent = Array.from(callouts).some((c) =>
      c.querySelector('.callout-content') === null,
    );

    // Admonition plugin injects FontAwesome SVG icons asynchronously —
    // the icon div may exist but the SVG child hasn't been injected yet
    const hasPendingIcons = Array.from(callouts).some((c) => {
      const icon = c.querySelector('.callout-icon');
      return icon !== null && icon.querySelector('svg') === null;
    });

    // Document stability: if the container looks nearly empty, Obsidian may
    // still be in its first render pass
    const hasPending = el.querySelectorAll('.markdown-preview-sizer').length === 0 &&
      el.querySelectorAll('p:only-child').length > 0 &&
      el.childElementCount < 3;

    if (!hasLoadingCallouts && !hasPendingContent && !hasPendingIcons && !hasPending) break;
    if (Date.now() - start > 3000) break;
    await new Promise((r) => setTimeout(r, 200));
  }
}

/**
 * Convert .callout divs to flat <section> elements with computed inline styles.
 * Processes innermost blocks first to handle nested callouts correctly.
 *
 * Both Obsidian native callouts (`> [!note]`) and the Admonition plugin
 * (```ad-*) produce .callout divs with identical child structure:
 * .callout-title > .callout-icon + .callout-title-inner, .callout-content.
 */
export function processCalloutsAndAdmonitions(container: HTMLElement): void {
  const blocks = Array.from(container.querySelectorAll('.callout'));

  // Process innermost first so nested callout content is already
  // transformed when its parent callout is processed
  blocks.sort((a, b) => {
    const depthA = a.querySelectorAll('.callout').length;
    const depthB = b.querySelectorAll('.callout').length;
    return depthA - depthB;
  });

  for (const block of blocks) {
    if (!block.parentNode) continue;

    const styles = window.getComputedStyle(block);
    const bgColor = styles.backgroundColor || 'transparent';
    const borderRadius = styles.borderRadius || '4px';
    const padding = styles.padding || '12px 16px';
    const margin = styles.margin || '16px 0';

    const titleEl = block.querySelector('.callout-title') as HTMLElement | null;
    const contentEl = block.querySelector('.callout-content') as HTMLElement | null;

    let titleColor = '#333333';
    let titleFontSize = '15px';
    let titleFontWeight = '600';
    let titleGap = '8px';
    let titleMarginBottom = '8px';

    if (titleEl) {
      const ts = window.getComputedStyle(titleEl);
      titleColor = ts.color || titleColor;
      titleFontSize = ts.fontSize || titleFontSize;
      titleFontWeight = ts.fontWeight || titleFontWeight;
      titleGap = ts.gap || ts.columnGap || titleGap;
      titleMarginBottom = ts.marginBottom || titleMarginBottom;
    }

    // Build inline-styled replacement.
    // Preserve the callout type so the renderer can apply modifier CSS.
    const calloutType = block.getAttribute('data-callout') || '';
    const wrapper = document.createElement('section');
    wrapper.setAttribute('data-wewrite-callout', calloutType);
    wrapper.setAttribute(
      'style',
      `background-color:${bgColor};border-radius:${borderRadius};padding:${padding};margin:${margin}`,
    );

    // Title row
    const titleSection = document.createElement('section');
    titleSection.setAttribute(
      'style',
      `display:flex;align-items:center;gap:${titleGap};margin-bottom:${titleMarginBottom};` +
        `color:${titleColor};font-weight:${titleFontWeight};font-size:${titleFontSize}`,
    );

    if (titleEl) {
      titleSection.innerHTML = titleEl.innerHTML;
      // Ensure icon SVGs have explicit dimensions. Native callout icons
      // include width/height (e.g. 24×24), but FontAwesome SVGs injected
      // by the Admonition plugin rely on CSS classes (.svg-inline--fa,
      // .fa-w-16) that don't exist outside Obsidian's stylesheet.
      const iconSvgs = titleSection.querySelectorAll('.callout-icon svg');
      iconSvgs.forEach((svg) => {
        svg.setAttribute('data-wewrite-no-prescan', '');
        if (!svg.hasAttribute('width') && !svg.hasAttribute('height')) {
          const fontSize = titleFontSize; // e.g. "15px"
          svg.setAttribute('width', fontSize);
          svg.setAttribute('height', fontSize);
        }
      });
    }

    wrapper.appendChild(titleSection);

    // Body content
    const bodySection = document.createElement('section');
    if (contentEl) {
      bodySection.innerHTML = contentEl.innerHTML;
    } else {
      const clone = block.cloneNode(true) as HTMLElement;
      const cloneTitle = clone.querySelector('.callout-title') as HTMLElement | null;
      if (cloneTitle) cloneTitle.remove();
      bodySection.innerHTML = clone.innerHTML;
    }
    wrapper.appendChild(bodySection);

    // Replace in DOM
    block.parentNode.replaceChild(wrapper, block);
  }
}
