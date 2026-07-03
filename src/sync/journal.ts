// SyncJournal — append-only operation log for diagnostics and rollback

import type { SyncEntry } from './types';

export interface JournalEntry {
  id: string;
  timestamp: number;
  deviceId: string;
  operation: string;
  localPath: string;
  remotePath: string;
  details?: string;
  /** Snapshot of the SyncEntry BEFORE this operation. Enables rollback. */
  beforeSnapshot?: SyncEntry;
}

const MAX_ENTRIES = 100;

export function appendJournal(
  entries: JournalEntry[],
  entry: JournalEntry,
): JournalEntry[] {
  const updated = [entry, ...entries];
  if (updated.length > MAX_ENTRIES) {
    updated.length = MAX_ENTRIES;
  }
  return updated;
}

export function loadJournal(raw: unknown): JournalEntry[] {
  if (Array.isArray(raw)) {
    return (raw as JournalEntry[]).filter(
      (e) => typeof e.id === 'string' && typeof e.timestamp === 'number',
    );
  }
  return [];
}

export function formatJournalEntry(entry: JournalEntry): string {
  const time = new Date(entry.timestamp).toLocaleString();
  return `${time}  ${entry.operation}  ${entry.localPath}`;
}
