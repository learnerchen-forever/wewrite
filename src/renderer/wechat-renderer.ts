// WeChat rendering pipeline — applies theme styles and WeChat sanitization
// to HTML pre-rendered by Obsidian's native MarkdownRenderer.

import type { ThemePreset, RenderResult, RenderWarning, RenderContext, ImageCaption, ImageDimension } from '../core/interfaces';
import { ThemeResolver } from './theme-resolver';
import { renderHeadings } from './heading-renderer';
import { renderBlockquotes } from './blockquote-renderer';
import { renderCallouts } from './callout-renderer';
import {
	buildCaptionStyle,
	buildFigureStyle,
	buildImageSliderHint,
	buildImageSliderStyle,
	buildImageStyle,
	expandImageTokens,
	hasImageConfig,
	isImageSliderEnabled,
	resolveImageDecorationStyle,
	resolveImageMarginY,
	toImageSliderSlide,
} from './image-renderer';
import { collectImageSliderRuns, wrapImageSlider, type ImageSliderSlide } from './image-slider';
import { renderInlineElements } from './inline-renderer';
import { applyTableLayout, renderTables } from './table-renderer';
import { renderDividers } from './divider-renderer';
import { renderTaskLists, renderOrderedLists, renderUnorderedLists } from './list-renderer';
import { parseEmbedParams } from './extensions/embed';
import { cleanWeChatHtml } from './wechat-cleaner';
import { getCodeLanguageFromClassList } from '../core/code-theme-library';
import { applyMermaidSvgStyle, extractCssVars, isMermaidSvg, resolveCssVarValue } from './mermaid-svg-themer';
import { buildMathStyle, expandMathTokens, hasMathConfig, resolveMathDecorationStyle } from './math-renderer';
import { escapeHtmlAttr } from './shared';
import {
	buildExcalidrawContainerStyle,
	expandExcalidrawTokens,
	hasExcalidrawConfig,
	isExcalidrawImage,
	resolveExcalidrawDecorationStyle,
} from './excalidraw-renderer';
import { setTrustedHtml } from '../utils/trusted-html';
import { ARTICLE_INLINE_STYLE } from './article-inline-styles';
import { blockMarginY, resolveBlockMarginY, DEFAULT_BLOCK_MARGIN_Y } from '../core/block-spacing';

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

  // Collect CSS variables from :root rules so var(--x) references can be
  // resolved to literal values before the <style> block is stripped.
  const varMap: Record<string, string> = {};
  for (const styleNode of styleNodes) {
    const cssText = styleNode.textContent || '';
    Object.assign(varMap, extractCssVars(cssText));
  }

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
          appendStyleDecl(target, resolveCssVarValue(declarations, varMap));
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

/**
 * True when an image has its container to itself, so it can claim the full
 * reading width. Several images in one paragraph are a row rather than a stack,
 * and stretching them all to 100% would turn that row into a column.
 */
function isLoneImage(img: HTMLImageElement): boolean {
  const parent = img.parentElement;
  if (!parent) return true;
  return parent.children.length === 1;
}

/** Keep list-item inline content from being re-wrapped by WeChat.
 *  Includes inline math wrappers — `display:inline-block` inside <li> is a
 *  common cause of "text + formula" splitting onto separate lines after paste. */
