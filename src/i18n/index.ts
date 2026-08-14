// i18n/index.ts — Lightweight i18n for WeWrite
//
// Architecture:
//   en.json     → always loaded, serves as fallback for all languages
//   zh-CN.json  → loaded when zh* locale detected, merged over en
//   New locale  → drop in <code>.json + one mapping line
//
// Hot-switch: workspace.on('layout-change') polls getLanguage(), fires
// registered callbacks so views/settings can re-render.

import { getLanguage } from 'obsidian';
import type { Workspace, EventRef } from 'obsidian';
import enRaw from './en.json';
import zhCNRaw from './zh-CN.json';

const enData: Record<string, string> = enRaw;
const zhCNData: Record<string, string> = zhCNRaw;

// ── State ──
let currentLang = 'en';
let translations: Record<string, string> = { ...enData };
const changeListeners: Array<() => void> = [];
let initDone = false;
let workspaceRef: Workspace | null = null;
let layoutChangeRef: EventRef | null = null;

// ── Helpers ──

function resolveLang(raw: string): string {
  if (!raw) return 'en';
  const lower = raw.toLowerCase();
  if (lower.startsWith('zh')) return 'zh-CN';
  return 'en';
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_match: string, key: string) => {
    const val = params[key];
    return val !== undefined ? String(val) : _match;
  });
}

function loadLocale(lang: string): void {
  if (lang === 'zh-CN') {
    translations = { ...enData, ...zhCNData };
  } else {
    translations = { ...enData };
  }
  currentLang = lang;
}

function notifyListeners(): void {
  for (const cb of changeListeners) {
    try { cb(); } catch (_e) { /* isolate failures */ }
  }
}

// ── Public API ──

/** Translate a key. Falls back to en, then to the raw key. */
export function t(key: string, params?: Record<string, string | number>): string {
  const raw = translations[key];
  if (raw !== undefined) return interpolate(raw, params);
  if (currentLang !== 'en') {
    const enRaw = enData[key];
    if (enRaw !== undefined) return interpolate(enRaw, params);
  }
  return key;
}

/** Register a language-change callback. Returns unsubscribe function. */
export function onLanguageChange(cb: () => void): () => void {
  changeListeners.push(cb);
  return () => {
    const idx = changeListeners.indexOf(cb);
    if (idx >= 0) changeListeners.splice(idx, 1);
  };
}

/** One-time init. Pass workspace to enable hot-switch on layout-change. */
export function initI18n(workspace?: Workspace): void {
  if (initDone) return;
  initDone = true;

  const detected = resolveLang(workspace ? getLanguage() : 'en');
  if (detected !== 'en') loadLocale(detected);

  if (workspace) {
    // Track the EventRef so disposeI18n() can unregister it — every plugin
    // reload otherwise stacks another layout-change listener on the global
    // workspace (resource leak).
    workspaceRef = workspace;
    layoutChangeRef = workspace.on('layout-change', () => {
      const newLang = resolveLang(getLanguage());
      if (newLang !== currentLang) {
        loadLocale(newLang);
        notifyListeners();
      }
    });
  }
}

/** Unregister the workspace listener. Call from plugin onunload. */
export function disposeI18n(): void {
  if (layoutChangeRef && workspaceRef) {
    workspaceRef.offref(layoutChangeRef);
  }
  layoutChangeRef = null;
  workspaceRef = null;
  initDone = false;
}
