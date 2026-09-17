// AI call logger — writes structured .md logs to {wewrite}/debug when logAICalling is enabled

import type { App } from 'obsidian';
import { getWeWriteSubPath, WEWRITE_SUBDIRS } from '../core/interfaces';
import { ensureUniqueName } from './dump-naming';
import { ensureFolderExists } from './vault-helpers';

function localTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

export interface AICallLog {
  callType: 'image-gen' | 'text-gen';
  zoneKey?: string;
  zoneLabel?: string;
  model: string;
  providerUrl: string;
  statusCode: number;
  error: string | null;
  durationMs: number;
  prompt: string;
  requestBody?: unknown;
  resultSummary?: string;
}

export async function writeAICallLog(
  app: App,
  wewriteFolder: string,
  log: AICallLog,
): Promise<void> {
  const dumpDir = getWeWriteSubPath(wewriteFolder, WEWRITE_SUBDIRS.debug);
  await ensureFolderExists(app, dumpDir);

  const ts = localTimestamp();
  const zoneSuffix = log.zoneKey ? `-${log.zoneKey}` : '';
  const baseName = `ai-call-${log.callType}${zoneSuffix}-${ts}`;
  const filePath = await ensureUniqueName(app, dumpDir, `${baseName}.md`);

  const lines = buildLogLines(log);
  await app.vault.create(filePath, lines.join('\n'));
}

