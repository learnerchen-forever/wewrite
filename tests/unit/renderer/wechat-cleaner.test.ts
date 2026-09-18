// T020: Unit tests for WeChat HTML cleaner

import { fixMathJaxTags, sanitizeHtml, cleanupEmptyElements, extractAndReplaceLinks, buildLinkReferenceSection, cleanWeChatHtml } from '../../../src/renderer/wechat-cleaner';

describe('fixMathJaxTags', () => {
  it('should remove mjx-assistive-mml elements', () => {
    const html = '<p>text</p><mjx-assistive-mml><math>...</math></mjx-assistive-mml><p>more</p>';
    const result = fixMathJaxTags(html);
    expect(result).not.toContain('mjx-assistive-mml');
    expect(result).toContain('text');
  });

  it('should remove mjx-container and its contents', () => {
    const html = '<mjx-container display="true"><mjx-math>...</mjx-math></mjx-container>';
    const result = fixMathJaxTags(html);
    expect(result).not.toContain('mjx-container');
    expect(result.trim()).toBe('');
  });

  it('should add max-width to SVGs', () => {
    const html = '<svg viewBox="0 0 100 100">content</svg>';
    const result = fixMathJaxTags(html);
    expect(result).toContain('max-width:100%');
  });

  it('adds max-width to an SVG nested in its wrapper, indentation and all', () => {
    expect(fixMathJaxTags('<span style="color:red"><svg viewBox="0 0 24 24"><path d="M1 1"/></svg></span>'))
      .toContain('<svg style="max-width:100%;height:auto" viewBox="0 0 24 24">');
    expect(fixMathJaxTags('<section>\n  <svg viewBox="0 0 24 24"></svg>\n</section>'))
      .toContain('<svg style="max-width:100%;height:auto" viewBox="0 0 24 24">');
  });

  it('leaves an <svg that is only data-URI text alone', () => {
    // `blockquote.starBorder` embeds its border pattern as an SVG data URI, and
    // serialization leaves the `<` literal inside the style attribute. Injecting
    // `style="…"` there used to close the attribute early — the quote lost its
    // radius / padding / background / colour and the SVG's own attributes leaked
    // into the markup as junk attributes.
    const blockquote =
      '<blockquote style="border:3px solid #1da5fb;' +
      "border-image:url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\"><polygon points=\"12,2 14.6,8.2\"/></svg>') 24 repeat;" +
      'border-radius:23px;padding:16px 20px;color:#e2e8f0"></blockquote>';

    const result = fixMathJaxTags(blockquote);

    expect(result).toBe(blockquote);
    // Specifically: the declaration that used to be swallowed must survive.
    expect(result).toContain('border-radius:23px;padding:16px 20px;color:#e2e8f0');
  });
});

describe('sanitizeHtml', () => {
  // Note: <script>, <style>, <iframe> removal is handled by applyInlineStyles'
  // DOM-based querySelectorAll pass, which runs before sanitizeHtml in the
  // full pipeline. sanitizeHtml focuses on tags not covered by that pass.

  it('should strip event handlers', () => {
    const result = sanitizeHtml('<div onclick="alert(1)">text</div>');
    expect(result).not.toContain('onclick');
  });

  it('should replace div with section', () => {
    const result = sanitizeHtml('<div class="test">text</div>');
    expect(result).toContain('<section');
    expect(result).not.toContain('<div');
  });
});

describe('extractAndReplaceLinks', () => {
  it('should replace external link with span + superscript', () => {
    const { html, links } = extractAndReplaceLinks(
      '<a href="https://obsidian.md" style="color:#0366d6">Obsidian</a>',
    );
    expect(html).not.toContain('<a ');
    expect(html).toContain('style="color:#0366d6"');
    expect(html).toContain('<sup');
    expect(html).toContain('[1]');
    expect(links).toHaveLength(1);
    expect(links[0]).toEqual({ text: 'Obsidian', url: 'https://obsidian.md', index: 1 });
  });

  it('should unwrap footnote links instead of numbering them', () => {
    const { html, links } = extractAndReplaceLinks(
      '<a href="#fn-1-xxx" class="footnote-link" style="color:#0366d6">[1]</a>',
    );
    expect(html).not.toContain('<a ');
    expect(html).toContain('[1]');
    expect(links).toHaveLength(0);
  });

  it('should unwrap footnote backref links', () => {
    const { html, links } = extractAndReplaceLinks(
      '<a href="#fnref-1-xxx" class="footnote-backref">↩︎</a>',
    );
    expect(html).not.toContain('<a ');
    expect(html).toContain('↩︎');
    expect(links).toHaveLength(0);
  });

  it('should number multiple links sequentially', () => {
    const { html, links } = extractAndReplaceLinks(
      '<a href="https://a.com" style="color:blue">A</a> and <a href="https://b.com" style="color:red">B</a>',
    );
    expect(html).not.toContain('<a ');
    expect(html).toContain('[1]');
    expect(html).toContain('[2]');
    expect(links).toHaveLength(2);
    expect(links[0].index).toBe(1);
    expect(links[1].index).toBe(2);
  });

  it('should return empty links array when no links present', () => {
    const { html, links } = extractAndReplaceLinks('<p>No links here</p>');
    expect(html).toContain('<p>No links here</p>');
    expect(links).toHaveLength(0);
  });
});

describe('buildLinkReferenceSection', () => {
  it('should return empty string for empty links', () => {
    expect(buildLinkReferenceSection([])).toBe('');
  });

  it('should build ordered list with hr and heading', () => {
    const result = buildLinkReferenceSection([
      { text: 'Obsidian', url: 'https://obsidian.md', index: 1 },
      { text: 'GitHub', url: 'https://github.com', index: 2 },
    ]);
    expect(result).toContain('<hr');
    expect(result).toContain('参考链接');
    expect(result).toContain('<ol');
    expect(result).toContain('Obsidian: https://obsidian.md');
    expect(result).toContain('GitHub: https://github.com');
  });
});

describe('cleanWeChatHtml full pipeline', () => {
  it('should extract links and append reference section', () => {
    const html = '<p>Visit <a href="https://obsidian.md" style="color:#0366d6">Obsidian</a></p>';
    const result = cleanWeChatHtml(html);
    expect(result.html).not.toContain('<a ');
    expect(result.html).toContain('[1]');
    expect(result.html).toContain('参考链接');
    expect(result.html).toContain('Obsidian: https://obsidian.md');
  });

  it('should handle footnote links without adding them to references', () => {
    const html = '<p>Text<sup><a href="#fn-1" class="footnote-link">[1]</a></sup></p>';
    const result = cleanWeChatHtml(html);
    expect(result.html).not.toContain('<a ');
    expect(result.html).not.toContain('参考链接');
    expect(result.html).toContain('[1]');
  });
});

describe('cleanupEmptyElements', () => {
  it('should remove empty list items', () => {
    const result = cleanupEmptyElements('<ul><li>a</li><li></li></ul>');
    const count = (result.match(/<li>/g) || []).length;
    expect(count).toBe(1);
  });

  it('should remove empty paragraphs', () => {
    const result = cleanupEmptyElements('<p>content</p><p></p>');
    const count = (result.match(/<p/g) || []).length;
    expect(count).toBe(1);
  });
});
