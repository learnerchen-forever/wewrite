import type { App, TFile } from 'obsidian';
import { createLogger } from './logger';
import { formatHtml } from './html-formatter';
import { formatTimestamp } from './timestamp';

const log = createLogger('DumpService');

export interface DumpCreateParams {
  noteName: string;
  draftType: 'news' | 'newspic';
  apiParams: Record<string, unknown>;
  contentHtml: string;
  contentByteLength: number;
  imageUrls: string[];
  svgContent: string[];
}

export interface DumpResult {
  success: boolean;
  httpStatus?: number;
  responseBody: Record<string, unknown>;
  errorMessage?: string;
}

export class DumpService {
  private app: App;
  private dumpDir: string;

  constructor(app: App, dumpDir: string) {
    this.app = app;
    this.dumpDir = dumpDir;
  }

  private async ensureDir(): Promise<void> {
    return this.ensureDirAt(this.dumpDir);
  }

  private async ensureDirAt(dir: string): Promise<void> {
    const existing = this.app.vault.getAbstractFileByPath(dir);
    if (existing) return;
    const parts = dir.split('/');
    let current = '';
    for (const part of parts) {
      if (!part) continue;
      current = current ? `${current}/${part}` : part;
      const node = this.app.vault.getAbstractFileByPath(current);
      if (!node) {
        try {
          await this.app.vault.createFolder(current);
          log.info('created dump directory', { path: current });
        } catch (err) {
          // Folder may have been created by a concurrent operation
          if (!this.app.vault.getAbstractFileByPath(current)) {
            throw err;
          }
        }
      }
    }
  }

  async createDumpNote(params: DumpCreateParams): Promise<TFile> {
    await this.ensureDir();

    const ts = formatTimestamp(new Date());
    const suffix = params.draftType === 'newspic' ? 'newspic-publish' : 'news-publish';
    const filePath = `${this.dumpDir}/${params.noteName}-${suffix}-${ts}.md`;

    const localISO = ts;
    const formattedHtml = formatHtml(params.contentHtml);

    const lines: string[] = [];
    lines.push('---');
    lines.push('wewrite-dump-note: true');
    lines.push(`publish-time: ${localISO}`);
    lines.push('---');
    lines.push('');
    lines.push('# 发布参数');
    lines.push('');
    this.renderTable(lines, params.apiParams);
    lines.push('');
    lines.push('# 发布内容');
    lines.push('');
    lines.push('## 内容长度');
    lines.push('');
    const kb = (params.contentByteLength / 1024).toFixed(1);
    lines.push(`${params.contentByteLength} bytes (${kb} KB)`);
    lines.push('');
    lines.push('## 图片列表');
    lines.push('');
    if (params.imageUrls.length > 0) {
      for (const url of params.imageUrls) {
        lines.push(`- ${url}`);
      }
    } else {
      lines.push('(0 items)');
    }
    lines.push('');
    lines.push('## SVG 列表');
    lines.push('');
    if (params.svgContent.length > 0) {
      for (const svg of params.svgContent) {
        const preview = svg.length > 100 ? svg.slice(0, 100) + '...' : svg;
        lines.push(`- ${preview}`);
      }
    } else {
      lines.push('(0 items)');
    }
    lines.push('');
    lines.push('## 发布内容');
    lines.push('');
    lines.push('```html');
    lines.push(formattedHtml);
    lines.push('```');
    lines.push('');

    const content = lines.join('\n');
    log.info('dump note created', { path: filePath, byteLen: params.contentByteLength });
    return this.app.vault.create(filePath, content);
  }

  async appendResult(file: TFile, result: DumpResult): Promise<void> {
    const current = await this.app.vault.read(file);
    const lines: string[] = [];
    lines.push('# 发布结果');
    lines.push('');

    const resultData: Record<string, unknown> = { ...result.responseBody };
    resultData.success = result.success;
    if (result.httpStatus !== undefined) {
      resultData.http_status = result.httpStatus;
    }
    if (result.errorMessage) {
      resultData.error_message = result.errorMessage;
    }

    this.renderTable(lines, resultData);
    lines.push('');

    await this.app.vault.modify(file, current + '\n' + lines.join('\n'));
    log.info('dump result appended', { path: file.path, success: result.success });
  }

  async migrateDumpNotes(oldDir: string, newDir: string): Promise<{ moved: number; errors: string[] }> {
    const errors: string[] = [];
    let moved = 0;

    const oldFolder = this.app.vault.getAbstractFileByPath(oldDir);
    if (!oldFolder) return { moved, errors };

    await this.ensureDirAt(newDir);

    const files = this.app.vault.getFiles().filter((f) => f.path.startsWith(oldDir + '/'));
    for (const file of files) {
      try {
        const newPath = file.path.replace(oldDir, newDir);
        const conflict = this.app.vault.getAbstractFileByPath(newPath);
        if (conflict) await this.app.vault.delete(conflict);
        await this.app.vault.rename(file, newPath);
        moved++;
      } catch (err) {
        errors.push(`${file.name}: ${String(err)}`);
      }
    }

    log.info('dump notes migrated', { oldDir, newDir, moved, errorCount: errors.length });
    return { moved, errors };
  }

  private renderTable(lines: string[], data: Record<string, unknown>): void {
    lines.push('| Parameter | Value |');
    lines.push('| --- | --- |');
    for (const [key, value] of Object.entries(data)) {
      const displayValue = this.formatValue(value);
      lines.push(`| ${key} | ${displayValue} |`);
    }
  }

  private formatValue(value: unknown): string {
    if (value === undefined || value === null) return '';
    if (typeof value === 'object') {
      return JSON.stringify(value).replace(/\|/g, '\\|');
    }
    return String(value).replace(/\|/g, '\\|').replace(/\n/g, '\\n');
  }


}