function buildLogLines(log: AICallLog): string[] {
  const lines: string[] = [];
  lines.push('---');
  lines.push('wewrite-ai-log: true');
  lines.push(`call-time: ${new Date().toISOString()}`);
  lines.push(`call-type: ${log.callType}`);
  if (log.zoneKey) lines.push(`zone: ${log.zoneKey}`);
  lines.push('---');
  lines.push('');
  const title = log.callType === 'image-gen' ? 'AI Image Generation' : 'AI Text Generation';
  lines.push(`# ${title} Log${log.zoneLabel ? ` — ${log.zoneLabel}` : ''}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Field | Value |');
  lines.push('| --- | --- |');
  lines.push(`| Provider URL | ${log.providerUrl} |`);
  lines.push(`| Status | ${log.error ? 'FAILED' : 'SUCCESS'} |`);
  lines.push(`| HTTP Status | ${log.statusCode} |`);
  lines.push(`| Duration | ${log.durationMs}ms |`);
  if (log.error) lines.push(`| Error | ${String(log.error).replace(/\|/g, '\\|')} |`);
  lines.push('');

  // HTTP-dump style code block
  lines.push('## API Call');
  lines.push('');
  lines.push('```http');
  lines.push(`${log.requestBody ? 'POST' : 'GET'} ${log.providerUrl}`);
  lines.push('Content-Type: application/json');
  lines.push('Authorization: Bearer ***');
  if (log.requestBody) {
    lines.push('');
    lines.push(JSON.stringify(log.requestBody, null, 2));
  }
  lines.push('---');
  lines.push(`HTTP ${log.statusCode}${log.error ? ' — ' + log.error : ''}`);
  if (log.resultSummary) {
    lines.push('');
    lines.push(log.resultSummary);
  }
  lines.push('```');
  return lines;
}

// ── Progressive logger for multi-step async image generation ──

export interface APICallEntry {
  step: string;
  method: string;
  url: string;
  statusCode: number;
  durationMs: number;
  requestBody?: unknown;
  responseBody?: unknown;
  error?: string;
}

/**
 * 生成期间的 flush 合并窗口。
 *
 * 轮询每 1.5–4 秒就来一次，如果每次都把「全部历史 entry」重新拼成整份 Markdown
 * 再覆盖写盘，就等于把诊断代码放进了请求关键路径：一次生成要写 30+ 次文件，
 * 每次 `await`，还会顺带触发宿主文件监听与同步引擎；移动端慢 FS 上尤其明显。
 */
const FLUSH_DEBOUNCE_MS = 600;

export class AIImageGenLogger {
  private entries: APICallEntry[] = [];
  private filePath!: string;
  private timer: number | null = null;
  /** 写入串行链：合并窗口触发与终态落盘不会互相覆盖。 */
  private writeChain: Promise<void> = Promise.resolve();

  constructor(
    private app: App,
    private wewriteFolder: string,
    private zoneKey: string,
    private zoneLabel: string,
    private model: string,
    private providerUrl: string,
    private size: string,
    private prompt: string,
    private startTime: number,
  ) {}

  async init(): Promise<void> {
    const dumpDir = getWeWriteSubPath(this.wewriteFolder, WEWRITE_SUBDIRS.debug);
    // `{wewriteFolder}/debug` is nested, and a single `createFolder` on a
    // nested path has a known mobile quirk — same reason the cache dir is
    // built level by level.
    await ensureFolderExists(this.app, dumpDir);

    const ts = localTimestamp();
    const baseName = `ai-call-image-gen-${this.zoneKey}-${ts}`;
    this.filePath = await ensureUniqueName(this.app, dumpDir, `${baseName}.md`);

    // 首屏必须真的落盘（用户可能就是来看这份新建的日志），所以走强制通道。
    await this.flushFinal();
  }

  addEntry(entry: APICallEntry): void {
    this.entries.push(entry);
  }

  /**
   * 排一次落盘并**立刻返回** —— 调用方（HTTP 层）可以照旧 `await`，代价为零。
   * 短时间内的多次调用合并成一次写入。
   */
  flush(): Promise<void> {
    if (this.timer === null) {
      this.timer = window.setTimeout(() => {
        this.timer = null;
        void this.writeNow();
      }, FLUSH_DEBOUNCE_MS);
    }
    return Promise.resolve();
  }

  /** 终态落盘：取消待执行的合并窗口，写完再返回（生成成功/失败时调用）。 */
  async flushFinal(): Promise<void> {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    await this.writeNow();
  }

  private async writeNow(): Promise<void> {
    if (!this.filePath) return;
    // 先把当前快照渲染出来，再排进串行链；并发触发时后者覆盖前者，正是所需语义。
    const content = this.buildContent();
    const path = this.filePath;
    this.writeChain = this.writeChain.then(async () => {
      try {
        const exists = await this.app.vault.adapter.exists(path);
        if (exists) {
          await this.app.vault.adapter.write(path, content);
        } else {
          await this.app.vault.create(path, content);
        }
      } catch { /* best-effort */ }
    });
    await this.writeChain;
  }

  private buildContent(): string {
    const elapsed = Date.now() - this.startTime;
    const lines: string[] = [];

    lines.push('---');
    lines.push('wewrite-ai-log: true');
    lines.push(`call-time: ${new Date().toISOString()}`);
    lines.push(`call-type: image-gen`);
    lines.push(`zone: ${this.zoneKey}`);
    lines.push('---');
    lines.push('');
    lines.push(`# AI Image Generation Log — ${this.zoneLabel}`);
    lines.push('');
    lines.push('## Parameters');
    lines.push('');
    lines.push('| Field | Value |');
    lines.push('| --- | --- |');
    lines.push(`| Zone | ${this.zoneKey} (${this.zoneLabel}) |`);
    lines.push(`| Model | ${this.model} |`);
    lines.push(`| Provider URL | ${this.providerUrl} |`);
    lines.push(`| Size | ${this.size} |`);
    lines.push(`| Elapsed | ${elapsed}ms |`);
    lines.push('');
    lines.push('## Prompt');
    lines.push('');
    lines.push('```');
    lines.push(this.prompt);
    lines.push('```');
    lines.push('');

    // HTTP-dump style entries: one code block per API call
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      lines.push(`## API Call ${i + 1} — ${entry.step}`);
      lines.push('');
      lines.push('```http');
      lines.push(`${entry.method} ${entry.url}`);
      if (entry.requestBody !== undefined) {
        lines.push('Content-Type: application/json');
      }
      lines.push(`Authorization: Bearer ***`);
      if (entry.requestBody !== undefined) {
        lines.push('');
        lines.push(JSON.stringify(entry.requestBody, null, 2));
      }
      lines.push('---');
      if (entry.error) {
        lines.push(`ERROR — HTTP ${entry.statusCode} (${entry.durationMs}ms)`);
        if (entry.responseBody !== undefined) {
          lines.push('');
          lines.push(JSON.stringify(entry.responseBody, null, 2));
        }
        lines.push('');
        lines.push(`Error: ${entry.error.replace(/\|/g, '\\|')}`);
      } else {
        lines.push(`HTTP ${entry.statusCode} (${entry.durationMs}ms)`);
        if (entry.responseBody !== undefined) {
          lines.push('');
          lines.push(JSON.stringify(entry.responseBody, null, 2));
        }
      }
      lines.push('```');
      lines.push('');
    }

    // Final status
    const lastEntry = this.entries[this.entries.length - 1];
    const finalError = lastEntry?.error;

    lines.push('## Result');
    lines.push('');
    lines.push('| Field | Value |');
    lines.push('| --- | --- |');
    lines.push(`| Final Status | ${finalError ? 'FAILED' : 'SUCCESS'} |`);
    lines.push(`| Total API Calls | ${this.entries.length} |`);
    lines.push(`| Total Duration | ${elapsed}ms |`);
    if (finalError) {
      lines.push(`| Last Error | ${finalError.replace(/\|/g, '\\|').replace(/\n/g, '\\n')} |`);
    }
    lines.push('');

    return lines.join('\n');
  }
}
