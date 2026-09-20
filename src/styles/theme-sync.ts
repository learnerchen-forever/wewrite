// Theme sync — check whether the packaged themes in a vault still match the
// published ones, and update exactly the notes the user picks.
//
// The original flow could only ever *create* missing files (`vault.create`, with
// an existence check in front of it), so an updated theme was invisible and
// re-running the download to force one renamed the old note and left a
// duplicate behind. This service replaces that with an explicit comparison:
// the published index carries a content fingerprint per theme, the plugin
// remembers the fingerprint it wrote, and the difference between the two is
// what the update dialog shows.
//
// I/O is injected rather than reaching for the vault directly, so every
// comparison rule is testable without an Obsidian runtime.

import { createLogger } from '../utils/logger';
import {
  THEME_REMOTES,
  fetchRemoteJson,
  fetchRemoteText,
  type ThemeRemote,
} from './theme-remotes';
import {
  classifyThemeChange,
  countUpdatable,
  normalizeThemeIndex,
  sortThemeChanges,
  themeContentHash,
  themeIndexFingerprint,
  type RemoteThemeEntry,
  type ThemeChange,
  type ThemeFileState,
  type ThemeIndex,
  type ThemeSyncStateMap,
} from './theme-index';

const log = createLogger('Styles');

/** API listing entry — used when `themes.json` is missing from a mirror. */
interface ApiDirEntry {
  name: string;
  download_url?: string;
  url?: string;
}

export interface ThemeCheckResult {
  index: ThemeIndex;
  /** Mirror that answered. */
  remote: ThemeRemote;
  /** One row per published theme, most urgent first. */
  changes: ThemeChange[];
  /** Rows whose remote content differs from the local copy. */
  pending: number;
  /** Identity of the published index — dedupes the startup reminder. */
  fingerprint: string;
}

export type ThemeCheckOutcome =
  | { ok: true; result: ThemeCheckResult }
  | { ok: false; reason: 'unreachable' };

export interface ThemeApplyResult {
  /** Notes that did not exist before. */
  created: number;
  /** Existing notes replaced (the local content is gone — this is the risky one). */
  overwritten: number;
  /** Notes whose download failed on every mirror. */
  failed: string[];
  /**
   * Notes whose downloaded content did not match the index's fingerprint.
   * They were written (the content is what the mirror serves) and the actual
   * fingerprint was recorded, so the next check reports them again rather than
   * silently claiming success.
   */
  mismatched: string[];
}

export interface ThemeSyncDeps {
  /** Baseline fingerprints recorded at download time, keyed by file name. */
  states: ThemeSyncStateMap;
  /** Read a theme note; null when it does not exist. */
  readLocal: (file: string) => Promise<string | null>;
  /** Create or overwrite a theme note (parent folder guaranteed to exist). */
  writeLocal: (file: string, content: string) => Promise<void>;
  /** Persist the updated state map. Called once per successful apply. */
  persist: (states: ThemeSyncStateMap) => Promise<void>;
  /** URL fetcher; injectable for tests. Defaults to the shared retrying fetch. */
  fetchText?: (url: string) => Promise<string | null>;
  /** Index fetcher; injectable for tests. */
  fetchJson?: (url: string) => Promise<unknown>;
}

export class ThemeSyncService {
  private readonly deps: ThemeSyncDeps;
  /**
   * Mirror that answered the last index request.
   *
   * Remembered because the fallback exists for people who cannot reach GitHub
   * at all: without this, every one of the ten theme downloads would begin by
   * waiting out GitHub's timeout before falling back, which turns a 15-second
   * worst case into a two-and-a-half-minute one.
   */
  private preferredRemoteId: string | null = null;

  constructor(deps: ThemeSyncDeps) {
    this.deps = deps;
  }

  private fetchText(url: string): Promise<string | null> {
    return (this.deps.fetchText ?? fetchRemoteText)(url);
  }

  private fetchJson(url: string): Promise<unknown> {
    return (this.deps.fetchJson ?? fetchRemoteJson)(url);
  }

  /**
   * Resolve the published index from the first mirror that answers.
   * Returns null when neither mirror could be reached — a plain "offline",
   * which the callers report without alarming the user.
   */
  async resolveIndex(): Promise<{ index: ThemeIndex; remote: ThemeRemote } | null> {
    for (const remote of THEME_REMOTES) {
      const index = await this.fetchIndex(remote);
      if (index) {
        this.preferredRemoteId = remote.id;
        return { index, remote };
      }
    }
    return null;
  }

