// Unified local image URL resolver — resolves any Obsidian local image URL
// format to a vault-relative path and (optionally) its binary content.
//
// Supported input formats:
//   Desktop:  app://<host>/vault/relative/path
//   Desktop:  app://<host>/D:/absolute/filesystem/path
//   iOS:      http://127.0.0.1:PORT/vault/relative/path
//   Android:  http://localhost/_capacitor_file_/ABSOLUTE/PATH
//   Generic:  vault/relative/path (plain)

import { type App, type TFile } from 'obsidian';
import { createLogger } from '../utils/logger';

const log = createLogger('LocalImageResolver');

// ── Types ──

export interface ResolvedLocalImage {
	buf: ArrayBuffer;
	vaultPath: string;
	fileName: string;
}

// ── Helpers ──

function getBasePath(app: App): string {
	return (app.vault.adapter as unknown as { getBasePath?: () => string }).getBasePath?.() || '';
}

/** Normalize a filesystem path for cross-platform comparison. */
function normalizePath(p: string): string {
	return p.replace(/\\/g, '/')
		.replace(/^\/private\/var\//i, '/var/');
}

/** Convert an absolute filesystem path to vault-relative by subtracting the vault root. */
function absoluteToVaultRelative(absPath: string, basePath: string): string | null {
	if (!basePath) return null;
	const normalizedBase = normalizePath(basePath).replace(/\/$/, '') + '/';
	const normalizedPath = normalizePath(absPath);
	if (normalizedPath.toLowerCase().startsWith(normalizedBase.toLowerCase())) {
		return normalizedPath.substring(normalizedBase.length);
	}
	return null;
}

/** Strip query, fragment, and URL-decode a vault path. */
function cleanVaultPath(path: string): string {
	let cleaned = path;
	const qIdx = cleaned.indexOf('?');
	if (qIdx >= 0) cleaned = cleaned.substring(0, qIdx);
	const hIdx = cleaned.indexOf('#');
	if (hIdx >= 0) cleaned = cleaned.substring(0, hIdx);
	if (cleaned.includes('%')) {
		try { cleaned = decodeURIComponent(cleaned); } catch { /* keep as-is */ }
	}
	return cleaned;
}

/** Fallback: extract vault-relative path from an absolute filesystem path
 *  by matching the vault folder name. Used when getBasePath() is unavailable
 *  on mobile (the API returns empty or mismatched paths on capacitor WebViews). */
function absoluteToVaultRelativeByName(app: App, absPath: string): string | null {
	const norm = normalizePath(absPath);
	const vaultName = app.vault.getName();
	if (!vaultName) return null;
	// Match vaultName as a directory component: preceded by / and followed by /
	const idx = norm.lastIndexOf('/' + vaultName + '/');
	if (idx >= 0) {
		const rel = norm.substring(idx + vaultName.length + 2);
		return rel || null;
	}
	// Also try at path start (vault is at filesystem root)
	if (norm.startsWith(vaultName + '/')) {
		const rel = norm.substring(vaultName.length + 1);
		return rel || null;
	}
	return null;
}

/** Check if a string looks like an absolute filesystem path (not vault-relative). */
function isAbsolutePath(p: string): boolean {
	return /^[A-Za-z]:[\/\\]/.test(p) || p.startsWith('/');
}

// ── Path resolution (sync) ──

/**
 * Resolve a local image src to a vault-relative path.
 * Returns null if the src is a remote URL, a data: URI, or can't be resolved.
 */
export function resolveLocalImagePath(app: App, src: string): string | null {
	if (!src || src.startsWith('data:')) return null;

	// ── localhost URLs (mobile) ──
	if (src.startsWith('http://127.0.0.1') || src.startsWith('http://localhost')) {
		try {
			const urlObj = new URL(src);
			let path = decodeURIComponent(urlObj.pathname);
			if (path.startsWith('/')) path = path.substring(1);

			// Android Capacitor: /_capacitor_file_/ABSOLUTE/PATH
			if (path.startsWith('_capacitor_file_/')) {
				const absPath = path.slice('_capacitor_file_'.length);
				const basePath = getBasePath(app);
				if (basePath) {
					const result = absoluteToVaultRelative(absPath, basePath);
					if (result) return result;
				}
				// Fallback: extract vault-relative path using vault folder name
				const byName = absoluteToVaultRelativeByName(app, absPath);
				if (byName) return byName;
				log.warn('capacitor URL could not be resolved', { src: src.slice(0, 120) });
				return null;
			}

			// iOS / standard localhost: pathname is vault-relative
			return cleanVaultPath(path);
		} catch {
			return null;
		}
	}

	// ── app:// URLs (desktop) ──
	if (src.startsWith('app://')) {
		let path = src.replace(/^app:\/\/[^/]+\//, '');
		path = cleanVaultPath(path);
		// Absolute filesystem path → vault-relative
		if (isAbsolutePath(path)) {
			const basePath = getBasePath(app);
			if (basePath) {
				return absoluteToVaultRelative(path, basePath);
			}
		}
		return path || null;
	}

	// ── iOS Capacitor: capacitor://localhost/_capacitor_file_/ABSOLUTE/PATH ──
	if (src.startsWith('capacitor://localhost/_capacitor_file_/')) {
		const afterPrefix = src.slice('capacitor://localhost/_capacitor_file_'.length);
		const absPath = decodeURIComponent(afterPrefix.startsWith('/') ? afterPrefix : '/' + afterPrefix);
		const basePath = getBasePath(app);
		if (basePath) {
			const result = absoluteToVaultRelative(absPath, basePath);
			if (result) return result;
		}
		// Fallback: extract vault-relative path using vault folder name
		const byName = absoluteToVaultRelativeByName(app, absPath);
		if (byName) return byName;
		log.warn('capacitor URL could not be resolved', { src: src.slice(0, 120) });
		return null;
	}

	// ── Remote URL ──
	if (src.startsWith('http://') || src.startsWith('https://')) {
		return null;
	}

	// ── Plain vault path or absolute filesystem path ──
	let cleaned = cleanVaultPath(src);
	if (isAbsolutePath(cleaned)) {
		const basePath = getBasePath(app);
		if (basePath) {
			return absoluteToVaultRelative(cleaned, basePath);
		}
	}
	return cleaned || null;
}

// ── File read (async) ──

/**
 * Resolve a local image URL AND read its binary content.
 * On Android, uses adapter.readBinary() first (files may exist on disk but
 * not be indexed by the vault). Falls back to vault.readBinary().
 */
export async function readLocalImage(app: App, src: string): Promise<ResolvedLocalImage | null> {
	const vaultPath = resolveLocalImagePath(app, src);
	if (!vaultPath) return null;

	// Try adapter first — on Android, files may exist on disk but not
	// be indexed by the vault (matches tryReadFile / readVaultFile pattern).
	if (await app.vault.adapter.exists(vaultPath)) {
		const buf = await app.vault.adapter.readBinary(vaultPath);
		const fileName = vaultPath.split('/').pop() || '';
		return { buf, vaultPath, fileName };
	}

	// Fall back to vault-indexed file
	const file = app.vault.getAbstractFileByPath(vaultPath) as TFile | null;
	if (file) {
		const buf = await app.vault.readBinary(file);
		return { buf, vaultPath, fileName: file.name };
	}

	log.warn('readLocalImage: file not found', { src, vaultPath });
	return null;
}
