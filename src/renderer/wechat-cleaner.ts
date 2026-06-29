// WeChat HTML post-render normalization
// Handles SVG rasterization, mjx-container replacement, link extraction, sanitization

import type { RenderWarning } from '../core/interfaces';

/** Remove MathJax custom elements that would survive the render pipeline.
 *  Primary conversion (LaTeX → SVG) is handled by processMathToSvg() in the
 *  news view — this function only strips elements that were missed and would
 *  be stripped anyway by WeChat, so they don't appear as raw tag soup. */
export function fixMathJaxTags(html: string): string {
  let result = html;

  // Remove <mjx-assistive-mml> (hidden MathML that becomes visible in WeChat)
  result = result.replace(/<mjx-assistive-mml[\s\S]*?<\/mjx-assistive-mml>/g, '');

  // Remove any unhandled <mjx-container> and its contents. The CHTML inside
  // (<mjx-*> elements) is stripped by WeChat, so wrapping in span/section
  // produces invisible output. processMathToSvg() handles the vast majority;
  // these are the few that slipped through (formula/container mismatch, etc.).
  result = result.replace(/<mjx-container[\s\S]*?<\/mjx-container>/g, '');

  // Add max-width to SVGs for mobile responsiveness.
  result = result.replace(/<svg (?!style\b)/g, '<svg style="max-width:100%;height:auto" ');

  return result;
}

/** Flatten nested lists into inline spans (WeChat doesn't support nested lists well) */
export function flattenNestedLists(html: string): string {
  return html;
}

/** Remove empty elements */
export function cleanupEmptyElements(html: string): string {
  let result = html;
  result = result.replace(/<li[^>]*>\s*<\/li>/g, '');
  result = result.replace(/<p[^>]*>\s*<\/p>/g, '');
  return result;
}

/** Collapse whitespace between block-level HTML tags.
 *  WeChat's editor treats newlines between block elements as visible blank lines. */
export function compactBlockWhitespace(html: string): string {
  const blockTags = 'li|ul|ol|p|h[1-6]|section|blockquote|figure|figcaption|table|tbody|thead|tr|th|td|pre|hr|br|img';

  const p1 = new RegExp(
    `(<\\/(?:${blockTags})>)\\s+(<(?:${blockTags})[^>]*\\/?>)`,
    'gi',
  );
  const p2 = new RegExp(
    `(<(?:${blockTags})[^>]*>)\\s+(<(?:${blockTags})[^>]*\\/?>)`,
    'gi',
  );
  const p3 = new RegExp(
    `(<\\/(?:${blockTags})>)\\s+(<\\/(?:${blockTags})>)`,
    'gi',
  );

  let result = html;
  let changed = true;
  while (changed) {
    const before = result;
    result = result.replace(p1, '$1$2');
    result = result.replace(p2, '$1$2');
    result = result.replace(p3, '$1$2');
    changed = result !== before;
  }
  return result;
}

export interface LinkEntry {
  text: string;
  url: string;
  index: number;
}

/** Scan HTML for all <a> tags, replace them with styled <span> + superscript
 *  reference numbers, and collect link entries for the reference list.
 *  Footnote links (class="footnote-link"/"footnote-backref") are unwrapped
 *  rather than numbered — they stay as plain text references.
 *  Must run BEFORE sanitizeHtml() since we need class attributes for detection. */
export function extractAndReplaceLinks(html: string): { html: string; links: LinkEntry[] } {
  const links: LinkEntry[] = [];

  // Match <a ...>...</a> — non-greedy content capture, works in Node and browser
  const anchorRegex = /<a\b([^>]*?)>([\s\S]*?)<\/a\s*>/gi;

  const result = html.replace(anchorRegex, (_fullMatch, attrs: string, content: string) => {
    // Extract href
    const hrefMatch = attrs.match(/href\s*=\s*"([^"]*)"/i)
      || attrs.match(/href\s*=\s*'([^']*)'/i);
    const href = hrefMatch ? hrefMatch[1] : '';

    // Extract inline style to preserve preset colors on the replacement span
    const styleMatch = attrs.match(/style\s*=\s*"([^"]*)"/i);
    const style = styleMatch ? styleMatch[1] : '';

    // Check if this is a footnote reference/backref — unwrap those
    const isFootnote =
      /\bfootnote-link\b/.test(attrs) ||
      /\bfootnote-backref\b/.test(attrs) ||
      href.startsWith('#fn-') ||
      href.startsWith('#fnref-');

    if (isFootnote) {
      return content; // unwrap: keep inner HTML, remove <a> wrapper
    }

    // Strip HTML tags from content for the reference-text field
    const plainText = content.replace(/<[^>]+>/g, '').trim() || href;
    const index = links.length + 1;
    links.push({ text: plainText, url: href, index });

    // Preserve inner HTML formatting (bold, italic, code) in the display span
    return `<span style="${style}">${content}</span><sup style="font-size:0.75em;color:#999;margin-left:1px">[${index}]</sup>`;
  });

  return { html: result, links };
}

