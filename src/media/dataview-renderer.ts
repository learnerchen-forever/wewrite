// dataview-renderer.ts — Render Dataview queries for WeChat publishing
//
// Dataview output is NOT an image (unlike Mermaid): the plugin renders a
// query into a live HTML structure (task lists, lists, tables, paragraphs,
// or arbitrary dataviewjs output). Before the main markdown render pass we
// execute each query through the installed Dataview plugin, extract the
// rendered TEXT content and convert the HTML back into markdown, so the
// article's own rendering pipeline (theme list / table / task-list / callout
// renderers) styles it exactly like handwritten markdown:
//
//   - ```dataview  /  ```dataviewjs  block queries → converted to markdown
//     (task list `- [ ] item`, bullet `- item`, numbered `1. item`, tables,
//     paragraphs). A block nested in a blockquote/callout keeps its `> `
//     prefix so it renders inside the callout with the theme's callout style.
//   - Inline `$= ...` expressions → replaced with the evaluated plain text
//     (markdown-escaped).
//
// When the Dataview plugin is missing or a query fails to render, the block
// is left untouched: Pass 1 then renders it the way Obsidian would (plain
// code block, or live plugin output when the plugin is present).

import { MarkdownRenderer, Component, type App } from 'obsidian';
import { createLogger } from '../utils/logger';
import type { DataviewProcessResult } from '../utils/render-logger';

const log = createLogger('Media:DataviewRenderer');

export interface DataviewBlock {
  type: 'dataview' | 'dataviewjs' | 'inline';
  /** Query source (without the ``` fence, the `$=` prefix or `> ` prefixes). */
  code: string;
  /** Exact markdown text to replace (fence block or `$= ...` to EOL). */
  fullMatch: string;
  /** Character offset of fullMatch in the source markdown. */
  offset: number;
  /** Blockquote prefix of the opening fence line (e.g. '> ' or '> > '). */
  prefix?: string;
}

const DATAVIEW_PLUGIN_ID = 'dataview';

/** Whether the Dataview community plugin is installed and enabled. */
export function isDataviewPluginAvailable(app: App): boolean {
  const plugins = (app as unknown as { plugins?: { plugins?: Record<string, unknown> } }).plugins?.plugins;
  return !!plugins && !!plugins[DATAVIEW_PLUGIN_ID];
}

/** Strip the blockquote prefix ('> ', '> > ', ...) from every code line. */
function stripBlockquotePrefix(code: string, prefix: string): string {
  if (!prefix) return code;
  return code.split('\n').map((line) => (line.startsWith(prefix) ? line.slice(prefix.length) : line)).join('\n');
}

/** Prefix every line of a markdown block so it stays inside a blockquote. */
export function addBlockquotePrefix(markdown: string, prefix: string | undefined): string {
  if (!prefix) return markdown;
  return markdown.split('\n').map((line) => (line ? prefix + line : prefix.trimEnd())).join('\n');
}

/**
 * Extract Dataview queries from markdown:
 *  - fenced ```dataview / ```dataviewjs blocks (also inside callouts —
 *    the `> ` blockquote prefix is captured and stripped from the query);
 *  - inline `$= ...` expressions (everything from `$=` to end of line),
 *    ignoring `$=` inside fenced code blocks and inline code spans.
 */
export function extractDataviewBlocks(markdown: string): DataviewBlock[] {
  const blocks: DataviewBlock[] = [];

  const fenceRx = /^((?:> ?)*)```(dataviewjs|dataview)([^\n]*)\n([\s\S]*?)```/gm;
  let m: RegExpExecArray | null;
  while ((m = fenceRx.exec(markdown)) !== null) {
    const prefix = m[1] || '';
    // `[^\n]*` captures a query written on the opening fence line
    // (e.g. ```dataview LIST FROM "x"); the block body follows the newline.
    const code = `${m[3]}\n${stripBlockquotePrefix(m[4], prefix)}`.trim();
    if (!code) continue;
    blocks.push({
      type: m[2] as 'dataview' | 'dataviewjs',
      code,
      fullMatch: m[0],
      offset: m.index,
      prefix: prefix || undefined,
    });
  }

  // Inline `$=` — mask fenced blocks (any language) and inline code spans
  // first so `$=` inside code is not mistaken for a dataview expression.
  // The mask preserves offsets (same-length spaces), so indices stay valid.
  const masked = markdown
    .replace(/```[\s\S]*?```/g, (s) => ' '.repeat(s.length))
    .replace(/`[^`\n]*`/g, (s) => ' '.repeat(s.length));
  const inlineRx = /\$=[^\n]*/g;
  let im: RegExpExecArray | null;
  while ((im = inlineRx.exec(masked)) !== null) {
    const code = im[0].slice(2).trim();
    if (!code) continue;
    blocks.push({ type: 'inline', code, fullMatch: im[0], offset: im.index });
  }

  blocks.sort((a, b) => a.offset - b.offset);
  return blocks;
}

/** Escape markdown-significant characters so a dataview inline value renders
 *  as literal text inside Pass 1's MarkdownRenderer. */
export function escapeMarkdownText(text: string): string {
  return text.replace(/([\\`*_{}[\]()#+\-.!<>|~^])/g, '\\$1');
}

