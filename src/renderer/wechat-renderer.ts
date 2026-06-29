// WeChat rendering pipeline — applies theme styles and WeChat sanitization
// to HTML pre-rendered by Obsidian's native MarkdownRenderer.

import type { ThemePreset, RenderResult, RenderWarning, RenderContext, ImageCaption, ImageDimension } from '../core/interfaces';
import { ThemeResolver } from './theme-resolver';
import { parseEmbedParams } from './extensions/embed';
import { cleanWeChatHtml } from './wechat-cleaner';

// ── Mermaid SVG style inlining ──
// Mermaid generates SVGs with <style> blocks that define visual properties
// (fills, strokes, line colors) via CSS classes. The WeChat cleaning pipeline
// strips <style> blocks, so we must inline these rules as inline style
// attributes before the blanket removal in applyInlineStyles().

function appendStyleDecl(el: Element, declarations: string): void {
  const current = (el.getAttribute('style') || '').trim();
  const normalized = current ? (current.endsWith(';') ? current : current + ';') : '';
  el.setAttribute('style', normalized + declarations);
}

function normalizeMermaidSelector(selector: string, svg: Element): string | null {
  let s = selector.trim();
  if (!s || s.startsWith('@')) return null;

  const svgId = svg.getAttribute('id');
  if (svgId) {
    const escapedId = svgId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    s = s.replace(new RegExp('#' + escapedId + '\\b', 'g'), '').trim();
  }

  s = s.replace(/^svg\b/i, '').replace(/^:root\b/i, '').replace(/^\s*>\s*/, '').trim();
  return s || ':scope';
}

function inlineMermaidSvgStyles(svg: Element): boolean {
  const styleNodes = Array.from(svg.querySelectorAll('style'));
  if (styleNodes.length === 0) return false;

  for (const styleNode of styleNodes) {
    const cssText = styleNode.textContent || '';
    const ruleRegex = /([^{}]+)\{([^{}]+)\}/g;
    let match: RegExpExecArray | null;
    while ((match = ruleRegex.exec(cssText)) !== null) {
      const selectorGroup = (match[1] || '').trim();
      const declarations = (match[2] || '').trim();
      if (!selectorGroup || !declarations) continue;

      const selectors = selectorGroup.split(',')
        .map((sel) => normalizeMermaidSelector(sel, svg))
        .filter(Boolean) as string[];

      for (const selector of selectors) {
        let targets: Element[] = [];
        try {
          if (selector === ':scope') {
            targets = [svg];
          } else {
            targets = Array.from(svg.querySelectorAll(selector));
          }
        } catch {
          continue;
        }

        for (const target of targets) {
          appendStyleDecl(target, declarations);
        }
      }
    }
  }

  return true;
}

// ── Heading Numbering ──

function formatHeadingNumber(n: number, style: string): string {
  switch (style) {
    case 'decimal': return `${n}.`;
    case 'cjk': {
      const cjk = ['一','二','三','四','五','六','七','八','九','十',
        '十一','十二','十三','十四','十五','十六','十七','十八','十九','二十',
        '二十一','二十二','二十三','二十四','二十五','二十六','二十七','二十八','二十九','三十'];
      return (cjk[n - 1] || String(n)) + '、';
    }
    case 'roman': {
      const vals = [1000,900,500,400,100,90,50,40,10,9,5,4,1];
      const syms = ['M','CM','D','CD','C','XC','L','XL','X','IX','V','IV','I'];
      let num = n; let result = '';
      for (let i = 0; i < vals.length; i++) {
        while (num >= vals[i]) { result += syms[i]; num -= vals[i]; }
      }
      return result.toLowerCase() + '.';
    }
    case 'circled': {
      const start = 0x2460; // ①
      if (n <= 20) return String.fromCodePoint(start + n - 1);
      return `(${n})`;
    }
    default: return `${n}.`;
  }
}

export class WechatRenderer {
  private themeResolver: ThemeResolver;
  private warnings: RenderWarning[] = [];
  private imageCaptions?: ImageCaption[];
  private imageDimensions?: ImageDimension[];

  constructor(style?: ThemePreset) {
    this.themeResolver = new ThemeResolver(style);
  }

