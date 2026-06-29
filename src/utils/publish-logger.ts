// src/utils/publish-logger.ts

import type { App } from 'obsidian';
import { formatTimestamp } from './timestamp';
import { createLogger } from './logger';

const log = createLogger('PublishLogger');

export interface ImageRefEntry {
  index: number;
  renderedUrl: string;
  markdownSource: string;
}

export interface ImageActionEntry {
  index: number;
  renderedUrl: string;
  action: string;
  localPath: string;
}

export class PublishLogBuilder {
  private imageRefs: ImageRefEntry[] = [];
  private imageActions: ImageActionEntry[] = [];
  private imageLogs: Map<number, string[]> = new Map();
  private draftLines: string[] = [];
  private apiParams: Record<string, unknown> | null = null;
  private contentByteLength: number = 0;
  private imageUrls: string[] = [];
  private svgContent: string[] = [];
  private finalContentHtml: string = '';
  private publishResult: { success: boolean; httpStatus?: number; responseBody: Record<string, unknown>; errorMessage?: string } | null = null;

  constructor(
    private app: App,
    private debugDir: string,
    private noteName: string,
    private articleType: 'news' | 'newspic',
    private accountName: string,
  ) {}

  addImageRef(entry: ImageRefEntry): void {
    this.imageRefs.push(entry);
  }

  addImageAction(entry: ImageActionEntry): void {
    this.imageActions.push(entry);
  }

  appendImageLog(index: number, line: string): void {
    const lines = this.imageLogs.get(index);
    if (lines) {
      lines.push(line);
    } else {
      this.imageLogs.set(index, [line]);
    }
  }

  appendDraftLog(line: string): void {
    this.draftLines.push(line);
  }

  setApiParams(params: Record<string, unknown>): void { this.apiParams = params; }
  setContentByteLength(len: number): void { this.contentByteLength = len; }
  setImageUrls(urls: string[]): void { this.imageUrls = urls; }
  setSvgContent(svgs: string[]): void { this.svgContent = svgs; }
  setFinalContentHtml(html: string): void { this.finalContentHtml = html; }
  setPublishResult(result: { success: boolean; httpStatus?: number; responseBody: Record<string, unknown>; errorMessage?: string }): void {
    this.publishResult = result;
  }

