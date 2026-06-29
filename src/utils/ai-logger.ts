// AI call logger — writes structured .md logs to {wewrite}/debug when logAICalling is enabled

import type { App } from 'obsidian';
import { getWeWriteSubPath, WEWRITE_SUBDIRS } from '../core/interfaces';
import { ensureUniqueName } from './dump-naming';

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

  if (!(await app.vault.adapter.exists(dumpDir))) {
    await app.vault.createFolder(dumpDir);
  }

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

export class AIImageGenLogger {
  private entries: APICallEntry[] = [];
  private filePath!: string;

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
    if (!(await this.app.vault.adapter.exists(dumpDir))) {
      await this.app.vault.createFolder(dumpDir);
    }

    const ts = localTimestamp();
    const baseName = `ai-call-image-gen-${this.zoneKey}-${ts}`;
    this.filePath = await ensureUniqueName(this.app, dumpDir, `${baseName}.md`);

    await this.flush();
  }

  addEntry(entry: APICallEntry): void {
    this.entries.push(entry);
  }

  async flush(): Promise<void> {
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

    try {
      const exists = await this.app.vault.adapter.exists(this.filePath);
      if (exists) {
        await this.app.vault.adapter.write(this.filePath, lines.join('\n'));
      } else {
        await this.app.vault.create(this.filePath, lines.join('\n'));
      }
    } catch { /* best-effort */ }
  }
}