function forceInlineInsideLists(doc: Document): void {
  doc.querySelectorAll('li strong, li b, li code, li em, li i').forEach((el) => {
    const cur = (el as HTMLElement).getAttribute('style') || '';
    (el as HTMLElement).setAttribute('style',
      cur + ';display:inline !important;width:auto !important;float:none !important');
  });

  doc.querySelectorAll('li svg.wewrite-math').forEach((svg) => {
    // Block math lives in a <section> parent — skip those.
    const parent = svg.parentElement;
    if (!parent || parent.tagName === 'SECTION') return;

    const cur = parent.getAttribute('style') || '';
    // Drop any prior display:inline-block so WeChat cannot treat it as a block.
    const cleaned = cur
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s && !/^display\s*:/i.test(s))
      .join(';');
    parent.setAttribute(
      'style',
      (cleaned ? cleaned + ';' : '') + 'display:inline !important;vertical-align:middle;width:auto !important;float:none !important',
    );

    const svgStyle = svg.getAttribute('style') || '';
    const svgCleaned = svgStyle
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s && !/^display\s*:/i.test(s))
      .join(';');
    svg.setAttribute(
      'style',
      (svgCleaned ? svgCleaned + ';' : '') + 'display:inline;vertical-align:middle',
    );
  });
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

      // Step 3: Section wrapper — inherit text styling from preset + article slots
      const p = this.themeResolver.getPreset();
      const font = p.fontFamily;
      const baseFontSize = p.fontSize;
      const lh = p.lineHeight;
      const textColor = p.textColor;
      const articleCss = this.themeResolver.resolveSlotCSS('article');
      const wrapperStyle = [
        `font-family:${font}`,
        `font-size:${baseFontSize}px`,
        `line-height:${lh}`,
        `color:${textColor}`,
        `background:${p.background}`,
        'box-sizing:border-box',
        'max-width:100%',
        'word-wrap:break-word',
        'text-align:justify',
        articleCss, // article background/pattern/margin/radius/border override the base
      ].filter(Boolean).join(';');
      const finalHtml = `<section style="${escapeHtmlAttr(wrapperStyle)}">${cleanHtml}</section>`;

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

  /**
   * The saved caption entry for an image, if any. Matched on the src because
   * the note-side config stores file keys, not resolved URLs.
   */
  private findCaptionEntry(src: string): ImageCaption | undefined {
    return this.imageCaptions?.find(
      (c) => src.includes(c.imageKey) || c.imageKey.includes(src.split('/').pop() || ''),
    );
  }

  /** Apply inline styles to pre-rendered HTML elements */
  private applyInlineStyles(html: string): string {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const r = this.themeResolver;

    // Task lists — independent pipeline: checkbox replacement (params-driven
    // icons/size/gap/color) + section flattening for WeChat compatibility.
    renderTaskLists(doc, r);

    // Headings — new template pipeline when headingConfig is present,
    // otherwise fall back to the v3 slot + DOM transform path.
    if (!renderHeadings(doc, r)) {
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
              const prependSpan = createSpan();
              setTrustedHtml(prependSpan, domTransform.prepend);
              parent.insertBefore(prependSpan, el);
            }

            // Wrap: enclose heading in a wrapper
            if (domTransform.wrap) {
              const wrapper = createEl(domTransform.wrap as keyof HTMLElementTagNameMap);
              if (domTransform.wrapStyle) {
                wrapper.setAttribute('style', domTransform.wrapStyle);
              }
              parent.insertBefore(wrapper, el);
              wrapper.appendChild(el);
            }

            // Append: insert after the heading (or after wrapper)
            if (domTransform.append) {
              const appendSpan = createSpan();
              setTrustedHtml(appendSpan, domTransform.append);
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
        const globalNumbering = mc['heading']?.prefix;
        const counters: Record<string, number> = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };
        for (let i = 1; i <= 6; i++) {
          const level = `h${i}`;
          const levelNumbering = mc[`heading.${level}`]?.prefix;
          const numberingStyle = levelNumbering || globalNumbering;
          if (!numberingStyle || numberingStyle === 'none') continue;
          doc.querySelectorAll(level).forEach((el) => {
            counters[level]++;
            const formatted = formatHeadingNumber(counters[level], numberingStyle);
            const numSpan = createSpan();
            numSpan.setAttribute('style', ARTICLE_INLINE_STYLE.headingNumber);
            numSpan.setAttribute('data-wewrite-numbering', 'true');
            numSpan.textContent = formatted;
            el.insertBefore(numSpan, el.firstChild);
          });
        }
      }
    }

    // Paragraphs
    doc.querySelectorAll('p').forEach((el) => {
      (el as HTMLElement).setAttribute('style', r.getStyle('p'));
    });

    // Blockquotes — new template pipeline when blockquoteConfig is present,
    // otherwise keep Obsidian's original look (default margins only).
    if (!renderBlockquotes(doc, r)) {
      doc.querySelectorAll('blockquote').forEach((el) => {
        const htmlEl = el as HTMLElement;
        htmlEl.setAttribute('style', r.getStyle('blockquote'));
      });
    }

    // Inline elements — new template pipeline (bold/italic/code/link/tag/math).
    // When active it owns every inline type; otherwise the v3 slot paths below
    // (inline code / links / strong / em / inline-math) style them.
    const inlineHandled = renderInlineElements(doc, r);

    // Inline code only — block code (<pre><code>) is handled by
    // processCodeBlocksInPlace() which preserves Obsidian's syntax highlighting
    if (!inlineHandled) {
      doc.querySelectorAll('code').forEach((el) => {
        if (el.closest('pre')) return;
        el.setAttribute('style', r.getStyle('code'));
      });

      // Links
      doc.querySelectorAll('a').forEach((el) => {
        (el as HTMLElement).setAttribute('style', r.getStyle('a'));
      });
    }

    // Images → figure only when a caption is present, otherwise inline
    //
    // Image window (图片轮播): with the theme switch on, a run of images that
    // no blank line separates (one paragraph, whitespace / <br> in between)
    // becomes one swipeable carousel — a snap-scrolling section whose slides are
    // one article width each, so a swipe moves from one picture to the next.
    // Captioned images never join a run — the carousel would strand their
    // <figcaption>.
    const marginY = resolveImageMarginY(r);
    const sliderRuns: ImageSliderSlide[][] = isImageSliderEnabled(r)
      ? collectImageSliderRuns(doc.body ?? doc.documentElement, (img) => !this.findCaptionEntry(img.getAttribute('src') || ''))
      : [];
    const sliderSlides = new Set<HTMLImageElement>();
    for (const run of sliderRuns) {
      for (const slide of run) sliderSlides.add(slide.img);
    }

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
      const captionSource = this.findCaptionEntry(src)?.text || '';

      // Build img style — the new image decoration system when imageConfig is
      // present (per-image width/height/align stay highest priority), otherwise
      // the v3 preset + media.image slot path.
      // Excalidraw PNGs (cache prefix "excalidraw-") get the excalidraw
      // decoration; everything else uses the image decoration.
      let imageDeco: { decoration: { id: string } | null; params: Record<string, string> } | null = null;
      if (isExcalidrawImage(src) && hasExcalidrawConfig(r)) {
        imageDeco = resolveExcalidrawDecorationStyle(r);
      } else if (hasImageConfig(r)) {
        imageDeco = resolveImageDecorationStyle(r);
      }
      if (imageDeco) {
        imageDeco = { ...imageDeco, params: expandImageTokens(imageDeco.params, r.getTokens()) };
      }
      let imgStyle: string;
      if (imageDeco) {
        imgStyle = buildImageStyle(imageDeco.params, {
          width: params.width,
          height: params.height,
          align: params.align,
          marginY,
        });
      } else {
        const borderRadius = r.getPreset().image.borderRadius ?? 4;
        // `display:inline-block` is what lets the top/bottom margin apply at
        // all — a plain inline image ignores vertical margins, which is how
        // images used to end up flush against the text around them.
        const baseImgStyle = `height:auto;border-radius:${borderRadius}px;vertical-align:middle;display:inline-block;margin:${marginY} 0`;
        if (params.width) {
          // Explicit size → a cap plus `width:100%`, same reason as
          // buildImageStyle: the editor rewrites `width` on every image but
          // leaves `max-width` alone.
          imgStyle = `max-width:${params.width}px;${baseImgStyle};width:100%`;
        } else {
          imgStyle = `max-width:100%;${baseImgStyle}`;
          if (isLoneImage(img)) {
            // No size asked for → fill the reading column (same rule as the
            // decoration path above). Only when the image has the container to
            // itself: several images in one paragraph are a row, not a stack.
            imgStyle += ';width:100%';
          }
        }
        if (params.height) {
          imgStyle += `;height:${params.height}px`;
          imgStyle = imgStyle.replace('height:auto;', '');
        }
      }

      if (captionSource) {
        // Only wrap in <figure> when there is an intentional caption
        const figure = createEl('figure');
        if (imageDeco) {
          figure.setAttribute('style', buildFigureStyle(imageDeco.params, params.align));
        } else {
          const figureStyle = r.getStyle('figure');
          if (params.align) {
            imgStyle += ';display:block';
            if (params.align === 'left') {
              imgStyle += `;margin:${marginY} auto ${marginY} 0`;
            } else if (params.align === 'right') {
              imgStyle += `;margin:${marginY} 0 ${marginY} auto`;
            } else {
              imgStyle += `;margin:${marginY} auto`;
            }
            figure.setAttribute('style', figureStyle + `;text-align:${params.align}`);
          } else {
            figure.setAttribute('style', figureStyle);
          }
        }
        (img as HTMLElement).setAttribute('style', imgStyle);

        img.parentNode?.insertBefore(figure, img);
        figure.appendChild(img);

        const showTriangle = r.getPreset().caption?.showTriangle;
        const useTriangle = imageDeco ? imageDeco.params.captionTriangle === 'triangle' : showTriangle;
        const displayText = useTriangle ? `▲ ${captionSource}` : captionSource;
        const caption = createEl('figcaption');
        const captionStyle = imageDeco ? buildCaptionStyle(imageDeco.params) : '';
        caption.setAttribute('style', captionStyle || r.getStyle('figcaption'));
        caption.textContent = displayText;
        figure.parentNode?.insertBefore(caption, figure.nextSibling);
      } else {
        // No caption — keep image inline, no frame
        if (!imageDeco && params.align) {
          imgStyle += ';display:block';
          if (params.align === 'left') {
            imgStyle += `;margin:${marginY} auto ${marginY} 0`;
          } else if (params.align === 'right') {
            imgStyle += `;margin:${marginY} 0 ${marginY} auto`;
          } else {
            imgStyle += `;margin:${marginY} auto`;
          }
        }
        (img as HTMLElement).setAttribute('style', imgStyle);
      }

      // A slide overrides the standalone layout: the full article width, so the
      // picture owns the frame and the container's scroll-snap can settle on it.
      if (sliderSlides.has(img)) {
        (img as HTMLElement).setAttribute(
          'style',
          toImageSliderSlide(imgStyle, marginY),
        );
      }
    });

    // Wrap the runs collected above now that every slide carries its style.
    // Each carousel gets a one-line hint under it: WeChat runs no script, so a
    // live position read-out is impossible, but the count and the gesture can be
    // stated — and on a desktop that line is the only thing that announces the
    // row continues (a mouse wheel does not advance it).
    for (const run of sliderRuns) {
      wrapImageSlider(run, buildImageSliderStyle(marginY), buildImageSliderHint(r.getTokens().textMuted, run.length));
    }

    // Tables — wrap in scrollable section for overflow when wider than article
    doc.querySelectorAll('table').forEach((table) => {
      const wrapper = createEl('section');
      wrapper.setAttribute('style', r.getStyle('table-wrapper'));
      table.parentNode?.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    });

    // Tables — new decoration pipeline when tableConfig is present, otherwise
    // fall back to the v3 slot path (+ zebra striping via DOM).
    if (!renderTables(doc, r)) {
      doc.querySelectorAll('table').forEach((table) => {
        (table as HTMLElement).setAttribute('style', r.getStyle('table'));
      });
      doc.querySelectorAll('th').forEach((el) => (el as HTMLElement).setAttribute('style', r.getStyle('th')));
      doc.querySelectorAll('td').forEach((el) => (el as HTMLElement).setAttribute('style', r.getStyle('td')));

      // Zebra striping — apply alternating row background via DOM (nth-child not
      // supported in WeChat inline styles), using modifier config accentBg token.
      const tableConfig = r.getPreset().modifierConfig?.['blocks.table'];
      if (tableConfig?.striped === 'striped') {
        const zebraBg = r.resolveAccentBg();
        doc.querySelectorAll('table').forEach((table) => {
          const rows = table.querySelectorAll('tbody tr');
          rows.forEach((row, idx) => {
            if (idx % 2 === 0) return;
            row.querySelectorAll('td').forEach((td) => {
              const cur = (td as HTMLElement).getAttribute('style') || '';
              (td as HTMLElement).setAttribute('style', cur + `;background-color:${zebraBg}`);
            });
          });
        });
      }
    }

    // Tables — responsive width + cell wrap policy. Runs for BOTH paths above
    // and is applied last so a decoration cannot re-break the layout: the table
    // is sized to its content (narrow tables centre, wide ones scroll) and only
    // short headers / first-column labels are kept on one line.
    applyTableLayout(doc);

    // Block math — new decoration pipeline when mathConfig is present; inline
    // math belongs to the inline decoration system (legacy media.math slots
    // were removed). MathJax SVG uses currentColor + ex units, so the wrapper's
    // color / font-size / background / borders scale and style the formula.
    const mathDeco = hasMathConfig(r) ? resolveMathDecorationStyle(r) : null;
    // Vertical spacing: one theme-level value (`media.math.marginY`) drives both
    // sides. Without it the math decoration's own marginY stands.
    const mathMarginY = blockMarginY(r.getPreset(), 'math');
    doc.querySelectorAll('svg.wewrite-math').forEach((svg) => {
      // Block math is wrapped in a <section> by math-processor; inline math is
      // wrapped in a <span>. `closest('section')` is WRONG here — callouts are
      // also <section> elements, so inline math inside a callout would be
      // misclassified as block math.
      const isBlock = svg.parentElement?.tagName === 'SECTION';
      if (!isBlock) return;
      const parent = svg.parentElement;
      if (!parent) return;
      // Only override the wrapper when an actual decoration resolved.
      // With decoration 'none'/missing, resolveMathDecorationStyle returns
      // params:{} and buildMathStyle({}) would emit bare `display:block`,
      // wiping the wrapper's centering + vertical margins.
      if (mathDeco?.decoration) {
        parent.setAttribute('style', buildMathStyle(expandMathTokens(mathDeco.params, r.getTokens())));
      }
      if (mathMarginY) appendStyleDecl(parent, `margin-top:${mathMarginY};margin-bottom:${mathMarginY}`);
    });

    // Excalidraw inline containers (editor preview / plugin SVG output).
    if (hasExcalidrawConfig(r)) {
      const excalDeco = resolveExcalidrawDecorationStyle(r);
      const excalParams = expandExcalidrawTokens(excalDeco.params, r.getTokens());
      // Theme-level spacing wins over the decoration's own marginTop when set.
      const excalMarginY = blockMarginY(r.getPreset(), 'excalidraw');
      doc.querySelectorAll('.excalidraw, [class*="excalidraw"]').forEach((el) => {
        (el as HTMLElement).setAttribute('style', buildExcalidrawContainerStyle(excalParams));
        if (excalMarginY) appendStyleDecl(el, `margin-top:${excalMarginY};margin-bottom:${excalMarginY}`);
      });
    }

    // Bold, italic — apply base styles first, then <li>-specific overrides
    if (!inlineHandled) {
      doc.querySelectorAll('strong, b').forEach((el) => (el as HTMLElement).setAttribute('style', r.getStyle('strong')));
      doc.querySelectorAll('em, i').forEach((el) => (el as HTMLElement).setAttribute('style', r.getStyle('em')));
    }

    // Lists — structural WeChat-compatibility steps only (p unwrap /
    // stabilization). Appearance is owned by the three independent list
    // decoration pipelines below; nested hierarchy is preserved.
    const listLh = r.getPreset().lineHeight;

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

      const wrapper = createSpan();
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
    forceInlineInsideLists(doc);

    // Ordered / unordered lists — two independent template pipelines. Nested
    // structure is kept; each level gains margin-left in the renderers.
    // Without a list config the renderers return false — fall back to the
    // legacy getStyle() path (themes without ordered/unorderedListConfig used
    // to ship with raw browser list styling).
    if (!renderOrderedLists(doc, r)) {
      doc.querySelectorAll('ol:not(.contains-task-list)').forEach((el) => {
        (el as HTMLElement).setAttribute('style', r.getStyle('ol'));
      });
      doc.querySelectorAll('ol:not(.contains-task-list) > li').forEach((el) => {
        (el as HTMLElement).setAttribute('style', r.getStyle('li'));
      });
    }
    if (!renderUnorderedLists(doc, r)) {
      doc.querySelectorAll('ul:not(.contains-task-list)').forEach((el) => {
        (el as HTMLElement).setAttribute('style', r.getStyle('ul'));
      });
      doc.querySelectorAll('ul:not(.contains-task-list) > li').forEach((el) => {
        (el as HTMLElement).setAttribute('style', r.getStyle('li'));
      });
    }

    // List decoration templates re-parse {item} via innerHTML — re-assert
    // inline math so text+formula in list items survive WeChat paste.
    forceInlineInsideLists(doc);

    // Horizontal rules — new template pipeline when dividerConfig is present,
    // otherwise fall back to the v3 slot / legacy divider style path.
    if (!renderDividers(doc, r)) {
      doc.querySelectorAll('hr').forEach((el) => (el as HTMLElement).setAttribute('style', r.getStyle('hr')));
    }

    // Callout sections — per-type decoration pipeline. Legacy blocks.callout.*
    // themes are migrated onto the new system by the theme loader; the
    // renderer enforces default vertical margins for every path.
    renderCallouts(doc, r);

    // Replace <div> with <section> for WeChat compatibility
    doc.querySelectorAll('div').forEach((div) => {
      const section = createEl('section');
      for (const attr of div.attributes) {
        section.setAttribute(attr.name, attr.value);
      }
      setTrustedHtml(section, div.innerHTML);
      div.parentNode?.replaceChild(section, div);
    });

    // Mermaid SVGs: apply the resolved palette + shape params first (rewrites
    // the :root CSS variables), then inline every <style> rule as inline style
    // attributes before <style> blocks are stripped. var(--x) references are
    // resolved to literal values during inlining so colors survive WeChat.
    const mermaidStyle = r.resolveMermaidStyle();
    doc.querySelectorAll('svg').forEach((svg) => {
      if (isMermaidSvg(svg)) applyMermaidSvgStyle(svg, mermaidStyle);
      inlineMermaidSvgStyles(svg);
    });

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
      el.setAttribute('style', ARTICLE_INLINE_STYLE.iconWrapper);

      // SVG: fill wrapper, match .obsidian-icon.react-icon > svg
      const cur = svg.getAttribute('style') || '';
      svg.setAttribute('style',
        cur + ';width:100%;height:auto;vertical-align:middle;margin-bottom:3px');

      svg.setAttribute('data-wewrite-no-prescan', '');
    });

    // Code blocks — LAST, because it is the pass that removes the <pre>: both
    // inline-element passes above recognise block code as `code` inside a
    // `pre`, so unwrapping it earlier would hand the block to them and the code
    // would come out wearing the inline-chip style.
    //
    // The box is a zero-padding container (background/radius/shadow/clipping);
    // the body <section> owns the padding, so a title bar inserted above it sits
    // flush against the box's top/left/right edges instead of being inset by
    // code padding.
    //
    // The body is a <section>, NOT a <pre>. A <pre> host made the editor treat
    // the block as preformatted content and normalize the whitespace *inside*
    // it (`&nbsp;` indentation came back as plain spaces). Separately, the
    // editor rewrites the white-space *value* `pre` to `pre-wrap` on whatever
    // element carries it — that part is element-independent and is handled by
    // emitting `nowrap` instead (see getCodeBlockBodyStyle). See
    // docs/bug-fix/2026-09-22-codeblock-autowrap.md.
    doc.querySelectorAll('pre').forEach((el) => {
      // Mermaid diagrams are not code blocks: Obsidian wraps the SVG in
      // <pre class="mermaid">. Keep them transparent and unwrapped so the
      // diagram colors come from the Mermaid themer, not the code theme.
      // The theme's `media.mermaid.marginY` supplies their vertical spacing.
      const isMermaidPre = (el.classList?.contains('mermaid') ?? false) || el.querySelector('svg') !== null;
      if (isMermaidPre) {
        el.setAttribute('style', ARTICLE_INLINE_STYLE.mermaidPre +
          `;margin:${resolveBlockMarginY(r.getPreset(), 'mermaid', DEFAULT_BLOCK_MARGIN_Y)} 0`);
        return;
      }
      // Language is read before the <pre> is discarded — WeChat's sanitizer
      // strips class attributes, so it cannot be recovered later.
      const codeEl = el.querySelector('code');
      const language = codeEl ? getCodeLanguageFromClassList(Array.from(codeEl.classList)) : null;

      const box = createEl('section');
      box.setAttribute('style', r.getCodeBlockBoxStyle());

      // Title bar — Mac-style dots + right-aligned language label
      const titleBarHtml = r.buildCodeTitleBarHtml(language);
      if (titleBarHtml) {
        const prependEl = createSpan();
        setTrustedHtml(prependEl, titleBarHtml);
        box.appendChild(prependEl);
      }

      // Code body — carries the typography, padding and scroll behavior the
      // <pre> used to own. Any inline style the host (Obsidian or a plugin) put
      // on the <pre> is carried over first, so the theme still wins.
      const body = createEl('section');
      const preStyle = (el.getAttribute('style') || '').trim();
      const codeStyle = r.getCodeBlockBodyStyle();
      body.setAttribute('style', preStyle ? `${preStyle};${codeStyle};margin:0` : `${codeStyle};margin:0`);
      if (codeEl) body.appendChild(codeEl);
      else while (el.firstChild) body.appendChild(el.firstChild);
      box.appendChild(body);

      el.parentNode?.insertBefore(box, el);
      el.remove();
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