  /** Apply style overlay + WeChat sanitization to pre-rendered HTML (from Obsidian native render) */
  processPreRenderedHtml(html: string, sourcePath: string, context?: Partial<RenderContext>): RenderResult {
    this.warnings = [];
    this.imageCaptions = context?.imageCaptions;
    this.imageDimensions = context?.imageDimensions;
    try {
      // Step 1: Style overlay — apply inline styles per element
      const styled = this.applyInlineStyles(html);

      // Step 2: WeChat norm sanitization (reuse existing pipeline)
      const { html: cleanHtml, warnings: cleanWarnings } = cleanWeChatHtml(styled);
      this.warnings.push(...cleanWarnings);

      // Step 3: Section wrapper — inherit text styling from preset
      const p = this.themeResolver.getPreset();
      const font = p.fontFamily;
      const baseFontSize = p.fontSize;
      const lh = p.lineHeight;
      const textColor = p.textColor;
      const wrapperStyle = [
        `font-family:${font}`,
        `font-size:${baseFontSize}px`,
        `line-height:${lh}`,
        `color:${textColor}`,
        `background:${p.background}`,
        'max-width:100%',
        'word-wrap:break-word',
        'text-align:justify',
      ].join(';');
      const finalHtml = `<section style="${wrapperStyle}">${cleanHtml}</section>`;

      return { html: finalHtml, warnings: this.warnings };
    } catch (err) {
      this.warnings.push({
        type: 'embed-skipped',
        message: `Process error: ${String(err)}`,
        element: sourcePath,
      });
      return { html: '', warnings: this.warnings };
    }
  }

