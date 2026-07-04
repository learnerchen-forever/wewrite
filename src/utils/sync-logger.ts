// Sync debug logger — writes structured .md logs to {wewrite}/debug when syncLogDebug is enabled

import type { App } from 'obsidian';
import { getWeWriteSubPath, WEWRITE_SUBDIRS } from '../core/interfaces';
import { ensureUniqueName } from './dump-naming';

function localTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

// ── Log Types ──

export interface SyncLogCycleSummary {
  trigger: 'startup' | 'interval' | 'manual';
  startedAt: number;
  completedAt: number;
  durationMs: number;
  localFiles: number;
  remoteFiles: number;
  recordEntries: number;
  tasks: { push: number; pull: number; merge: number; mkdirRemote: number; removeRemote: number; removeLocal: number };
  conflicts: number;
  errors: string[];
  aborted: boolean;
  abortReason?: string;
}

export interface SyncLogFileEntry {
  path: string;
  action: string;
  caseNumber: number;
  reason: string;
}

export interface SyncLogErrorEntry {
  path: string;
  taskKind: string;
  message: string;
  retryCount: number;
}

// ── Write Functions ──

/** Write a partial log at sync start so interrupted cycles still leave a trace. */
export async function writeSyncCycleStart(
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
  const filePath = await ensureUniqueName(app, debugDir, `sync-${ts}.md`);

  const lines: string[] = [];
  lines.push('---');
  lines.push('wewrite-sync-log: true');
  lines.push(`sync-time: ${new Date(startedAt).toISOString()}`);
  lines.push(`sync-trigger: ${trigger}`);
  lines.push('sync-status: STARTED');
  lines.push('---');
  lines.push('');
  lines.push('# Sync Cycle Log');
  lines.push('');
  lines.push('| Field | Value |');
  lines.push('| --- | --- |');
  lines.push(`| Trigger | ${trigger} |`);
  lines.push(`| Started | ${new Date(startedAt).toISOString()} |`);
  lines.push(`| Status | **RUNNING** |`);

  await app.vault.create(filePath, lines.join('\n'));
  return filePath;
}

/** Finalize the log file with the full cycle summary. */
export async function finalizeSyncCycleLog(
  app: App,
  filePath: string,
  summary: SyncLogCycleSummary,
  files?: SyncLogFileEntry[],
  errors?: SyncLogErrorEntry[],
): Promise<void> {
  const appendLines = buildCompletionLines(summary, files, errors);

  // Read existing content, append completion section
  const existing = await app.vault.adapter.read(filePath);
  const updated = existing + '\n' + appendLines.join('\n');
  await app.vault.adapter.write(filePath, updated);
}

function buildCompletionLines(
  summary: SyncLogCycleSummary,
  files?: SyncLogFileEntry[],
  errors?: SyncLogErrorEntry[],
): string[] {
  const lines: string[] = [];

  // Update frontmatter (replace sync-status: STARTED → COMPLETED / ABORTED)
  // Done via vault.adapter.write above; frontmatter line is embedded in existing content.
  // For simplicity, we write the completion section after the existing content.

  lines.push('');
  lines.push('---');
  lines.push('');

  // Summary
  lines.push('## Completion');
  lines.push('');
  lines.push('| Field | Value |');
  lines.push('| --- | --- |');
  lines.push(`| Completed | ${new Date(summary.completedAt).toISOString()} |`);
  lines.push(`| Duration | ${summary.durationMs}ms |`);
  lines.push(`| Local files walked | ${summary.localFiles} |`);
  lines.push(`| Remote files walked | ${summary.remoteFiles} |`);
  lines.push(`| Record entries | ${summary.recordEntries} |`);
  lines.push(`| Status | ${summary.aborted ? 'ABORTED' : summary.errors.length > 0 ? 'COMPLETED WITH ERRORS' : 'SUCCESS'} |`);
  if (summary.abortReason) {
    lines.push(`| Abort reason | ${summary.abortReason} |`);
  }
  lines.push('');

  // Task breakdown
  lines.push('## Tasks');
  lines.push('');
  lines.push('| Type | Count |');
  lines.push('| --- | --- |');
  lines.push(`| Push (upload) | ${summary.tasks.push} |`);
  lines.push(`| Pull (download) | ${summary.tasks.pull} |`);
  lines.push(`| Merge (auto) | ${summary.tasks.merge} |`);
  lines.push(`| Mkdir remote | ${summary.tasks.mkdirRemote} |`);
  lines.push(`| Remove remote | ${summary.tasks.removeRemote} |`);
  lines.push(`| Remove local | ${summary.tasks.removeLocal} |`);
  lines.push(`| Conflicts | ${summary.conflicts} |`);
  lines.push('');

  // Per-file decisions
  if (files && files.length > 0) {
    lines.push('## File Decisions');
    lines.push('');
    lines.push('| Path | Action | Case | Reason |');
    lines.push('| --- | --- | --- | --- |');
    for (const f of files) {
      lines.push(`| ${f.path} | ${f.action} | ${f.caseNumber} | ${f.reason} |`);
    }
    lines.push('');
  }

  // Errors
  if (errors && errors.length > 0) {
    lines.push('## Errors');
    lines.push('');
    lines.push('| Path | Task | Error | Retries |');
    lines.push('| --- | --- | --- | --- |');
    for (const e of errors) {
      lines.push(`| ${e.path} | ${e.taskKind} | ${e.message.replace(/\|/g, '\\|')} | ${e.retryCount} |`);
    }
    lines.push('');
  }

  // Footer
  lines.push('---');
  lines.push(`*Generated by WeWrite Sync at ${new Date().toISOString()}*`);

  return lines;
}
