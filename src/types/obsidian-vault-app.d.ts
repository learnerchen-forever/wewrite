// obsidian-vault-app.d.ts — Expose the owning App on Vault.
//
// Obsidian exposes `vault.app` at runtime but the core type definitions omit
// it. Adding it lets callers reach `vault.app.fileManager` (e.g. to trash a
// file via FileManager#trashFile so the user's deletion preference is
// respected) without unsafe casts.

import type { App } from 'obsidian';

declare module 'obsidian' {
  interface Vault {
    /** The Obsidian App that owns this vault. */
    app: App;
  }
}