/** Build the reference list section appended at the end of the article. */
export function buildLinkReferenceSection(links: LinkEntry[]): string {
  if (links.length === 0) return '';

  const items = links.map((l) =>
    `<li style="font-size:14px;color:#666;line-height:1.8;word-break:break-all">${l.text}: ${l.url}</li>`,
  ).join('');

  return [
    '<hr style="border:0;border-top:1px solid rgba(0,0,0,0.08);margin:32px 0 16px">',
    '<p style="font-size:16px;font-weight:600;color:#333;margin:0 0 8px">参考链接</p>',
    `<ol style="font-size:14px;color:#666;padding-left:24px;margin:0">${items}</ol>`,
  ].join('');
}

/** Strip tags and attributes forbidden by WeChat's content filter.
 *  Error 45166 ("invalid content") is triggered by disallowed attributes
 *  like target, rel, aria-*, data-*, class, id, dir on HTML elements. */
export function sanitizeHtml(html: string): string {
  let result = html;

  // Strip <object>, <embed>, <video>, <audio>.
  // <script>, <style>, <iframe> are already removed by applyInlineStyles
  // via DOM-based querySelectorAll (more precise than regex).
  result = result.replace(/<object[\s\S]*?<\/object>/gi, '');
  result = result.replace(/<embed[\s\S]*?>/gi, '');
  result = result.replace(/<video[\s\S]*?<\/video>/gi, '');
  result = result.replace(/<audio[\s\S]*?<\/audio>/gi, '');

  // Strip event handlers (onclick, onload, etc.)
  result = result.replace(/\s+on\w+\s*=\s*"[^"]*"/gi, '');
  result = result.replace(/\s+on\w+\s*=\s*'[^']*'/gi, '');

  // Strip WeChat-forbidden attributes from all elements.
  const forbiddenAttrs = [
    'target', 'rel',
    'aria-label',
    'data-tooltip-position', 'data-href', 'data-heading',
    'data-footnote-id', 'data-footref',
    'dir', 'class', 'id', 'tabindex', 'role',
    'bgcolor', 'border', 'cellpadding', 'cellspacing', 'valign',
    'contenteditable', 'draggable', 'hidden', 'spellcheck', 'title',
  ];

  for (const attr of forbiddenAttrs) {
    result = result.replace(new RegExp(`\\s+${attr}\\s*=\\s*"[^"]*"`, 'gi'), '');
    result = result.replace(new RegExp(`\\s+${attr}\\s*=\\s*'[^']*'`, 'gi'), '');
    result = result.replace(new RegExp(`\\s+${attr}\\s*=\\s*[^\\s>]+`, 'gi'), '');
  }

  // Strip all remaining data-* and aria-* attributes (prefix-based)
  result = result.replace(/\s+data-\w+\s*=\s*"[^"]*"/gi, '');
  result = result.replace(/\s+data-\w+\s*=\s*'[^']*'/gi, '');
  result = result.replace(/\s+aria-\w+\s*=\s*"[^"]*"/gi, '');
  result = result.replace(/\s+aria-\w+\s*=\s*'[^']*'/gi, '');

  // Replace <div> with <section> (WeChat strips divs)
  result = result.replace(/<div\b/g, '<section');
  result = result.replace(/<\/div>/g, '</section>');

  return result;
}

/** Run full WeChat HTML cleanup pipeline.
 *  Order matters: link extraction must run before sanitizeHtml() so we can
 *  detect footnote-link class; reference section is appended after sanitize. */
export function cleanWeChatHtml(html: string): { html: string; warnings: RenderWarning[] } {
  const warnings: RenderWarning[] = [];
  let result = html;

  result = fixMathJaxTags(result);

  const { html: linklessHtml, links } = extractAndReplaceLinks(result);
  result = linklessHtml;

  result = sanitizeHtml(result);
  result = cleanupEmptyElements(result);
  result = compactBlockWhitespace(result);

  if (links.length > 0) {
    result += buildLinkReferenceSection(links);
  }

  return { html: result, warnings };
}