// ── Rendering ──

const RENDER_TIMEOUT_MS = 10000;

/** Build the markdown snippet that triggers the Dataview post-processor. */
function snippetFor(block: DataviewBlock): string {
  if (block.type === 'inline') return `\n\n$= ${block.code}\n\n`;
  return '```' + block.type + '\n' + block.code + '\n```';
}

/** Render a dataview snippet in a hidden container via Obsidian's
 *  MarkdownRenderer (the plugin's code-block / inline post-processors fire
 *  against it), then wait for the plugin output. Returns the output element,
 *  or null when nothing was produced (plugin missing / query failed). */
async function renderSnippet(
  block: DataviewBlock,
  app: App,
  sourcePath: string,
): Promise<HTMLElement | null> {
  if (!isDataviewPluginAvailable(app)) return null;

  // Same hidden-container technique as diagram-renderer: opacity:0.01 keeps
  // the element in WebKit's render tree so async post-processors fire.
  const wrapper = document.createElement('div');
  wrapper.className = 'markdown-reading-view';
  wrapper.style.cssText = 'position:fixed;left:0;top:0;width:1024px;opacity:0.01;pointer-events:none;z-index:-1';

  const renderEl = document.createElement('div');
  renderEl.className = 'markdown-preview-section';
  wrapper.appendChild(renderEl);
  document.body.appendChild(wrapper);

  const comp = new Component();
  comp.load();

  try {
    await MarkdownRenderer.render(app, snippetFor(block), renderEl, sourcePath, comp);
    return await waitForDataviewOutput(wrapper, block, RENDER_TIMEOUT_MS);
  } catch (err) {
    log.warn('dataview render failed', { err: String(err), codePreview: block.code.slice(0, 80) });
    return null;
  } finally {
    comp.unload();
    document.body.removeChild(wrapper);
  }
}

/** Poll the container until the Dataview plugin has replaced the query with
 *  rendered output. Detection:
 *   1. a `.dataview` element (table / list / task / calendar output);
 *   2. the code block `<pre>` still present but now holding child elements
 *      (dataviewjs output lives inside the pre);
 *   3. the `<pre>` replaced entirely (dataviewjs may swap it for its output);
 *   4. for inline queries, the `$= ...` text disappeared from the container
 *      (the plugin replaced it with the evaluated value). */
async function waitForDataviewOutput(
  container: HTMLElement,
  block: DataviewBlock,
  timeoutMs: number,
): Promise<HTMLElement | null> {
  const start = Date.now();
  const originalText = block.type === 'inline' ? `$= ${block.code}` : block.code;
  const sizedChild = (el: HTMLElement): HTMLElement | null => {
    const found = Array.from(el.children).find((c) => {
      const child = c as HTMLElement;
      return child.offsetWidth > 0 || child.offsetHeight > 0 || !!child.textContent?.trim();
    });
    return (found as HTMLElement | undefined) ?? null;
  };
  while (Date.now() - start < timeoutMs) {
    const dv = container.querySelector<HTMLElement>('.dataview');
    if (dv && dv.textContent) return dv;

    const pre = container.querySelector<HTMLElement>('pre');
    if (block.type !== 'inline') {
      if (pre) {
        // dataviewjs / dataview output is appended inside the pre element.
        const child = sizedChild(pre);
        if (child) return child;
        // Plain-text output (dv.paragraph) — pre content changed.
        const text = (pre.textContent || '').trim();
        if (text && text !== block.code.trim() && !text.includes(originalText)) {
          return pre;
        }
      } else {
        // The plugin replaced the <pre> entirely (dataviewjs) — the container
        // now holds real output.
        const text = (container.textContent || '').trim();
        if (text && text !== block.code.trim()) {
          return sizedChild(container) ?? container;
        }
      }
    }

    if (block.type === 'inline') {
      const text = (container.textContent || '').trim();
      // The evaluated value replaced the "$= ..." expression.
      if (text && !text.includes('$=')) {
        return container;
      }
    }

    await new Promise((r) => window.setTimeout(r, 150));
  }
  log.warn('dataview render: timed out waiting for plugin output', { codePreview: block.code.slice(0, 80) });
  return null;
}