  /** Fetch one mirror's index, falling back to its directory listing. */
  private async fetchIndex(remote: ThemeRemote): Promise<ThemeIndex | null> {
    const raw = await this.fetchJson(remote.rawBase + 'themes.json');
    const fromManifest = normalizeThemeIndex(raw);
    if (fromManifest) return fromManifest;

    // No (usable) themes.json — list the directory instead, so a mirror that
    // temporarily serves a stale index still yields the file names. Entries
    // arrive without fingerprints, which downgrades the comparison to
    // "unknown" rather than inventing an answer.
    const listing = await this.fetchJson(remote.apiUrl);
    if (!Array.isArray(listing)) return null;

    const files = (listing as ApiDirEntry[])
      .filter((e) => typeof e?.name === 'string' && e.name.endsWith('.md'))
      .map((e) => ({ name: e.name.replace(/\.md$/, ''), file: e.name }));
    if (files.length === 0) return null;

    log.debug('theme index resolved via directory listing', { remote: remote.id, count: files.length });
    return { schema: 1, themes: files };
  }

  /**
   * Compare the published themes against the local ones.
   * Never throws for network trouble — an unreachable index is a normal
   * outcome on a train, not an error.
   */
  async check(): Promise<ThemeCheckOutcome> {
    const resolved = await this.resolveIndex();
    if (!resolved) {
      log.info('theme check: no mirror reachable');
      return { ok: false, reason: 'unreachable' };
    }

    const { index, remote } = resolved;
    const changes: ThemeChange[] = [];

    for (const entry of index.themes) {
      const content = await this.deps.readLocal(entry.file);
      changes.push(
        classifyThemeChange(entry, {
          installed: content !== null,
          localHash: content === null ? undefined : themeContentHash(content),
          record: this.deps.states[entry.file],
        }),
      );
    }

    const sorted = sortThemeChanges(changes);
    return {
      ok: true,
      result: {
        index,
        remote,
        changes: sorted,
        pending: countUpdatable(sorted),
        fingerprint: themeIndexFingerprint(index),
      },
    };
  }

  /**
   * Download the selected themes and write them over the local notes.
   *
   * Existing notes are **replaced**, not renamed: the previous behaviour of
   * writing to a fresh name was what produced duplicate themes. The dialog
   * makes the overwrite explicit before this runs.
   */
  async apply(changes: readonly ThemeChange[], preferredRemoteId?: string): Promise<ThemeApplyResult> {
    const result: ThemeApplyResult = { created: 0, overwritten: 0, failed: [], mismatched: [] };
    if (changes.length === 0) return result;

    const preferred = preferredRemoteId ?? this.preferredRemoteId ?? undefined;
    let stateChanged = false;

    for (const change of changes) {
      const entry = change.entry;
      const fetched = await this.fetchThemeFile(entry, preferred);
      if (!fetched) {
        result.failed.push(entry.file);
        log.warn('theme download failed on every mirror', { file: entry.file });
        continue;
      }

      const actualHash = themeContentHash(fetched.content);
      if (entry.hash && actualHash !== entry.hash) {
        // The mirror is serving content the index does not describe (a stale
        // CDN edge, most likely). The content is still what the user asked
        // for, so keep it — but record what was really written, so the next
        // check compares against reality instead of reporting a fixed state.
        result.mismatched.push(entry.file);
        log.warn('theme content does not match the published fingerprint', {
          file: entry.file,
          expected: entry.hash,
          actual: actualHash,
        });
      }

      try {
        await this.deps.writeLocal(entry.file, fetched.content);
      } catch (err) {
        result.failed.push(entry.file);
        log.warn('failed to write theme note', { file: entry.file, err: String(err) });
        continue;
      }

      if (change.overwrites) result.overwritten++;
      else result.created++;

      const record: ThemeFileState = {
        hash: actualHash,
        updated: entry.updated ?? '',
        downloadedAt: new Date().toISOString(),
        source: fetched.remote.id,
      };
      this.deps.states[entry.file] = record;
      stateChanged = true;
    }

    if (stateChanged) {
      try {
        await this.deps.persist(this.deps.states);
      } catch (err) {
        log.warn('failed to persist theme sync state', { err: String(err) });
      }
    }

    log.info('theme sync applied', {
      created: result.created,
      overwritten: result.overwritten,
      failed: result.failed.length,
      mismatched: result.mismatched.length,
    });
    return result;
  }

  /**
   * Fetch one theme note, preferring the mirror that served the index and
   * falling back to the others. A mirror whose content does not match the
   * index's fingerprint is treated as a failed attempt so the next mirror gets
   * a chance; the last candidate is returned regardless.
   */
  private async fetchThemeFile(
    entry: RemoteThemeEntry,
    preferredRemoteId?: string,
  ): Promise<{ content: string; remote: ThemeRemote } | null> {
    const ordered = [
      ...THEME_REMOTES.filter((r) => r.id === preferredRemoteId),
      ...THEME_REMOTES.filter((r) => r.id !== preferredRemoteId),
    ];

    let last: { content: string; remote: ThemeRemote } | null = null;
    for (const remote of ordered) {
      const content = await this.fetchText(remote.rawBase + entry.file);
      if (content === null) continue;

      const candidate = { content, remote };
      if (!entry.hash) return candidate;
      if (themeContentHash(content) === entry.hash) return candidate;

      // Remember the first answer as a last resort, keep looking for a mirror
      // that agrees with the index.
      last = last ?? candidate;
    }
    return last;
  }
}
