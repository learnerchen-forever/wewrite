// Sync debug logger — writes structured .md logs to {wewrite}/debug when syncLogDebug is enabled.
// Log is written incrementally as the sync cycle progresses so interrupted cycles leave a trace.

import type { App } from 'obsidian';
import type { DecisionDetail } from '../sync/types';
import { getWeWriteSubPath, WEWRITE_SUBDIRS } from '../core/interfaces';
import { ensureUniqueName } from './dump-naming';

function localTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '_' + pad(d.getHours()) + '-' + pad(d.getMinutes()) + '-' + pad(d.getSeconds());
}

function timeStr(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return ms + 'ms';
  return (ms / 1000).toFixed(1) + 's';
}

// ── Types ──

export interface SyncActionLog {
  index: number;
  timestamp: number;
  path: string;
  kind: string;
  sizeBytes: number;
  durationMs: number;
  result: string;
  message: string;
  /** HTTP status code from the server response (if an error occurred). */
  httpStatus?: number;
}

export interface SyncChangesData {
  localFiles: number;
  localSkipped: number;
  remoteFiles: number;
  remoteSkipped: number;
  recordEntries: number;
}

export interface SyncScheduledData {
  totalTasks: number;
  push: number;
  pull: number;
  merge: number;
  mkdirRemote: number;
  mkdirLocal: number;
  removeRemote: number;
  removeLocal: number;
  conflicts: number;
  concurrency: number;
  batchDelayMs: number;
  walkDelayMs: number;
  /** Rate limiter configuration */
  rateLimiterTokenCapacity?: number;
  rateLimiterTokenPeriodMin?: number;
  minIntervalMs?: number;
  serverProvider?: string;
}

export interface SyncResultData {
  trigger: string;
  startedAt: number;
  completedAt: number;
  totalActions: number;
  succeeded: number;
  failed: number;
  conflicts: number;
  aborted: boolean;
  abortReason?: string;
  /** Final rate limiter state at end of sync cycle. */
  rateLimiterFinalState?: {
    tokensRemaining: number;
    bucketLevel: number;
  };
}

// ── Internal helpers ──

async function readLog(app: App, filePath: string): Promise<string> {
  return app.vault.adapter.read(filePath);
}

async function writeLog(app: App, filePath: string, content: string): Promise<void> {
  await app.vault.adapter.write(filePath, content);
}

async function appendToLog(app: App, filePath: string, lines: string[]): Promise<void> {
  const existing = await readLog(app, filePath);
  await writeLog(app, filePath, existing + lines.join('\n') + '\n');
}

// ── Public API ──

export async function createSyncLog(
  app: App,
  wewriteFolder: string,
  trigger: string,
  startedAt: number,
): Promise<string> {
  const debugDir = getWeWriteSubPath(wewriteFolder, WEWRITE_SUBDIRS.debug);
  if (!(await app.vault.adapter.exists(debugDir))) {
    await app.vault.createFolder(debugDir);
  }

  const ts = localTimestamp();
  const filePath = await ensureUniqueName(app, debugDir, 'sync-' + ts + '.md');

  const lines: string[] = [];
  lines.push('---');
  lines.push('wewrite-sync-log: true');
  lines.push('sync-time: ' + new Date(startedAt).toISOString());
  lines.push('sync-trigger: ' + trigger);
  lines.push('---');
  lines.push('');
  lines.push('# Sync Cycle Log');
  lines.push('');
  lines.push('**Trigger:** ' + trigger);
  lines.push('**Started:** ' + new Date(startedAt).toISOString());
  lines.push('');

  lines.push('## Changes');
  lines.push('');
  lines.push('*Awaiting walk...*');
  lines.push('');

  lines.push('## Decision Detail');
  lines.push('');
  lines.push('*Awaiting decision...*');
  lines.push('');

  lines.push('## Scheduled');
  lines.push('');
  lines.push('*Awaiting scheduled...*');
  lines.push('');

  lines.push('## Sync Action Detail');
  lines.push('');

  lines.push('## Sync Result');
  lines.push('');
  lines.push('*Awaiting completion...*');
  lines.push('');

  await app.vault.create(filePath, lines.join('\n'));
  return filePath;
}

export async function appendChangesSection(
  app: App,
  filePath: string,
  data: SyncChangesData,
): Promise<void> {
  const lines: string[] = [];
  lines.push('| Source | Files walked | Skipped |');
  lines.push('| --- | --- | --- |');
  lines.push('| Local | ' + data.localFiles + ' | ' + data.localSkipped + ' |');
  lines.push('| Remote | ' + data.remoteFiles + ' | ' + data.remoteSkipped + ' |');
  lines.push('| Record entries | ' + data.recordEntries + ' | — |');
  lines.push('');

  const content = await readLog(app, filePath);
  const updated = content.replace(/\*Awaiting walk\.\.\.\*/, lines.join('\n'));
  await writeLog(app, filePath, updated);
}

export async function appendDecisionDetailSection(
  app: App,
  filePath: string,
  details: DecisionDetail[],
): Promise<void> {
  if (details.length === 0) return;

  const lines: string[] = [];
  lines.push('| Path | Action | Reason | L-mtime | R-mtime | L-hash | R-hash | Rec-L-hash | Rec-R-hash | ⚠Fmt |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');

  for (const d of details) {
    const fmt = d.remoteHashFormatMismatch ? '**YES**' : '—';
    lines.push(
      '| ' + d.path +
      ' | ' + d.action +
      ' | ' + d.reason +
      ' | ' + (d.localMtime || '—') +
      ' | ' + (d.remoteMtime || '—') +
      ' | `' + d.localHashShort + '`' +
      ' | `' + d.remoteHashShort + '`' +
      ' | `' + d.recordLocalHashShort + '`' +
      ' | `' + d.recordRemoteHashShort + '`' +
      ' | ' + fmt + ' |'
    );
  }
  lines.push('');

  const existing = await readLog(app, filePath);
  const updated = existing.replace(/\*Awaiting decision\.\.\.\*/, lines.join('\n'));
  await writeLog(app, filePath, updated);
}

