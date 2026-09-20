// Theme index — the shape of `themes/themes.json` and the rules for comparing
// a remote theme against the copy sitting in the user's vault.
//
// The published index used to carry nothing but `{ name, file }`, which is
// enough to download once and never enough to do anything afterwards: a
// download could only ever *create* missing files, so a theme that changed
// upstream was never picked up, and re-downloading to force an update renamed
// the old note and produced duplicates. Everything in this module exists to
// make "which of my themes differ from the published ones, and how" an
// answerable question.
//
// Index v2 adds three fields per entry:
//
//   updated       — the date the note's content last changed upstream
//   description   — one line describing the theme's character (zh)
//   descriptionEn — the same in English (optional; falls back to `description`)
//   hash          — content fingerprint (see `themeContentHash`)
//
// Old clients read only `name` and `file`, so the extra fields are additive and
// safe to publish before every user has updated.

import { fnv1a64HexUtf8 } from '../utils/fingerprint';
import type { ThemeFileState, ThemeSyncStateMap } from '../core/interfaces';

// The download baseline lives in the plugin settings (it is bookkeeping about
// this install), so its shape is defined next to the other persisted fields and
// only *used* here. Re-exported to keep the sync vocabulary in one import.
export type { ThemeFileState, ThemeSyncStateMap };

/** Fingerprint algorithm recorded in the index; only this one is understood. */
export const THEME_HASH_ALGORITHM = 'fnv1a64';

/** Index schema version this build writes and understands best. */
export const THEME_INDEX_SCHEMA = 2;

export interface RemoteThemeEntry {
  name: string;
  /** File name inside `themes/`, e.g. `001-晨曦蓝调.md`. */
  file: string;
  /** One-line description in Chinese (the authoring language of the notes). */
  description?: string;
  /** One-line description in English; falls back to `description`. */
  descriptionEn?: string;
  /** Date (YYYY-MM-DD) the note's content last changed upstream. */
  updated?: string;
  /** Content fingerprint, or undefined when the index carries none. */
  hash?: string;
}

export interface ThemeIndex {
  schema: number;
  /** When the published index last changed (not when it was last written). */
  generated?: string;
  hashAlgorithm?: string;
  themes: RemoteThemeEntry[];
}

/**
 * How a remote theme relates to the copy in the vault.
 *
 *   new       — not installed yet
 *   update    — installed untouched, upstream has newer content
 *   conflict  — both the upstream note and the local copy changed; downloading
 *               discards the local edits
 *   modified  — only the local copy changed (upstream is unchanged); there is
 *               nothing to fetch, but the official version can be restored
 *   current   — identical to the published note
 *   unknown   — the index carries no fingerprint, so nothing can be compared
 */
export type ThemeChangeKind = 'new' | 'update' | 'conflict' | 'modified' | 'current' | 'unknown';

export interface ThemeChange {
  entry: RemoteThemeEntry;
  kind: ThemeChangeKind;
  /** The note exists in the themes folder. */
  installed: boolean;
  /** Content hash of the local note (undefined when not installed). */
  localHash?: string;
  /** The index's hash for this theme, if any. */
  remoteHash?: string;
  /** Downloading this theme overwrites an existing note on disk. */
  overwrites: boolean;
  /** Pre-checked in the update dialog. */
  recommended: boolean;
  /**
   * True only when the local content demonstrably differs from what was
   * downloaded (a recorded baseline exists and does not match). False for
   * "differs, but we have no record of why" — the dialog must not claim an
   * edit it cannot prove.
   */
  localEdited: boolean;
}

// ── Content fingerprint ──

/**
 * Fingerprint of a theme note's content.
 *
 * Line endings are normalised and a leading BOM dropped before hashing. Both
 * sides of the comparison read the same logical file from different places —
 * a git checkout on Windows, a raw.githubusercontent response, Obsidian's
 * vault adapter — and those do not agree on CRLF, so hashing raw bytes would
 * report every single theme as "locally modified" on one platform or the
 * other. Normalising makes the fingerprint a property of the note, not of the
 * machine that happened to write it.
 */
export function themeContentHash(content: string): string {
  const normalized = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  return fnv1a64HexUtf8(normalized.replace(/\r\n?/g, '\n'));
}

// ── Index parsing ──

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function normalizeEntry(raw: unknown): RemoteThemeEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const file = asString(o.file);
  if (!file || !file.endsWith('.md')) return null;
  return {
    file,
    name: asString(o.name) ?? file.replace(/\.md$/, ''),
    description: asString(o.description),
    descriptionEn: asString(o.descriptionEn),
    updated: asString(o.updated),
    hash: asString(o.hash),
  };
}

/**
 * Parse a `themes.json` payload into a usable index, or null when it is not one.
 *
 * Tolerates a bare array (a proxy or a hand-written file may serve one) and
 * fingerprints written by an unknown algorithm — hashes are dropped in that
 * case, which downgrades every comparison to "unknown" instead of comparing
 * unrelated values and reporting imaginary edits.
 */