  async flush(success: boolean, errorMessage?: string): Promise<void> {
    try {
      await this.ensureDir();
      const ts = formatTimestamp(new Date());
      const suffix = this.articleType === 'newspic'
        ? 'newspic-publish-log'
        : 'news-publish-log';
      const filePath = `${this.debugDir}/${this.noteName}-${suffix}-${ts}.md`;

      const lines: string[] = [];
      lines.push('---');
      lines.push('wewrite-publish-log: true');
      lines.push(`publish-time: ${ts}`);
      lines.push(`note: ${this.noteName}`);
      lines.push(`article-type: ${this.articleType}`);
      lines.push(`account: ${this.accountName}`);
      lines.push('---');
      lines.push('');

      // Publish Parameters
      if (this.apiParams) {
        lines.push('# 发布参数 (Publish Parameters)');
        lines.push('');
        lines.push('| Parameter | Value |');
        lines.push('| --- | --- |');
        for (const [key, value] of Object.entries(this.apiParams)) {
          const displayValue = value === undefined || value === null ? '' :
            typeof value === 'object' ? JSON.stringify(value).replace(/\|/g, '\\|') :
            String(value).replace(/\|/g, '\\|').replace(/\n/g, '\\n');
          lines.push(`| ${key} | ${displayValue} |`);
        }
        lines.push('');
      }

      // Content Size
      if (this.contentByteLength > 0) {
        const kb = (this.contentByteLength / 1024).toFixed(1);
        lines.push('# 内容长度 (Content Size)');
        lines.push('');
        lines.push(`${this.contentByteLength} bytes (${kb} KB)`);
        lines.push('');
      }

      // Image List
      lines.push('# 图片列表 (Image List)');
      lines.push('');
      if (this.imageUrls.length > 0) {
        for (const url of this.imageUrls) {
          lines.push(`- ${url}`);
        }
      } else {
        lines.push('(0 items)');
      }
      lines.push('');

      // Section: File Uploading
      lines.push('# 文件上传 (File Uploading)');
      lines.push('');

      // Part 1: Image Reference Table
      lines.push('## 图片引用 (Image References)');
      lines.push('');
      if (this.imageRefs.length > 0) {
        lines.push('| # | Rendered URL | Source in Markdown |');
        lines.push('| --- | --- | --- |');
        for (const ref of this.imageRefs) {
          const url = ref.renderedUrl.length > 80
            ? ref.renderedUrl.slice(0, 80) + '...'
            : ref.renderedUrl;
          lines.push(`| ${ref.index} | ${this.escapePipe(url)} | ${this.escapePipe(ref.markdownSource)} |`);
        }
      } else {
        lines.push('(no images)');
      }
      lines.push('');

      // Part 2: Classification / Action Table
      lines.push('## 分类结果 (Classification)');
      lines.push('');
      if (this.imageActions.length > 0) {
        lines.push('| # | Rendered URL | Action | Local Image Path |');
        lines.push('| --- | --- | --- | --- |');
        for (const act of this.imageActions) {
          const url = act.renderedUrl.length > 80
            ? act.renderedUrl.slice(0, 80) + '...'
            : act.renderedUrl;
          lines.push(`| ${act.index} | ${this.escapePipe(url)} | ${act.action} | \`${act.localPath || '-'}\` |`);
        }
      } else {
        lines.push('(no actions recorded)');
      }
      lines.push('');

      // Part 3: Per-Image Detailed Logs
      lines.push('## 详细日志 (Detailed Logs)');
      lines.push('');
      if (this.imageLogs.size > 0) {
        for (const [idx, logLines] of this.imageLogs) {
          const ref = this.imageRefs.find(r => r.index === idx);
          const url = ref?.renderedUrl || `Image ${idx}`;
          const displayUrl = url.length > 100 ? url.slice(0, 100) + '...' : url;
          lines.push(`### ${idx}. [${displayUrl}]`);
          lines.push('');
          for (const line of logLines) {
            lines.push(`- ${line}`);
          }
          lines.push('');
        }
      } else {
        lines.push('(no detailed logs)');
      }
      lines.push('');

      // Section: Draft Creation
      lines.push('# 草稿创建 (Draft Creation)');
      lines.push('');
      if (this.draftLines.length > 0) {
        for (const line of this.draftLines) {
          lines.push(`- ${line}`);
        }
      } else {
        lines.push('(no draft log entries)');
      }
      lines.push('');

      // Published Content (final HTML after all uploads)
      if (this.finalContentHtml) {
        lines.push('# 发布内容 (Published Content)');
        lines.push('');
        lines.push('```html');
        lines.push(this.finalContentHtml);
        lines.push('```');
        lines.push('');
      }

      // Publish Result (API response)
      if (this.publishResult) {
        lines.push('# 发布结果 (Publish Result)');
        lines.push('');
        const resultData: Record<string, unknown> = { ...this.publishResult.responseBody };
        resultData.success = this.publishResult.success;
        if (this.publishResult.httpStatus !== undefined) resultData.http_status = this.publishResult.httpStatus;
        if (this.publishResult.errorMessage) resultData.error_message = this.publishResult.errorMessage;
        lines.push('| Field | Value |');
        lines.push('| --- | --- |');
        for (const [key, value] of Object.entries(resultData)) {
          const displayValue = value === undefined || value === null ? '' :
            typeof value === 'object' ? JSON.stringify(value).replace(/\|/g, '\\|') :
            String(value).replace(/\|/g, '\\|').replace(/\n/g, '\\n');
          lines.push(`| ${key} | ${displayValue} |`);
        }
        lines.push('');
      }

      // Section: Result
      lines.push('# 结果 (Result)');
      lines.push('');
      if (success) {
        lines.push('**Status:** Success');
      } else {
        lines.push('**Status:** Failed');
        if (errorMessage) {
          lines.push('');
          lines.push(`**Error:** ${errorMessage}`);
        }
      }
      lines.push('');

      const content = lines.join('\n');
      await this.app.vault.create(filePath, content);
      log.info('publish log written', { path: filePath, success });
    } catch (err) {
      log.warn('failed to write publish log', { err: String(err) });
    }
  }

  private escapePipe(s: string): string {
    return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
  }

  private async ensureDir(): Promise<void> {
    const existing = this.app.vault.getAbstractFileByPath(this.debugDir);
    if (existing) return;
    const parts = this.debugDir.split('/');
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