export async function appendScheduledSection(
  app: App,
  filePath: string,
  data: SyncScheduledData,
): Promise<void> {
  const lines: string[] = [];
  lines.push('| Plan | Value |');
  lines.push('| --- | --- |');
  lines.push('| Total tasks | ' + data.totalTasks + ' |');
  if (data.push > 0) lines.push('| Push (upload) | ' + data.push + ' |');
  if (data.pull > 0) lines.push('| Pull (download) | ' + data.pull + ' |');
  if (data.merge > 0) lines.push('| Merge | ' + data.merge + ' |');
  if (data.mkdirRemote > 0) lines.push('| Mkdir remote | ' + data.mkdirRemote + ' |');
  if (data.removeRemote > 0) lines.push('| Remove remote | ' + data.removeRemote + ' |');
  if (data.mkdirLocal > 0) lines.push('| Mkdir local | ' + data.mkdirLocal + ' |');
  if (data.removeLocal > 0) lines.push('| Remove local | ' + data.removeLocal + ' |');
  if (data.conflicts > 0) lines.push('| Conflicts | ' + data.conflicts + ' |');
  lines.push('| Concurrency | ' + data.concurrency + ' |');
  lines.push('| Min request interval | ' + (data.minIntervalMs ?? data.batchDelayMs) + 'ms |');
  if (data.serverProvider) lines.push('| Server provider | ' + data.serverProvider + ' |');
  if (data.rateLimiterTokenCapacity) lines.push('| Rate limit tokens | ' + data.rateLimiterTokenCapacity + ' / ' + data.rateLimiterTokenPeriodMin + 'min |');
  lines.push('');

  const content = await readLog(app, filePath);
  const updated = content.replace(/\*Awaiting scheduled\.\.\.\*/, lines.join('\n'));
  await writeLog(app, filePath, updated);
}

let actionTableHeaderWritten = false;
export async function appendActionDetailRows(
  app: App,
  filePath: string,
  actions: SyncActionLog[],
): Promise<void> {
  if (actions.length === 0) return;

  const lines: string[] = [];

  if (!actionTableHeaderWritten) {
    lines.push('| # | Time | Path | Kind | Size | Duration | HTTP | Result | Message |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    actionTableHeaderWritten = true;
  }

  for (const a of actions) {
    const size = a.sizeBytes > 0 ? fmtSize(a.sizeBytes) : '—';
    const dur = fmtDuration(a.durationMs);
    const safeMsg = a.message ? a.message.replace(/\|/g, '\\|') : '';
    const httpCol = a.httpStatus ? String(a.httpStatus) : '—';
    lines.push('| ' + a.index + ' | ' + timeStr(a.timestamp) + ' | ' + a.path + ' | ' + a.kind + ' | ' + size + ' | ' + dur + ' | ' + httpCol + ' | ' + a.result + ' | ' + safeMsg + ' |');
  }

  // Insert action detail rows into the Sync Action Detail section,
  // before the Sync Result section. Don't just append to end of file.
  const existing = await readLog(app, filePath);
  const syncResultMarker = '\n## Sync Result\n';
  const idx = existing.indexOf(syncResultMarker);
  if (idx >= 0) {
    const before = existing.slice(0, idx);
    const after = existing.slice(idx);
    await writeLog(app, filePath, before + lines.join('\n') + '\n' + after);
  } else {
    // Fallback: append to end (shouldn't happen in normal flow)
    await writeLog(app, filePath, existing + lines.join('\n') + '\n');
  }
}

export async function finalizeSyncLog(
  app: App,
  filePath: string,
  data: SyncResultData,
): Promise<void> {
  const status = data.aborted
    ? 'ABORTED'
    : data.failed > 0
      ? 'COMPLETED WITH ERRORS'
      : 'SUCCESS';

  const lines: string[] = [];
  lines.push('| Field | Value |');
  lines.push('| --- | --- |');
  lines.push('| Trigger | ' + data.trigger + ' |');
  lines.push('| Started | ' + new Date(data.startedAt).toISOString() + ' |');
  lines.push('| Completed | ' + new Date(data.completedAt).toISOString() + ' |');
  lines.push('| Duration | ' + fmtDuration(data.completedAt - data.startedAt) + ' |');
  lines.push('| Total actions | ' + data.totalActions + ' |');
  lines.push('| Succeeded | ' + data.succeeded + ' |');
  lines.push('| Failed | ' + data.failed + ' |');
  if (data.conflicts > 0) lines.push('| Conflicts | ' + data.conflicts + ' |');
  if (data.rateLimiterFinalState) {
    lines.push('| RL tokens remaining | ' + data.rateLimiterFinalState.tokensRemaining + ' (' + data.rateLimiterFinalState.bucketLevel + '%) |');
  }
  lines.push('| Status | **' + status + '** |');
  if (data.abortReason) {
    lines.push('| Abort reason | ' + data.abortReason + ' |');
  }
  lines.push('');
  lines.push('---');
  lines.push('*Generated by WeWrite Sync at ' + new Date().toISOString() + '*');

  const content = await readLog(app, filePath);
  const updated = content.replace(/\*Awaiting completion\.\.\.\*/, lines.join('\n'));
  await writeLog(app, filePath, updated);

  actionTableHeaderWritten = false;
}