/**
 * Render a ```dataview / ```dataviewjs block query and convert its rendered
 * output to markdown. Returns the markdown, or null when the plugin is
 * missing / render failed (caller then leaves the block untouched).
 */
export async function renderDataviewBlockToMarkdown(
  block: DataviewBlock,
  app: App,
  sourcePath: string,
): Promise<string | null> {
  if (block.type === 'inline') return null;
  const output = await renderSnippet(block, app, sourcePath);
  if (!output) return null;
  const markdown = convertDataviewOutput(output).trim();
  return markdown || null;
}

/**
 * Render an inline `$= ...` expression and return its evaluated plain text,
 * or null when the plugin is missing / render failed.
 */
export async function renderDataviewInlineText(
  block: DataviewBlock,
  app: App,
  sourcePath: string,
): Promise<string | null> {
  if (block.type !== 'inline') return null;
  const output = await renderSnippet(block, app, sourcePath);
  if (!output) return null;
  const text = (output.textContent || '').trim();
  return text || null;
}

/**
 * Pre-process a markdown document: render every Dataview query (block +
 * inline) through the plugin and replace it with the converted markdown /
 * evaluated text. `onProgress` is called with (current, total) before each
 * query so callers can drive a spinner. Returns the new markdown plus a
 * per-query result list for the render log.
 */
export async function preprocessDataviewInMarkdown(
  markdown: string,
  app: App,
  sourcePath: string,
  onProgress?: (current: number, total: number) => void,
): Promise<{ markdown: string; results: DataviewProcessResult[] }> {
  const blocks = extractDataviewBlocks(markdown);
  const results: DataviewProcessResult[] = [];
  let out = markdown;
  const total = blocks.length;
  let idx = 0;
  for (const block of blocks) {
    idx++;
    onProgress?.(idx, total);
    try {
      if (block.type === 'inline') {
        const text = await renderDataviewInlineText(block, app, sourcePath);
        if (text !== null) {
          out = out.split(block.fullMatch).join(escapeMarkdownText(text));
          results.push({ type: 'inline', success: true, text: text.slice(0, 120) });
          log.debug('Dataview: inline query evaluated', { code: block.code.slice(0, 60), text: text.slice(0, 60) });
        } else {
          results.push({ type: 'inline', success: false, error: 'inline render returned null' });
        }
        continue;
      }
      const rendered = await renderDataviewBlockToMarkdown(block, app, sourcePath);
      if (rendered !== null) {
        out = out.split(block.fullMatch).join(addBlockquotePrefix(rendered, block.prefix));
        results.push({ type: block.type, success: true, text: rendered.slice(0, 120) });
        log.debug('Dataview: converted to markdown', { code: block.code.slice(0, 60) });
      } else {
        results.push({ type: block.type, success: false, error: 'renderDataviewBlockToMarkdown returned null' });
      }
    } catch (err) {
      results.push({ type: block.type, success: false, error: String(err) });
      log.warn('Dataview pre-process: render failed', { err: String(err) });
    }
  }
  return { markdown: out, results };
}

// ── Rendered HTML → markdown ──
//
// The plugin output is live HTML (task lists / lists / tables / paragraphs /
// arbitrary dataviewjs DOM). Convert the structure back to markdown so the
// article's own renderers (theme list / task-list / table / callout) style
// it exactly like handwritten markdown.

/** Convert a rendered Dataview output element to markdown. */
export function convertDataviewOutput(root: Element): string {
  const blocks: Element[] = [];
  if (isStructuralBlock(root)) {
    blocks.push(root);
  } else {
    collectTopLevelBlocks(root, blocks);
  }
  if (blocks.length === 0) {
    return (root.textContent || '').trim();
  }
  return blocks
    .map((b) => blockToMarkdown(b))
    .filter((s) => s.trim())
    .join('\n\n');
}

function isStructuralBlock(el: Element): boolean {
  const tag = el.tagName;
  if (tag === 'UL' || tag === 'OL' || tag === 'TABLE' || tag === 'P' || tag === 'BLOCKQUOTE') return true;
  return tag.length === 2 && tag.startsWith('H') && tag[1] >= '1' && tag[1] <= '6';
}

/** Collect top-level structural blocks, unwrapping non-structural wrappers
 *  (div.dataview-container etc.) so nested lists are not converted twice. */
