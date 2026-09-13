// src/core/changelog.ts — the release notes that ship inside the plugin.
//
// `changelog-data.json` is generated from CHANGELOG.md by `tools/changelog.js`
// at release time, which is the same source that produces the GitHub Release
// body. The dialog a user sees after an update therefore always matches the
// published release, with no network request and no GitHub API rate limit.
//
// All logic here is pure so the "what do I show this user" decision is unit
// testable without an Obsidian runtime.

import rawData from './changelog-data.json';
import { compareVersions } from '../utils/version-utils';

export type ChangelogSectionType =
  | 'breaking'
  | 'feat'
  | 'fix'
  | 'perf'
  | 'refactor'
  | 'docs'
  | 'chore'
  | 'other';

export interface ChangelogRef {
  label: string;
  url: string;
}

export interface ChangelogItem {
  text: string;
  scope?: string;
  refs?: ChangelogRef[];
}

export interface ChangelogSection {
  type: ChangelogSectionType;
  items: ChangelogItem[];
}

export interface ChangelogEntry {
  version: string;
  date: string | null;
  url: string;
  sections: ChangelogSection[];
}

export interface ChangelogData {
  repository: string;
  entries: ChangelogEntry[];
}

/** Section order used when rendering — mirrors tools/changelog.js. */
export const CHANGELOG_SECTION_ORDER: ChangelogSectionType[] = [
  'breaking',
  'feat',
  'fix',
  'perf',
  'refactor',
  'docs',
  'chore',
  'other',
];

/** i18n key for a section heading, e.g. `whats_new.section.feat`. */
export function sectionLabelKey(type: ChangelogSectionType): string {
  return `whats_new.section.${type}`;
}

function normalizeType(type: string): ChangelogSectionType {
  return (CHANGELOG_SECTION_ORDER as string[]).includes(type)
    ? (type as ChangelogSectionType)
    : 'other';
}

// Validate on read rather than trusting the build artifact blindly: a bad
// generated file must degrade to "no notes", never crash plugin load.
export function normalizeChangelogData(raw: unknown): ChangelogData {
  const source = (raw || {}) as Partial<ChangelogData>;
  const entries = Array.isArray(source.entries) ? source.entries : [];

  const normalized: ChangelogEntry[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry.version !== 'string') continue;
    const sections: ChangelogSection[] = [];
    for (const section of Array.isArray(entry.sections) ? entry.sections : []) {
      if (!section || !Array.isArray(section.items)) continue;
      const items = section.items.filter(
        (item): item is ChangelogItem => !!item && typeof item.text === 'string' && item.text.length > 0,
      );
      if (items.length) sections.push({ type: normalizeType(String(section.type)), items });
    }
    if (!sections.length) continue;
    normalized.push({
      version: entry.version,
      date: typeof entry.date === 'string' ? entry.date : null,
      url: typeof entry.url === 'string' ? entry.url : '',
      sections: sections.sort(
        (a, b) =>
          CHANGELOG_SECTION_ORDER.indexOf(a.type) - CHANGELOG_SECTION_ORDER.indexOf(b.type),
      ),
    });
  }

  normalized.sort((a, b) => compareVersions(b.version, a.version));

  return {
    repository: typeof source.repository === 'string' ? source.repository : '',
    entries: normalized,
  };
}

let cached: ChangelogData | null = null;

/** The bundled changelog, newest release first. */
export function getChangelog(): ChangelogData {
  if (!cached) cached = normalizeChangelogData(rawData);
  return cached;
}

export function getChangelogEntries(): ChangelogEntry[] {
  return getChangelog().entries;
}

export function getRepositoryUrl(): string {
  return getChangelog().repository;
}

/** The notes for a specific version, or null when that release is not documented. */
export function getEntry(version: string, entries: ChangelogEntry[] = getChangelogEntries()): ChangelogEntry | null {
  return entries.find((entry) => entry.version === version) ?? null;
}

/**
 * Releases the user has not seen yet: strictly newer than `fromExclusive` and
 * no newer than `upToInclusive` (the running version), newest first.
 *
 * An empty `fromExclusive` means "no known previous version" — callers use
 * that to distinguish a fresh install from an update, so this returns every
 * documented release up to the running version.
 *
 * `entries` is injectable so the selection rules can be unit tested against
 * fixtures instead of whatever happens to be bundled.
 */
export function getEntriesSince(
  fromExclusive: string,
  upToInclusive: string,
  entries: ChangelogEntry[] = getChangelogEntries(),
): ChangelogEntry[] {
  return entries.filter((entry) => {
    if (upToInclusive && compareVersions(entry.version, upToInclusive) > 0) return false;
    if (fromExclusive && compareVersions(entry.version, fromExclusive) <= 0) return false;
    return true;
  });
}

/**
 * What to display for the running version.
 *
 * `lastSeen` is the version the user last acknowledged. An empty value marks a
 * fresh install: there is nothing to catch up on, so the view is just the
 * running release (used by the manual command) and the caller never
 * auto-opens the dialog.
 */
export interface WhatsNewView {
  entries: ChangelogEntry[];
  /** True when the user updated and is catching up on missed releases. */
  isUpdate: boolean;
  /** Version the user is coming from, when known. */
  fromVersion: string | null;
}

export function buildWhatsNewView(
  current: string,
  lastSeen: string,
  entries: ChangelogEntry[] = getChangelogEntries(),
): WhatsNewView | null {
  if (entries.length === 0) return null;

  /** Prefer the notes of the version being run; fall back to the newest. */
  const running = (): ChangelogEntry => getEntry(current, entries) ?? entries[0];

  if (lastSeen) {
    const unseen = getEntriesSince(lastSeen, current, entries);
    if (unseen.length > 0) {
      const isUpdate = compareVersions(current, lastSeen) > 0;
      return { entries: unseen, isUpdate, fromVersion: isUpdate ? lastSeen : null };
    }
  }

  // Fresh install, re-open, or a downgrade: show the running release only.
  // Dumping the whole bundled history here would be noise, not a summary.
  return { entries: [running()], isUpdate: false, fromVersion: null };
}

/**
 * Whether the dialog should open by itself after this load: the user updated
 * from a known older version and there is something new to read.
 */
export function shouldAutoShow(
  current: string,
  lastSeen: string,
  autoShowEnabled: boolean,
  entries: ChangelogEntry[] = getChangelogEntries(),
): boolean {
  if (!autoShowEnabled) return false;
  if (!lastSeen) return false; // fresh install
  if (compareVersions(current, lastSeen) <= 0) return false;
  return getEntriesSince(lastSeen, current, entries).length > 0;
}
