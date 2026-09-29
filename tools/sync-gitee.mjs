#!/usr/bin/env node
/**
 * tools/sync-gitee.mjs — mirror one GitHub Release onto the Gitee mirror repo.
 *
 * GitHub is the single source of truth (see CLAUDE.md), so this script only
 * ever creates or updates content on Gitee. The single exception is an
 * attachment whose size no longer matches the GitHub asset: that one file is
 * deleted and re-uploaded, because the Gitee API has no "replace attachment"
 * call. Nothing else on Gitee is ever deleted.
 *
 * Driven by `.github/workflows/sync-gitee.yml`, but runnable locally:
 *
 *   GITEE_TOKEN=… TAG=2.0.23 RELEASE_JSON=./gh-release.json \
 *   ASSETS_DIR=./dist DRY_RUN=true node tools/sync-gitee.mjs
 *
 * Environment:
 *   GITEE_TOKEN      required — Gitee personal access token (`projects` scope)
 *   TAG              required — the tag to mirror
 *   RELEASE_JSON     required — `gh release view <tag> --json name,body,tagName,isPrerelease`
 *   GITEE_OWNER      default northern_bank
 *   GITEE_REPO       default wewrite
 *   ASSETS_DIR       default .gitee-assets
 *   TARGET_COMMITISH optional — commit SHA to point a newly created release at
 *   DRY_RUN          "true" → report what would change, write nothing
 *
 * Exit code 0 means the mirror is up to date (a no-op run is a success).
 */

import { appendFile, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

// Overridable only so the mirror logic can be exercised against a local stub
// — the API cannot be called with a placeholder token, so there is no other
// way to verify create / update / replace-attachment paths. CI never sets it.
const API_BASE = process.env.GITEE_API_BASE || 'https://gitee.com/api/v5';

/** The three files Obsidian users actually install. Order is the upload order. */
const ASSET_NAMES = ['main.js', 'manifest.json', 'styles.css'];

const OWNER = process.env.GITEE_OWNER || 'northern_bank';
const REPO = process.env.GITEE_REPO || 'wewrite';
const TOKEN = process.env.GITEE_TOKEN || '';
const TAG = process.env.TAG || '';
const RELEASE_JSON = process.env.RELEASE_JSON || '';
const ASSETS_DIR = process.env.ASSETS_DIR || '.gitee-assets';
const DRY_RUN = process.env.DRY_RUN === 'true';

function info(message) {
  console.log(message);
}

function warn(message) {
  // Surfaces as an annotation on the workflow run without failing it.
  console.log(`::warning::${message}`);
}

function die(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

/** Gitee has been slow enough to matter; a hung socket must not eat the job. */
const REQUEST_TIMEOUT_MS = 60_000;

/**
 * One call against the Gitee v5 API.
 *
 * `access_token` always travels as a query parameter — every v5 endpoint takes
 * it there, and that keeps multipart bodies free of a form field that would
 * have to be duplicated on each verb. The URL is therefore secret-bearing and
 * is never logged, not even in error paths.
 */
async function gitee(pathname, { method = 'GET', fields, form } = {}) {
  const url = new URL(`${API_BASE}${pathname}`);
  url.searchParams.set('access_token', TOKEN);

  const init = { method, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) };
  if (form) {
    init.body = form;
  } else if (fields) {
    // Gitee documents these bodies as form-encoded; `prerelease` must be the
    // string "true"/"false" rather than a JSON boolean.
    init.body = new URLSearchParams(fields);
  }

  let response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    // A refused connection, a DNS failure or a timeout never reaches the
    // status handling below. Without this the job dies on a raw stack trace
    // and the actual reason is buried; the token-bearing URL stays unlogged.
    die(`Gitee API ${method} ${pathname} did not answer: ${error?.message ?? error}`);
  }

  const text = await response.text();

  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  return { status: response.status, ok: response.ok, data };
}

/** Best-effort human-readable explanation of a failed response. */
function describe(result) {
  const { data, status } = result;
  if (data && typeof data === 'object') {
    const message = data.message || data.error;
    if (typeof message === 'string' && message) return message;
    return JSON.stringify(data).slice(0, 400);
  }
  if (typeof data === 'string' && data.trim()) return data.trim().slice(0, 400);
  return `HTTP ${status}`;
}

function isRelease(value) {
  return Boolean(value) && typeof value === 'object' && Boolean(value.id);
}

async function fileSize(path) {
  try {
    const stats = await stat(path);
    return stats.size;
  } catch {
    return null;
  }
}

/**
 * The commit a freshly created release is pinned to. Absent or unreadable is a
 * normal outcome (the tag is already on Gitee by this point, and Gitee binds
 * the release to it through `tag_name`), so it degrades to an empty value
 * instead of aborting the mirror.
 */
async function readTargetCommitish() {
  const file = process.env.TARGET_COMMITISH_FILE;
  if (file) {
    try {
      return (await readFile(file, 'utf8')).trim();
    } catch (error) {
      warn(`Cannot read ${file} (${error?.code ?? error}); creating the release without target_commitish.`);
    }
  }
  return (process.env.TARGET_COMMITISH || '').trim();
}

async function writeSummary(lines) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file) return;
  await appendFile(file, `${lines.join('\n')}\n`, 'utf8');
}