function collectTopLevelBlocks(el: Element, out: Element[]): void {
  for (const child of Array.from(el.children)) {
    if (isStructuralBlock(child)) {
      out.push(child);
    } else if (child.children.length > 0) {
      collectTopLevelBlocks(child, out);
    }
  }
}

function blockToMarkdown(el: Element): string {
  const tag = el.tagName;
  if (tag === 'UL' || tag === 'OL') return listToMarkdown(el, 0);
  if (tag === 'TABLE') return tableToMarkdown(el);
  if (tag === 'P') return inlineContent(el).trim();
  if (tag === 'BLOCKQUOTE') {
    const inner = convertDataviewOutput(el);
    return inner.split('\n').map((l) => (l ? '> ' + l : '>')).join('\n');
  }
  if (tag.length === 2 && tag.startsWith('H') && tag[1] >= '1' && tag[1] <= '6') {
    return `${'#'.repeat(Number(tag[1]))} ${inlineContent(el).trim()}`;
  }
  return inlineContent(el).trim();
}

function listToMarkdown(el: Element, depth: number): string {
  const ordered = el.tagName === 'OL';
  const isTask = el.classList.contains('contains-task-list');
  const indent = '  '.repeat(depth);
  const items = Array.from(el.children).filter((c) => c.tagName === 'LI');
  return items
    .map((li, i) => {
      const checkbox = li.querySelector(':scope > input[type="checkbox"]');
      const checked = checkbox
        ? checkbox.hasAttribute('checked') || checkbox.getAttribute('data-task') === 'x' || li.getAttribute('data-task') === 'x'
        : false;
      const marker = isTask
        ? (checked ? '- [x] ' : '- [ ] ')
        : (ordered ? `${i + 1}. ` : '- ');
      let line = indent + marker + inlineContent(li).trim();
      const nested = Array.from(li.children).filter((c) => c.tagName === 'UL' || c.tagName === 'OL');
      for (const n of nested) {
        line += '\n' + listToMarkdown(n, depth + 1);
      }
      return line;
    })
    .join('\n');
}

function tableToMarkdown(table: Element): string {
  const headerCells: string[] = [];
  const rows: string[][] = [];
  table.querySelectorAll('tr').forEach((tr) => {
    const cells = Array.from(tr.children)
      .filter((c) => c.tagName === 'TD' || c.tagName === 'TH')
      .map((c) => inlineContent(c).replace(/\|/g, '\\|').replace(/\n/g, ' ').trim());
    if (headerCells.length === 0 && (tr.parentElement?.tagName === 'THEAD' || tr.querySelector('th'))) {
      headerCells.push(...cells);
    } else {
      rows.push(cells);
    }
  });
  if (headerCells.length === 0) {
    if (rows.length === 0) return '';
    headerCells.push(...rows[0]);
    rows.shift();
  }
  const lines = [
    `| ${headerCells.join(' | ')} |`,
    `| ${headerCells.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.join(' | ')} |`),
  ];
  return lines.join('\n');
}

/** Convert inline content (text + emphasis / code / links / images). */
function inlineContent(el: Element): string {
  // DOM node-type constants (avoid depending on a global `Node` so the pure
  // converter stays testable in non-browser environments).
  const TEXT_NODE = 3;
  const ELEMENT_NODE = 1;
  let out = '';
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === TEXT_NODE) {
      out += child.textContent || '';
    } else if (child.nodeType === ELEMENT_NODE) {
      const c = child as Element;
      const tag = c.tagName.toLowerCase();
      switch (tag) {
        case 'br': out += '\n'; break;
        case 'strong': case 'b': out += '**' + inlineContent(c) + '**'; break;
        case 'em': case 'i': out += '*' + inlineContent(c) + '*'; break;
        case 'del': case 's': case 'strike': out += '~~' + inlineContent(c) + '~~'; break;
        case 'code': out += '`' + (c.textContent || '') + '`'; break;
        case 'a': {
          const href = c.getAttribute('href') || '';
          const label = inlineContent(c).trim() || href;
          out += href ? `[${label}](${href})` : label;
          break;
        }
        case 'img': {
          const src = c.getAttribute('src') || '';
          const alt = c.getAttribute('alt') || '';
          out += src ? `![${alt}](${src})` : (alt || '');
          break;
        }
        case 'input': break; // task checkbox — handled by the list converter
        case 'ul': case 'ol': break; // nested lists — handled by listToMarkdown
        case 'span': case 'div': case 'section': case 'p': case 'mark': case 'small': case 'sub': case 'sup':
          out += inlineContent(c);
          break;
        default: out += c.textContent || '';
      }
    }
  }
  return out;
}
