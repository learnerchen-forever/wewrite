import type { App } from 'obsidian';
import { createLogger } from './logger';
import { formatTimestamp } from './timestamp';

const log = createLogger('RenderLogger');

export interface SvgProcessResult {
  source: string;
  tier: string;
  byteLength: number;
  action: 'inline' | 'convert';
  result: string;
}

export interface ImageProcessResult {
  source: string;
  resolution?: string;
  action: string;
  result: string;
}

export interface MermaidProcessResult {
  success: boolean;
  cachedPath?: string;
  error?: string;
  sizeKB?: string;
  skipCanvas?: boolean;
}

export interface ExcalidrawProcessResult {
  link: string;
  success: boolean;
  /** Actual render path used (not guessed from skipDiagrams flag) */
  path: 'SVG→canvas' | 'auto-PNG' | 'plugin' | 'none';
  cachedPath?: string;
  error?: string;
  sizeKB?: string;
  /** Resolved vault path of the source .excalidraw file */
  sourcePath?: string;
  /** Time taken in ms for this diagram */
  durationMs?: number;
  /** True if render was attempted with skipCanvas (iOS < 17) */
  skipCanvas?: boolean;
}

export interface SvgInlineResult {
  path: string;
  success: boolean;
  reason?: string;
}

export interface RenderLogParams {
  noteName: string;
  articleType: 'news' | 'newspic';
  renderTimeMs: number;
  svgResults: SvgProcessResult[];
  imageResults: ImageProcessResult[];
  mermaidResults: MermaidProcessResult[];
  excalidrawResults: ExcalidrawProcessResult[];
  svgInlineResults: SvgInlineResult[];
  imageCount: number;
  svgCount: number;
  finalByteLength: number;
  limitsOk: boolean;
  warnings: string[];
  renderedHtml?: string;
}

export class RenderLogger {
  private app: App;
  private dumpDir: string;

  constructor(app: App, dumpDir: string) {
    this.app = app;
    this.dumpDir = dumpDir;
  }

