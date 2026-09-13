// Runtime-only Obsidian API that is not present in the public typings.
//
// `showOnMobileToolbar` is read by Obsidian's mobile toolbar ("Settings →
// Mobile → Manage toolbar options"). Non-editor commands — the ones registered
// with `callback`/`checkCallback` rather than `editorCallback` — are excluded
// from that list unless the flag is set, which is why WeWrite's view, theme and
// sync commands could not be pinned to the toolbar.
//
// `export {}` keeps this file a module: without it `declare module 'obsidian'`
// would declare a *new* ambient module that shadows the real typings.
export {};

declare module 'obsidian' {
  interface Command {
    /**
     * Whether a non-editor command can be added to the mobile toolbar.
     *
     * Ignored for editor commands (`editorCallback` / `editorCheckCallback`),
     * which are always eligible.
     */
    showOnMobileToolbar?: boolean;
  }
}