export function normalizeThemeIndex(raw: unknown): ThemeIndex | null {
  let payload: unknown = raw;

  // A bare array is accepted as the themes list itself.
  if (Array.isArray(payload)) payload = { themes: payload };
  if (!payload || typeof payload !== 'object') return null;

  const o = payload as Record<string, unknown>;
  const rawThemes = o.themes;
  if (!Array.isArray(rawThemes)) return null;

  const entries: RemoteThemeEntry[] = [];
  for (const item of rawThemes) {
    const entry = normalizeEntry(item);
    if (entry) entries.push(entry);
  }
  if (entries.length === 0) return null;

  // An index that declares no algorithm at all is still trusted for its hashes
  // (the only producer of this file is our own repository); one that declares a
  // *different* algorithm is not, because those values are not comparable.
  const algorithm = asString(o.hashAlgorithm);
  const hashesUsable = algorithm === undefined || algorithm === THEME_HASH_ALGORITHM;
  const themes = hashesUsable ? entries : entries.map((e) => ({ ...e, hash: undefined }));

  return {
    schema: typeof o.schema === 'number' ? o.schema : 1,
    generated: asString(o.generated),
    hashAlgorithm: algorithm,
    themes,
  };
}

/**
 * Identity of a published index: file names plus content hashes.
 *
 * Descriptions and dates are deliberately excluded — those can change without
 * anything to download, and this value decides whether the user is told there
 * is something to download. (A published index whose `generated` field no
 * longer matches the current one but whose themes are identical must not
 * produce a reminder.)
 */
export function themeIndexFingerprint(index: ThemeIndex): string {
  const lines = index.themes
    .map((e) => `${e.file}\u0000${e.name}\u0000${e.hash ?? ''}`)
    .sort();
  return fnv1a64HexUtf8(lines.join('\u0001'));
}

// ── Comparison ──

export interface LocalThemeFacts {
  /** The note exists in the themes folder. */
  installed: boolean;
  /** Content hash of the local note (undefined when not installed). */
  localHash?: string;
  /** Baseline recorded when the note was downloaded. */
  record?: ThemeFileState;
}

export function classifyThemeChange(entry: RemoteThemeEntry, local: LocalThemeFacts): ThemeChange {
  const base = {
    entry,
    installed: local.installed,
    localHash: local.localHash,
    remoteHash: entry.hash,
  };

  if (!local.installed) {
    return { ...base, kind: 'new', overwrites: false, recommended: true, localEdited: false };
  }

  // Installed, but the index cannot say what the published content is.
  if (!entry.hash) {
    return { ...base, kind: 'unknown', overwrites: true, recommended: false, localEdited: false };
  }

  if (local.localHash === entry.hash) {
    return { ...base, kind: 'current', overwrites: true, recommended: false, localEdited: false };
  }

  const record = local.record;
  if (!record?.hash) {
    // Differs from the published note and there is no baseline, so an edit
    // cannot be told apart from a copy that arrived some other way (sync,
    // git, a hand-copied folder). Not recommended: leaving an out-of-date
    // theme in place costs one click, overwriting someone's edits costs them
    // their work.
    return { ...base, kind: 'conflict', overwrites: true, recommended: false, localEdited: false };
  }

  if (record.hash === entry.hash) {
    // Upstream is unchanged — only the local copy drifted. Nothing new to
    // fetch, but the published version can be restored on request.
    return { ...base, kind: 'modified', overwrites: true, recommended: false, localEdited: true };
  }

  if (record.hash === local.localHash) {
    return { ...base, kind: 'update', overwrites: true, recommended: true, localEdited: false };
  }

  // Both moved since the last download.
  return { ...base, kind: 'conflict', overwrites: true, recommended: false, localEdited: true };
}

/** Rows whose remote content differs from the local copy — i.e. worth a reminder. */
export function countUpdatable(changes: readonly ThemeChange[]): number {
  return changes.filter((c) => c.kind === 'new' || c.kind === 'update' || c.kind === 'conflict').length;
}

/** Display order: what needs attention first, what is already fine last. */
const KIND_ORDER: Record<ThemeChangeKind, number> = {
  new: 0,
  update: 1,
  conflict: 2,
  modified: 3,
  unknown: 4,
  current: 5,
};

export function sortThemeChanges(changes: readonly ThemeChange[]): ThemeChange[] {
  return [...changes].sort((a, b) => {
    const byKind = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    if (byKind !== 0) return byKind;
    return a.entry.file.localeCompare(b.entry.file);
  });
}

/** The description to show for `lang` — English when available and wanted. */
export function themeDescriptionFor(entry: RemoteThemeEntry, lang: string): string {
  if (lang.toLowerCase().startsWith('zh')) return entry.description ?? entry.descriptionEn ?? '';
  return entry.descriptionEn ?? entry.description ?? '';
}