async function main() {
  if (!TOKEN) die('GITEE_TOKEN is empty — set the repository secret.');
  if (!TAG) die('TAG is empty.');
  if (!RELEASE_JSON) die('RELEASE_JSON is empty.');

  let release;
  try {
    release = JSON.parse(await readFile(RELEASE_JSON, 'utf8'));
  } catch (error) {
    die(`Cannot read the GitHub release metadata at ${RELEASE_JSON}: ${error?.message ?? error}`);
  }

  const tag = release.tagName || TAG;
  const name = release.name || tag;
  const body = typeof release.body === 'string' ? release.body : '';
  const prerelease = Boolean(release.isPrerelease);

  const targetCommitish = await readTargetCommitish();

  const releaseUrl = `https://gitee.com/${OWNER}/${REPO}/releases/tag/${encodeURIComponent(tag)}`;
  info(`Mirroring GitHub release "${name}" (tag ${tag}, prerelease ${prerelease}) to gitee.com/${OWNER}/${REPO}.`);
  if (DRY_RUN) info('DRY_RUN=true — nothing will be written.');

  // ---- the release record -------------------------------------------------
  const found = await gitee(`/repos/${OWNER}/${REPO}/releases/tags/${encodeURIComponent(tag)}`);
  const existing = found.ok && isRelease(found.data) ? found.data : null;
  if (!existing && !found.ok && found.status !== 404) {
    die(`Cannot read the Gitee release for tag ${tag}: ${describe(found)}`);
  }

  let releaseId = existing ? existing.id : null;
  let action;

  if (!existing) {
    action = 'created';
    info(`No Gitee release for ${tag} yet — creating one.`);
    if (!DRY_RUN) {
      const created = await gitee(`/repos/${OWNER}/${REPO}/releases`, {
        method: 'POST',
        fields: {
          tag_name: tag,
          name,
          body,
          // Optional per the docs, but a SHA is unambiguous where a tag name
          // is not documented as accepted.
          ...(targetCommitish ? { target_commitish: targetCommitish } : {}),
          prerelease: String(prerelease),
        },
      });
      if (!created.ok || !isRelease(created.data)) {
        die(`Cannot create the Gitee release for tag ${tag}: ${describe(created)}`);
      }
      releaseId = created.data.id;
    }
  } else {
    const sameName = existing.name === name;
    // Gitee reports a release with no notes as null, not as "".
    const sameBody = (existing.body ?? '') === body;
    const samePrerelease = Boolean(existing.prerelease) === prerelease;

    if (sameName && sameBody && samePrerelease) {
      action = 'unchanged';
      info(`Gitee release ${tag} already matches GitHub.`);
    } else {
      action = 'updated';
      info(`Gitee release ${tag} differs — updating name/notes.`);
      if (!DRY_RUN) {
        // PATCH replaces the record, so every editable field is sent;
        // `target_commitish` is deliberately omitted — moving a published
        // release to a different commit is never what a mirror wants.
        const patched = await gitee(`/repos/${OWNER}/${REPO}/releases/${releaseId}`, {
          method: 'PATCH',
          fields: { tag_name: tag, name, body, prerelease: String(prerelease) },
        });
        if (!patched.ok) die(`Cannot update the Gitee release ${releaseId}: ${describe(patched)}`);
      }
    }
  }

  // ---- attachments --------------------------------------------------------
  let attachments = [];
  if (releaseId) {
    const listed = await gitee(`/repos/${OWNER}/${REPO}/releases/${releaseId}/attach_files`);
    if (!listed.ok) die(`Cannot list the attachments of Gitee release ${releaseId}: ${describe(listed)}`);
    attachments = Array.isArray(listed.data) ? listed.data : [];
  }

  const assetNotes = [];
  for (const assetName of ASSET_NAMES) {
    const filePath = join(ASSETS_DIR, assetName);
    const size = await fileSize(filePath);
    if (size === null) {
      warn(`Asset ${assetName} is not in ${ASSETS_DIR} — skipping it.`);
      assetNotes.push(`${assetName}: missing, skipped`);
      continue;
    }

    const current = attachments.find((item) => item && item.name === assetName);
    if (current && Number(current.size) === size) {
      info(`Asset ${assetName} is already up to date (${size} bytes).`);
      assetNotes.push(`${assetName}: up to date`);
      continue;
    }

    if (current) {
      info(`Asset ${assetName} changed (${current.size} → ${size} bytes) — replacing.`);
      assetNotes.push(`${assetName}: ${DRY_RUN ? 'would replace' : 'replaced'} (${current.size} → ${size} bytes)`);
    } else {
      info(`Uploading asset ${assetName} (${size} bytes).`);
      assetNotes.push(`${assetName}: ${DRY_RUN ? 'would upload' : 'uploaded'} (${size} bytes)`);
    }
    if (DRY_RUN) continue;

    if (current) {
      const removed = await gitee(
        `/repos/${OWNER}/${REPO}/releases/${releaseId}/attach_files/${current.id}`,
        { method: 'DELETE' },
      );
      if (!removed.ok) die(`Cannot remove the stale attachment ${assetName} (id ${current.id}): ${describe(removed)}`);
    }

    const form = new FormData();
    // The field name is fixed by the API; the filename is what shows on Gitee.
    form.append('file', new Blob([await readFile(filePath)]), assetName);
    const uploaded = await gitee(`/repos/${OWNER}/${REPO}/releases/${releaseId}/attach_files`, {
      method: 'POST',
      form,
    });
    if (!uploaded.ok) {
      die(`Cannot upload ${assetName} to Gitee release ${releaseId}: ${describe(uploaded)}`);
    }
  }

  const headline = DRY_RUN ? `Would sync ${tag} to Gitee` : `Synced ${tag} to Gitee`;
  info(`${headline} (release ${action}).`);
  info(`https://gitee.com/${OWNER}/${REPO}/releases/tag/${tag}`);

  await writeSummary([
    `## ${headline}`,
    '',
    `- Release: \`${action}\``,
    ...assetNotes.map((note) => `- ${note}`),
    `- Gitee: ${releaseUrl}`,
  ]);
}

await main();