  async logRender(params: RenderLogParams): Promise<void> {
    await this.ensureDir();

    const ts = formatTimestamp(new Date());
    const suffix = params.articleType === 'newspic' ? 'newspic-render-log' : 'news-render-log';
    const filePath = `${this.dumpDir}/${params.noteName}-${suffix}-${ts}.md`;

    const lines: string[] = [];
    lines.push('---');
    lines.push('wewrite-dump-note: true');
    lines.push(`render-time: ${ts}`);
    lines.push('---');
    lines.push('');
    lines.push('# 渲染日志 (Render Log)');
    lines.push('');
    lines.push('## 基本信息 (Overview)');
    lines.push('');
    lines.push('| Field | Value |');
    lines.push('| --- | --- |');
    lines.push(`| note | ${params.noteName} |`);
    lines.push(`| article_type | ${params.articleType} |`);
    lines.push(`| render_time_ms | ${params.renderTimeMs} |`);
    lines.push(`| image_count | ${params.imageCount} |`);
    lines.push(`| svg_count | ${params.svgCount} |`);
    lines.push('');

    // ── Mermaid ──
    lines.push('## Mermaid 图表 (Mermaid Diagrams)');
    lines.push('');
    if (params.mermaidResults.length > 0) {
      lines.push('| # | Success | Size | Cached Path | Error |');
      lines.push('| --- | --- | --- | --- | --- |');
      params.mermaidResults.forEach((r, i) => {
        const status = r.success ? 'OK' : 'FAIL';
        const size = r.sizeKB ? `${r.sizeKB} KB` : '-';
        const cached = r.cachedPath ? `\`${r.cachedPath}\`` : '-';
        const err = r.error || '-';
        lines.push(`| ${i + 1} | ${status} | ${size} | ${cached} | ${err} |`);
      });
    } else {
      lines.push('(no Mermaid diagrams in content)');
    }
    lines.push('');

    // ── Excalidraw ──
    lines.push('## Excalidraw 图表 (Excalidraw Diagrams)');
    lines.push('');
    if (params.excalidrawResults.length > 0) {
      lines.push('| # | Link | Path | Success | Size | Duration | SkipCanvas | Source | Cached Path | Error |');
      lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
      params.excalidrawResults.forEach((r, i) => {
        const status = r.success ? 'OK' : 'FAIL';
        const size = r.sizeKB ? `${r.sizeKB} KB` : '-';
        const dur = r.durationMs ? `${r.durationMs}ms` : '-';
        const skipCanvas = r.skipCanvas ? 'Y' : '-';
        const source = r.sourcePath ? `\`${r.sourcePath}\`` : '-';
        const cached = r.cachedPath ? `\`${r.cachedPath}\`` : '-';
        const err = r.error || '-';
        lines.push(`| ${i + 1} | ${r.link} | ${r.path} | ${status} | ${size} | ${dur} | ${skipCanvas} | ${source} | ${cached} | ${err} |`);
      });
    } else {
      lines.push('(no Excalidraw embeds in content)');
    }
    lines.push('');

    // ── SVG inline ──
    lines.push('## SVG 内联 (SVG Inline Processing)');
    lines.push('');
    if (params.svgInlineResults.length > 0) {
      lines.push('| # | Path | Success | Reason |');
      lines.push('| --- | --- | --- | --- |');
      params.svgInlineResults.forEach((r, i) => {
        const status = r.success ? 'OK' : 'FAIL';
        const reason = r.reason || '-';
        lines.push(`| ${i + 1} | \`${r.path}\` | ${status} | ${reason} |`);
      });
    } else {
      lines.push('(no SVG images found)');
    }
    lines.push('');

    // ── SVG fallback ──
    lines.push('## SVG 回退 (SVG Fallback / PNG Conversion)');
    lines.push('');
    if (params.svgResults.length > 0) {
      lines.push('| # | Source | Tier | ByteLength | Action | Result |');
      lines.push('| --- | --- | --- | --- | --- | --- |');
      params.svgResults.forEach((r, i) => {
        const kb = (r.byteLength / 1024).toFixed(1);
        lines.push(`| ${i + 1} | ${r.source} | ${r.tier} | ${kb} KB | ${r.action} | ${r.result} |`);
      });
    } else {
      lines.push('(no SVGs required fallback PNG conversion)');
    }
    lines.push('');

    // ── Image processing ──
    lines.push('## 图片处理 (Image Processing)');
    lines.push('');
    if (params.imageResults.length > 0) {
      lines.push('| # | Source | Resolution | Action | Result |');
      lines.push('| --- | --- | --- | --- | --- |');
      params.imageResults.forEach((r, i) => {
        lines.push(`| ${i + 1} | ${r.source} | ${r.resolution || '-'} | ${r.action} | ${r.result} |`);
      });
    } else {
      lines.push('(no images processed in fallback stage)');
    }
    lines.push('');

    // ── Content length ──
    lines.push('## 内容长度 (Content Size)');
    lines.push('');
    const kb = (params.finalByteLength / 1024).toFixed(1);
    lines.push(`- 最终长度 (Final): ${params.finalByteLength} bytes (${kb} KB)`);
    lines.push(`- 状态 (Status): ${params.limitsOk ? 'OK (within limit)' : '⚠ EXCEEDS LIMIT'}`);
    lines.push('');

    // ── Rendered HTML ──
    if (params.renderedHtml) {
      lines.push('## 渲染后 HTML (Rendered HTML)');
      lines.push('');
      lines.push('```html');
      lines.push(params.renderedHtml);
      lines.push('```');
      lines.push('');
    }

    // ── Warnings ──
    lines.push('## 警告 (Warnings)');
    lines.push('');
    if (params.warnings.length > 0) {
      for (const w of params.warnings) {
        lines.push(`- ⚠ ${w}`);
      }
    } else {
      lines.push('(none)');
    }
    lines.push('');

    const content = lines.join('\n');
    await this.app.vault.create(filePath, content);
    log.info('render log saved', { path: filePath });
  }

  private async ensureDir(): Promise<void> {
    const existing = this.app.vault.getAbstractFileByPath(this.dumpDir);
    if (existing) return;
    const parts = this.dumpDir.split('/');
    let current = '';
    for (const part of parts) {
      if (!part) continue;
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) {
        await this.app.vault.createFolder(current);
      }
    }
  }


}