  /** Apply inline styles to pre-rendered HTML elements */
  private applyInlineStyles(html: string): string {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const r = this.themeResolver;
    const self = this;

    // Replace <input type="checkbox"> with configured emoji — WeChat strips <input>
    const listPreset = r.getPreset().list;
    // Bridge from modifier config: blocks.list.taskChecked/taskUnchecked override preset values
    const uncheckedEmoji = r.resolveModifierValueName('blocks.list', 'taskUnchecked')
      || listPreset?.taskUnchecked || '🔲';
    const checkedEmoji = r.resolveModifierValueName('blocks.list', 'taskChecked')
      || listPreset?.taskChecked || '✅';
    const taskBulletSpacing = listPreset?.bulletSpacing ?? 8;
    const accent = r.resolveAccent();
    doc.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      const el = input as HTMLInputElement;
      const checked = el.checked || el.hasAttribute('checked');
      const li = el.closest('li') as HTMLElement | null;

      const cb = document.createElement('span');
      cb.setAttribute('style',
        `font-size:16px;line-height:1;margin-right:${taskBulletSpacing}px;` +
        `color:${checked ? accent : '#8b949e'}`);
      cb.textContent = checked ? checkedEmoji : uncheckedEmoji;
      el.parentNode?.replaceChild(cb, el);

      // Unwrap <label> inside the same <li>
      if (li) {
        li.querySelectorAll('label').forEach((label) => {
          const lp = label.parentNode;
          if (lp) {
            while (label.firstChild) lp.insertBefore(label.firstChild, label);
            lp.removeChild(label);
          }
        });
      }

      // Checked items: strikethrough + muted color on trailing siblings
      if (checked && li) {
        let next = cb.nextSibling;
        while (next) {
          const sib = next;
          next = next.nextSibling;
          if (sib.nodeType === Node.TEXT_NODE) {
            const wrap = doc.createElement('span');
            wrap.setAttribute('style', 'text-decoration:line-through;color:#8b949e');
            sib.parentNode!.replaceChild(wrap, sib);
            wrap.appendChild(sib);
          } else if (sib.nodeType === Node.ELEMENT_NODE && sib !== cb) {
            const elem = sib as HTMLElement;
            const cur = elem.getAttribute('style') || '';
            elem.setAttribute('style', cur + ';text-decoration:line-through;color:#8b949e');
          }
        }
      }
    });

    // Convert task-list <ul>/<ol> to flat <section> elements.
    // WeChat adds auto-bullets to <li> (conflicting with emoji) and may re-wrap
    // <li> content into blocks (causing unwanted line breaks). <section> avoids both.
    //
    // Process deepest-first so nested task lists are flattened before their
    // parent lists. Each flattened item carries margin-left proportional to its
    // nesting depth, preserving visual hierarchy after flattening.
    const taskLists = Array.from(doc.querySelectorAll('ul.contains-task-list, ol.contains-task-list'));
    const countAncestorLi = (el: Element): number => {
      let d = 0;
      let p = el.parentElement;
      while (p) {
        if (p.tagName === 'LI') d++;
        p = p.parentElement;
      }
      return d;
    };
    taskLists.sort((a, b) => countAncestorLi(b) - countAncestorLi(a));

    const indentPerLevel = r.getPreset().list?.indent || 24;

    taskLists.forEach((list) => {
      const parent = list.parentNode;
      if (!parent) return;
      const depth = countAncestorLi(list);
      const items = list.querySelectorAll(':scope > li');
      items.forEach((li) => {
        const section = doc.createElement('section');
        let style = r.getStyle('p');
        if (depth > 0) {
          // Strip default paragraph margins, then add one indent unit for this level.
          // Flattened sections are nested inside each other (deepest-first), so
          // margin-left accumulates across levels — each level contributes exactly
          // indentPerLevel, not indentPerLevel * depth.
          style = style.replace(/margin[^;]*;?/gi, '');
          style += `;margin:0;margin-left:${indentPerLevel}px`;
        }
        section.setAttribute('style', style);
        while (li.firstChild) section.appendChild(li.firstChild);
        parent.insertBefore(section, list);
      });
      parent.removeChild(list);
    });

    // Headings
    for (let i = 1; i <= 6; i++) {
      const level = `h${i}`;
      doc.querySelectorAll(level).forEach((el) => {
        const htmlEl = el as HTMLElement;
        htmlEl.setAttribute('style', r.getStyle(level));

        // Apply DOM transform from modifier engine (wrap/prepend/append)
        const domTransform = r.getHeadingDomTransform(level);
        if (domTransform && el.parentNode) {
          const parent = el.parentNode;

          // Prepend: insert before the heading
          if (domTransform.prepend) {
            const prependSpan = doc.createElement('span');
            prependSpan.innerHTML = domTransform.prepend;
            parent.insertBefore(prependSpan, el);
          }

          // Wrap: enclose heading in a wrapper
          if (domTransform.wrap) {
            const wrapper = doc.createElement(domTransform.wrap);
            if (domTransform.wrapStyle) {
              wrapper.setAttribute('style', domTransform.wrapStyle);
            }
            parent.insertBefore(wrapper, el);
            wrapper.appendChild(el);
          }

          // Append: insert after the heading (or after wrapper)
          if (domTransform.append) {
            const appendSpan = doc.createElement('span');
            appendSpan.innerHTML = domTransform.append;
            const refNode = domTransform.wrap
              ? el.parentNode  // heading is now inside wrapper
              : el;
            refNode.parentNode?.insertBefore(appendSpan, refNode.nextSibling);
          }
        }
      });
    }

    // Apply heading numbering from modifier config (per-level sequential counting)
    const mc = r.getPreset().modifierConfig;
    if (mc) {
      const globalNumbering = mc['heading']?.numbering;
      const counters: Record<string, number> = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };
      for (let i = 1; i <= 6; i++) {
        const level = `h${i}`;
        const levelNumbering = mc[`heading.${level}`]?.numbering;
        const numberingStyle = levelNumbering || globalNumbering;
        if (!numberingStyle || numberingStyle === 'none') continue;
        doc.querySelectorAll(level).forEach((el) => {
          counters[level]++;
          const formatted = formatHeadingNumber(counters[level], numberingStyle);
          const numSpan = doc.createElement('span');
          numSpan.setAttribute('style', 'margin-right:0.5em;user-select:none;');
          numSpan.setAttribute('data-wewrite-numbering', 'true');
          numSpan.textContent = formatted;
          el.insertBefore(numSpan, el.firstChild);
        });
      }
    }

    // Paragraphs
    doc.querySelectorAll('p').forEach((el) => {
      (el as HTMLElement).setAttribute('style', r.getStyle('p'));
    });

    // Blockquotes
    doc.querySelectorAll('blockquote').forEach((el) => {
      const htmlEl = el as HTMLElement;
      htmlEl.setAttribute('style', r.getStyle('blockquote'));
      // Icon modifier — insert emoji as first child
      const iconName = r.resolveModifierValueName('blocks.blockquote', 'icon');
      if (iconName) {
        const iconSpan = doc.createElement('span');
        iconSpan.setAttribute('style', 'margin-right:8px;font-size:1.1em');
        iconSpan.textContent = iconName;
        el.insertBefore(iconSpan, el.firstChild);
      }
    });

    // Code blocks: wrap <pre> in styled <section> for container appearance
    doc.querySelectorAll('pre').forEach((el) => {
      const section = document.createElement('section');
      section.setAttribute('style', r.getStyle('pre'));
      el.parentNode?.insertBefore(section, el);
      section.appendChild(el);
      // MacBar DOM transform — prepend Mac-style dots before <pre> inside section
      const macBarDom = r.resolveModifierDom('blocks.code');
      if (macBarDom?.prepend) {
        const prependEl = doc.createElement('span');
        prependEl.innerHTML = macBarDom.prepend;
        section.insertBefore(prependEl, el);
      }
    });
    // Inline code only — block code (<pre><code>) is handled by
    // processCodeBlocksInPlace() which preserves Obsidian's syntax highlighting
    doc.querySelectorAll('code').forEach((el) => {
      if (el.closest('pre')) return;
      (el as HTMLElement).setAttribute('style', r.getStyle('code'));
    });

    // Links
    doc.querySelectorAll('a').forEach((el) => {
      (el as HTMLElement).setAttribute('style', r.getStyle('a'));
    });

    // Images → figure only when a caption is present, otherwise inline
    doc.querySelectorAll('img').forEach((img) => {
      // WeChat CDN images require no-referrer to load outside WeChat domains.
      // Set both the HTML attribute and the DOM property — some Android WebViews
      // ignore the attribute but respect the property.
      img.setAttribute('referrerpolicy', 'no-referrer');
      img.referrerPolicy = 'no-referrer';
      img.setAttribute('data-wewrite-processed', 'true');
      const src = img.getAttribute('src') || '';
      const rawAlt = img.getAttribute('alt') || '';

      // Parse embedded image params from alt text
      const params = parseEmbedParams(rawAlt);

      // Fallback: read width/height from HTML attributes when params not in
      // alt text. Obsidian's MarkdownRenderer parses ![[file|WxH]] and sets
      // width/height HTML attributes but replaces the alt with the filename.
      if (!params.width) {
        const w = img.getAttribute('width');
        if (w) params.width = parseInt(w, 10) || undefined;
      }
      if (!params.height) {
        const h = img.getAttribute('height');
        if (h) params.height = parseInt(h, 10) || undefined;
      }

      // Per-image dimension/alignment override from note config (highest priority).
      // Users set these via the preview context menu — they override both markdown
      // params and HTML attributes.
      if (this.imageDimensions) {
        const key = img.getAttribute('src') || '';
        const override = this.imageDimensions.find(d =>
          key.includes(d.imageKey) || d.imageKey.includes(key.split('/').pop() || '')
        );
        if (override) {
          if (override.width) params.width = override.width;
          if (override.height) params.height = override.height;
          if (override.align) params.align = override.align;
        }
      }

      // Set cleaned alt — only keep alt text that is an intentional caption
      if (params.displayAlt) {
        img.setAttribute('alt', params.displayAlt);
      } else if (rawAlt) {
        img.removeAttribute('alt');
      }

      // Caption: only from saved imageCaptions config (set via context menu).
      // Alt text is auto-generated by Obsidian and is not a user-intended caption.
      const captionEntry = self.imageCaptions?.find(c => src.includes(c.imageKey) || c.imageKey.includes(src.split('/').pop() || ''));
      const captionSource = captionEntry?.text || '';

      // Build img style
      const borderRadius = r.getPreset().image.borderRadius ?? 4;
      let imgStyle = `max-width:100%;height:auto;border-radius:${borderRadius}px;vertical-align:middle`;
      if (params.width) {
        imgStyle += `;width:${params.width}px`;
      }
      if (params.height) {
        imgStyle += `;height:${params.height}px`;
        imgStyle = imgStyle.replace('height:auto;', '');
      }

      if (captionSource) {
        // Only wrap in <figure> when there is an intentional caption
        const figure = document.createElement('figure');
        const figureStyle = r.getStyle('figure');
        if (params.align) {
          imgStyle += ';display:block';
          if (params.align === 'left') {
            imgStyle += ';margin:0 auto 0 0';
          } else if (params.align === 'right') {
            imgStyle += ';margin:0 0 0 auto';
          } else {
            imgStyle += ';margin:0 auto';
          }
          figure.setAttribute('style', figureStyle + `;text-align:${params.align}`);
        } else {
          figure.setAttribute('style', figureStyle);
        }
        (img as HTMLElement).setAttribute('style', imgStyle);

        img.parentNode?.insertBefore(figure, img);
        figure.appendChild(img);

        const showTriangle = r.getPreset().caption?.showTriangle;
        const displayText = showTriangle ? `▲ ${captionSource}` : captionSource;
        const caption = document.createElement('figcaption');
        caption.setAttribute('style', r.getStyle('figcaption'));
        caption.textContent = displayText;
        figure.parentNode?.insertBefore(caption, figure.nextSibling);
      } else {
        // No caption — keep image inline, no frame
        if (params.align) {
          imgStyle += ';display:block';
          if (params.align === 'left') {
            imgStyle += ';margin:0 auto 0 0';
          } else if (params.align === 'right') {
            imgStyle += ';margin:0 0 0 auto';
          } else {
            imgStyle += ';margin:0 auto';
          }
        }
        (img as HTMLElement).setAttribute('style', imgStyle);
      }
    });

    // Tables — wrap in scrollable section for overflow when wider than article
    doc.querySelectorAll('table').forEach((table) => {
      (table as HTMLElement).setAttribute('style', r.getStyle('table'));
      const wrapper = document.createElement('section');
      wrapper.setAttribute('style', r.getStyle('table-wrapper'));
      table.parentNode?.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    });
    doc.querySelectorAll('th').forEach((el) => (el as HTMLElement).setAttribute('style', r.getStyle('th')));
    doc.querySelectorAll('td').forEach((el) => (el as HTMLElement).setAttribute('style', r.getStyle('td')));

    // Zebra striping — apply alternating row background via DOM (nth-child not
    // supported in WeChat inline styles), using modifier config accentBg token.
    const tableConfig = r.getPreset().modifierConfig?.['blocks.table'];
    if (tableConfig?.striped === 'striped') {
      const zebraBg = r.resolveAccentBg();
      doc.querySelectorAll('table').forEach((table) => {
        const rows = table.querySelectorAll('tr');
        rows.forEach((row, idx) => {
          if (idx % 2 === 0) return; // skip header + odd rows
          row.querySelectorAll('td').forEach((td) => {
            const cur = (td as HTMLElement).getAttribute('style') || '';
            (td as HTMLElement).setAttribute('style', cur + `;background-color:${zebraBg}`);
          });
        });
      });
    }

    // Bold, italic — apply base styles first, then <li>-specific overrides
    doc.querySelectorAll('strong, b').forEach((el) => (el as HTMLElement).setAttribute('style', r.getStyle('strong')));
    doc.querySelectorAll('em, i').forEach((el) => (el as HTMLElement).setAttribute('style', r.getStyle('em')));

    // Lists — listPreset & bulletSpacing already extracted above for task checkboxes
    const listLh = r.getPreset().lineHeight;

    // Custom bullet rendering: for 'dash' or custom emoji, WeChat doesn't support
    // ::marker pseudo-elements, so we replace bullets with actual <span> elements.
    const bulletChar = listPreset?.bullet || 'disc';
    const bulletSpacing = listPreset?.bulletSpacing || 8;
    const needsCustomBullet = !['disc', 'circle', 'square'].includes(bulletChar) && bulletChar !== 'none';

    doc.querySelectorAll('ul, ol').forEach((el) => {
      const htmlEl = el as HTMLElement;
      htmlEl.setAttribute('style', r.getStyle(el.tagName.toLowerCase()));
      // For custom bullets, remove native list-style
      if (needsCustomBullet && el.tagName === 'UL') {
        htmlEl.style.listStyleType = 'none';
      }
    });

    // Insert custom bullet spans into <li> elements
    if (needsCustomBullet) {
      doc.querySelectorAll('ul > li').forEach((li) => {
        // Check if already has a bullet span
        const firstChild = li.firstChild;
        if (firstChild && firstChild.nodeType === Node.ELEMENT_NODE
            && (firstChild as Element).getAttribute('data-wewrite-bullet') === 'true') {
          return;
        }
        const bulletSpan = doc.createElement('span');
        bulletSpan.setAttribute('data-wewrite-bullet', 'true');
        bulletSpan.setAttribute('style',
          `margin-right:${bulletSpacing}px;display:inline;user-select:none`);
        bulletSpan.textContent = bulletChar === 'dash' ? '—' : bulletChar;
        li.insertBefore(bulletSpan, li.firstChild);
      });
    }

    doc.querySelectorAll('li').forEach((el) => (el as HTMLElement).setAttribute('style', r.getStyle('li')));

    // Unwrap <p> inside <li> — Obsidian wraps list items in <p>, which WeChat
    // renders with paragraph-level spacing, breaking list compactness.
    doc.querySelectorAll('li > p').forEach((p) => {
      const li = p.parentElement;
      if (!li) return;
      while (p.firstChild) li.insertBefore(p.firstChild, p);
      li.removeChild(p);
    });

    // Stabilize <li> content: wrap loose text nodes and inline elements in a
    // <span style="display:block;margin:0;padding:0"> to prevent WeChat from
    // auto-inserting <section> wrappers with margins between list items.
    doc.querySelectorAll('li').forEach((li) => {
      // Skip if li is empty or only contains nested lists
      const nestedList = li.querySelector(':scope > ul, :scope > ol');
      const children = Array.from(li.childNodes);
      const hasNonListContent = children.some(
        (c) => c.nodeType === Node.TEXT_NODE && c.textContent?.trim()
          || (c.nodeType === Node.ELEMENT_NODE && !['UL', 'OL'].includes((c as Element).tagName)),
      );

      if (!hasNonListContent) return;

      // Collect loose nodes (text + non-list-element inline elements) that
      // precede any nested list, and wrap them in a stabilizing span
      const toWrap: Node[] = [];
      for (const child of children) {
        if (child.nodeType === Node.ELEMENT_NODE && ['UL', 'OL'].includes((child as Element).tagName)) break;
        toWrap.push(child);
      }
      if (toWrap.length === 0) return;

      const wrapper = doc.createElement('span');
      wrapper.setAttribute('style', `margin:0;padding:0;line-height:${listLh}`);
      toWrap.forEach((n) => wrapper.appendChild(n));
      if (nestedList) {
        li.insertBefore(wrapper, nestedList);
      } else {
        li.appendChild(wrapper);
      }
    });

    // Force inline display on formatting elements inside <li> — WeChat treats
    // block-display elements as triggers for extra <section> wrapping.
    doc.querySelectorAll('li strong, li b, li code, li em, li i').forEach((el) => {
      const cur = (el as HTMLElement).getAttribute('style') || '';
      (el as HTMLElement).setAttribute('style',
        cur + ';display:inline !important;width:auto !important;float:none !important');
    });

    // Zero out margins on nested <ul>/<ol> inside <li> — prevents extra gap
    // between the parent item text and the nested list.
    doc.querySelectorAll('li > ul, li > ol').forEach((nl) => {
      const cur = (nl as HTMLElement).getAttribute('style') || '';
      (nl as HTMLElement).setAttribute('style', cur.replace(/margin[^;]*;?/gi, '') + ';margin:0');
    });

    // Flatten nested regular lists into a flat sequence of <ul>/<ol> elements.
    // WeChat's editor doesn't support deeply nested lists — it extracts and
    // flattens them, losing hierarchy and scrambling order. Pre-flatten here
    // so that indentation is expressed via progressive padding-left on flat,
    // non-nested <ul>/<ol> elements.
    //
    // Single-pass tree walk: each <li> is emitted in document order with its
    // depth recorded. Nested lists are temporarily detached to get clean <li>
    // content, then walked recursively. Consecutive items at the same depth
    // and tag type are grouped into one list. No splitting artifacts — the
    // output is built from scratch in a single forward pass.
    (function flattenRegularLists() {
      const baseIndent = r.getPreset().list?.indent || 24;

      // Find root lists: <ul>/<ol> whose ancestor chain contains no <li>
      const allLists = Array.from(
        doc.querySelectorAll('ul:not(.contains-task-list), ol:not(.contains-task-list)'),
      );
      const rootLists = allLists.filter((list) => {
        let p = list.parentElement;
        while (p) {
          if (p.tagName === 'LI') return false;
          p = p.parentElement;
        }
        return true;
      });

      interface FlatItem { li: HTMLElement; depth: number; tag: string; }
      for (const root of rootLists) {
        const flat: FlatItem[] = [];

        // Walk tree in document order. For each <li>, detach nested child
        // lists to get clean content, emit the <li> with its depth, then
        // recursively walk the detached nested lists at depth + 1.
        function walk(list: Element, depth: number): void {
          const items = Array.from(list.querySelectorAll(':scope > li')) as HTMLElement[];
          for (const li of items) {
            const nested = Array.from(
              li.querySelectorAll(':scope > ul:not(.contains-task-list), :scope > ol:not(.contains-task-list)'),
            );
            if (nested.length > 0) {
              const detached: Element[] = [];
              for (const nl of nested) { nl.remove(); detached.push(nl); }

              // Only emit the li if it still has meaningful content
              if (li.textContent?.trim()) {
                flat.push({ li, depth, tag: list.tagName });
              }

              for (const nl of detached) { walk(nl, depth + 1); }
            } else {
              flat.push({ li, depth, tag: list.tagName });
            }
          }
        }

        walk(root, 0);

        // Rebuild: group consecutive items at same depth AND same tag type
        // into flat <ul>/<ol> elements. Each group gets progressive padding-left
        // and zero vertical margins (compact vertical rhythm).
        const parentNode = root.parentNode!;
        const anchor = root.nextSibling;

        let i = 0;
        while (i < flat.length) {
          const { depth, tag } = flat[i];
          const group: HTMLElement[] = [];
          while (i < flat.length && flat[i].depth === depth && flat[i].tag === tag) {
            group.push(flat[i].li);
            i++;
          }

          const newList = doc.createElement(tag);
          let listStyle = r.getStyle(tag);
          listStyle = listStyle.replace(/padding-left:\s*\d+px/,
            `padding-left: ${baseIndent * (depth + 1)}px`);
          listStyle = listStyle.replace(/margin[^;]*;?/gi, '');
          listStyle += ';margin:0';
          newList.setAttribute('style', listStyle);

          for (const li of group) { newList.appendChild(li); }
          parentNode.insertBefore(newList, anchor);
        }

        parentNode.removeChild(root);
      }
    })();

    // Horizontal rules
    doc.querySelectorAll('hr').forEach((el) => (el as HTMLElement).setAttribute('style', r.getStyle('hr')));

    // Callout sections — overlay blocks.callout modifier CSS on top of
    // the Obsidian-computed styles already inlined by processCalloutsAndAdmonitions.
    doc.querySelectorAll('section[data-wewrite-callout]').forEach((section) => {
      const modifierCss = r.resolveModifierCSS('blocks.callout');
      if (modifierCss) {
        const cur = (section as HTMLElement).getAttribute('style') || '';
        (section as HTMLElement).setAttribute('style', cur + ';' + modifierCss);
      }
    });

    // Replace <div> with <section> for WeChat compatibility
    doc.querySelectorAll('div').forEach((div) => {
      const section = document.createElement('section');
      for (const attr of div.attributes) {
        section.setAttribute(attr.name, attr.value);
      }
      section.innerHTML = div.innerHTML;
      div.parentNode?.replaceChild(section, div);
    });

    // Inline Mermaid SVG <style> rules as inline style attributes before
    // stripping <style> blocks. Mermaid uses CSS classes to define all visual
    // properties (fills, strokes, line colors); without inlining, diagrams
    // render with black fills and invisible lines after style removal.
    doc.querySelectorAll('svg').forEach((svg) => inlineMermaidSvgStyles(svg));

    // Preserve Obsidian plugin icons (Remix, Iconize) with inline styles
    // matching Obsidian's default .obsidian-icon CSS rules. We can't use
    // getComputedStyle() here because the DOMParser document has no
    // stylesheets — classes have no effect. Apply known defaults directly.
    // Refs: _references/wewrite_legacy/src/assets/default-styles/35_icon.css
    doc.querySelectorAll('.obsidian-icon.react-icon, .cm-iconize-icon').forEach((iconEl) => {
      const el = iconEl as HTMLElement;
      const svg = el.querySelector('svg');
      if (!svg) return;

      // Wrapper: match Obsidian's .obsidian-icon { width:1.8rem; display:inline-block }
      el.setAttribute('style', 'display:inline-block;width:1.8em;text-align:center');

      // SVG: fill wrapper, match .obsidian-icon.react-icon > svg
      const cur = svg.getAttribute('style') || '';
      svg.setAttribute('style',
        cur + ';width:100%;height:auto;vertical-align:middle;margin-bottom:3px');

      svg.setAttribute('data-wewrite-no-prescan', '');
    });

    // Remove script, style, iframe tags
    doc.querySelectorAll('script, style, iframe').forEach((el) => el.remove());

    return doc.body.innerHTML;
  }

  /** Update style without re-parsing markdown */
  updateStyle(style: ThemePreset): void {
    this.themeResolver.updateStyle(style);
  }

  getThemeResolver(): ThemeResolver {
    return this.themeResolver;
  }
}
