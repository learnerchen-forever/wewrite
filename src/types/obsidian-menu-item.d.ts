// Runtime-only Obsidian API that is not present in the public typings.
//
// MenuItem.setSubmenu() exists at runtime since the Obsidian 1.0 era — the
// legacy WeWrite plugin (minAppVersion 0.16.0) and the Copilot plugin both use
// it in the editor context menu. It renders Obsidian's standard chevron-right
// submenu indicator on the parent item and positions/shows the submenu itself
// (hover on desktop, tap on mobile).
import type { Menu, MenuItem } from 'obsidian';

declare module 'obsidian' {
  interface MenuItem {
    /**
     * Creates the native submenu for this item. Obsidian renders the standard
     * chevron-right indicator on the item and shows the submenu on hover
     * (desktop) or tap (mobile). The created menu is returned on most builds
     * and is also exposed via {@link submenu}.
     */
    setSubmenu(): Menu | MenuItem;

    /**
     * The submenu created by {@link setSubmenu}, when available.
     */
    submenu?: Menu;
  }
}
