// command-catalog.ts — every WeWrite command, as the surfaces outside the
// plugin's own views see it.
//
// A single command reaches four places: the command palette, the editor
// context menu, the file-explorer context menu, and — on mobile — the editor
// toolbar. Keeping the metadata in one table is what makes those four agree:
// the editor menu is built from the same entries the commands are registered
// from, so an action can no longer exist in a menu without a matching command.
//
// `icon` is mandatory. Obsidian's mobile editor toolbar renders
// `Command.icon` and falls back to a "?" placeholder for a command that has
// none, which is what made the WeWrite commands unusable there. Every id below
// is therefore checked against the registered icon set (and against the i18n
// files) by tests/unit/core/command-catalog.test.ts.
//
// Ids are stable API: Obsidian persists hotkeys and mobile-toolbar buttons by
// command id, so renaming one silently discards the user's configuration.

/** One WeWrite command. */
export interface WeWriteCommandEntry {
  /** Obsidian command id, without the `wewrite:` prefix. */
  readonly id: string;
  /** i18n key for the command-palette and mobile-toolbar label. */
  readonly nameKey: string;
  /** Icon id from src/core/icon-registry.ts. */
  readonly icon: string;
  /** i18n key for a shorter context-menu label; defaults to `nameKey`. */
  readonly menuKey?: string;
}

/**
 * The note-editing actions, in the order the editor menu's "WeWrite AI"
 * submenu lists them. Registered with `editorCallback` — the same shape
 * Obsidian's own editor commands (bold, insert link, …) use — so they appear
 * in the palette and on the mobile toolbar only while a markdown editor is
 * focused.
 */
export const AI_EDITOR_MENU_COMMANDS = [
  {
    id: 'wewrite-ai-proofread',
    nameKey: 'command.ai_proofread',
    icon: 'wewrite-proofread',
    menuKey: 'contextMenu.ai_proofread',
  },
  {
    id: 'wewrite-ai-synonyms',
    nameKey: 'command.ai_synonyms',
    icon: 'wewrite-synonyms',
    menuKey: 'contextMenu.ai_synonyms',
  },
  {
    id: 'wewrite-ai-translate',
    nameKey: 'command.ai_translate',
    icon: 'wewrite-translate',
    menuKey: 'contextMenu.ai_translate',
  },
  {
    id: 'generate-image-by-ai',
    nameKey: 'command.generate_image_by_ai',
    icon: 'wewrite-ai-generate',
    menuKey: 'contextMenu.ai_generate_image',
  },
  {
    id: 'wewrite-ai-generate-mermaid',
    nameKey: 'command.ai_generate_mermaid',
    icon: 'wewrite-mermaid',
    menuKey: 'contextMenu.ai_generate_mermaid',
  },
  {
    id: 'wewrite-ai-generate-math',
    nameKey: 'command.ai_generate_math',
    icon: 'wewrite-math',
    menuKey: 'contextMenu.ai_generate_math',
  },
] as const satisfies readonly WeWriteCommandEntry[];

/** Ids of the editor-menu actions; also the keys of the runner table. */
export type AIEditorCommandId = (typeof AI_EDITOR_MENU_COMMANDS)[number]['id'];

/**
 * Note-scoped actions shared by the file-explorer menu and the editor menu.
 * They read the active note, so they are registered with `checkCallback` and
 * stay out of the palette when no markdown note is open.
 */
export const NOTE_MENU_COMMANDS = [
  {
    id: 'open-wechat-news-view',
    nameKey: 'command.open_wechat_news_view',
    icon: 'wewrite-news',
    menuKey: 'contextMenu.as_wechat_news',
  },
  {
    id: 'open-wechat-newspic-view',
    nameKey: 'command.open_wechat_newspic_view',
    icon: 'wewrite-newspic',
    menuKey: 'contextMenu.as_wechat_news_pic',
  },
  {
    id: 'wewrite-edit-theme',
    nameKey: 'command.edit_wechat_theme',
    icon: 'wewrite-theme',
    menuKey: 'contextMenu.edit_theme',
  },
] as const satisfies readonly WeWriteCommandEntry[];

/** Commands that open one of the plugin's views and need no note context. */
export const VIEW_MENU_COMMANDS = [
  {
    id: 'open-material-view',
    nameKey: 'command.open_wechat_materials',
    icon: 'wewrite-material',
  },
  {
    id: 'new-theme-wizard',
    nameKey: 'command.new_wechat_theme',
    icon: 'wewrite-new-theme',
  },
  {
    id: 'open-whats-new',
    nameKey: 'command.whats_new',
    icon: 'wewrite-digest',
  },
] as const satisfies readonly WeWriteCommandEntry[];

/** WebDAV sync commands. */
export const SYNC_MENU_COMMANDS = [
  {
    id: 'wewrite-sync-now',
    nameKey: 'command.sync_now',
    icon: 'wewrite-sync',
  },
  {
    id: 'wewrite-sync-test-connection',
    nameKey: 'command.sync_test_connection',
    icon: 'wewrite-link',
  },
  {
    id: 'wewrite-sync-resolve-conflicts',
    nameKey: 'command.sync_resolve_conflicts',
    icon: 'wewrite-compose',
  },
  {
    id: 'wewrite-sync-journal',
    nameKey: 'command.sync_journal',
    icon: 'wewrite-draft',
  },
] as const satisfies readonly WeWriteCommandEntry[];

/** Every command WeWrite registers with Obsidian. */
export const WEWRITE_COMMANDS: readonly WeWriteCommandEntry[] = [
  ...NOTE_MENU_COMMANDS,
  ...VIEW_MENU_COMMANDS,
  ...AI_EDITOR_MENU_COMMANDS,
  ...SYNC_MENU_COMMANDS,
];

/**
 * The i18n key for a command's context-menu label.
 *
 * Lives here rather than inline in the menu builder because the catalogue's
 * `as const` tuples type `menuKey` as always-present, and an inline
 * `entry.menuKey ?? entry.nameKey` therefore mis-narrows inside a union.
 */
export function commandLabelKey(entry: WeWriteCommandEntry): string {
  return entry.menuKey ?? entry.nameKey;
}

const BY_ID = new Map(WEWRITE_COMMANDS.map((entry) => [entry.id, entry]));

/**
 * Look up a catalogued command.
 *
 * Throws when the id is unknown: the caller is always a literal in main.ts, so
 * a miss is a typo in the source, not a runtime condition. The unit test
 * exercises every id the menus reference, so this can never fire in a release.
 */
export function getCommandEntry(id: string): WeWriteCommandEntry {
  const entry = BY_ID.get(id);
  if (!entry) throw new Error(`WeWrite command is missing from the catalog: ${id}`);
  return entry;
}
