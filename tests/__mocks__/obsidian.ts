// Jest mock for obsidian module
// Provides minimal implementations of Obsidian APIs used in unit tests

export class Plugin {
  app: App = new App();
  manifest: PluginManifest = { id: 'wewrite', name: 'WeWrite', version: '2.0.0' };

  loadData(): Promise<unknown> {
    return Promise.resolve({});
  }

  saveData(data: unknown): Promise<void> {
    return Promise.resolve();
  }

  addCommand(command: { id: string; name: string; callback: () => void }): void {}
  addRibbonIcon(icon: string, title: string, callback: () => void): HTMLElement { return document.createElement('div'); }
  addSettingTab(tab: unknown): void {}
  registerView(type: string, viewCreator: (leaf: WorkspaceLeaf) => unknown): void {}
  registerEvent(event: unknown): void {}
  addChild(child: unknown): void {}
}

export class App {
  vault: Vault = new Vault();
  workspace: Workspace = new Workspace();
  metadataCache: MetadataCache = new MetadataCache();
}

export class Vault {
  read(file: TFile): Promise<string> { return Promise.resolve(''); }
  readBinary(file: TFile): Promise<ArrayBuffer> { return Promise.resolve(new ArrayBuffer(0)); }
  create(path: string, data: string): Promise<TFile> { return Promise.resolve(new TFile()); }
  modify(file: TFile, data: string): Promise<void> { return Promise.resolve(); }
  delete(file: TFile): Promise<void> { return Promise.resolve(); }
  getAbstractFileByPath(path: string): TFile | null { return null; }
  adapter: DataAdapter = new DataAdapter();
}

export class DataAdapter {
  read(path: string): Promise<string> { return Promise.resolve(''); }
  write(path: string, data: string): Promise<void> { return Promise.resolve(); }
  exists(path: string): Promise<boolean> { return Promise.resolve(false); }
  writeBinary(path: string, data: ArrayBuffer): Promise<void> { return Promise.resolve(); }
}

export class Workspace {
  onLayoutReady(callback: () => void): void { callback(); }
  getActiveViewOfType<T>(type: unknown): T | null { return null; }
  getLeavesOfType(type: string): WorkspaceLeaf[] { return []; }
  getRightLeaf(create: boolean): WorkspaceLeaf | null { return null; }
  revealLeaf(leaf: WorkspaceLeaf): void {}
  on(name: string, callback: (...args: unknown[]) => unknown): EventRef { return { unload: () => {} } as EventRef; }
  activeLeaf: WorkspaceLeaf | null = null;
}

export class WorkspaceLeaf {
  view: unknown = null;
  setViewState(state: unknown): Promise<void> { return Promise.resolve(); }
}

export class MetadataCache {
  getFileCache(file: TFile): CachedMetadata | null { return null; }
  getFirstLinkpathDest(linkpath: string, sourcePath: string): TFile | null { return null; }
  on(name: string, callback: (...args: unknown[]) => unknown): EventRef { return { unload: () => {} } as EventRef; }
}

export class TFile {
  path: string = '';
  basename: string = '';
  extension: string = 'md';
  name: string = '';
}

export class MarkdownRenderer {
  static render(app: App, markdown: string, el: HTMLElement, sourcePath: string, component: unknown): Promise<void> {
    el.innerHTML = '<p>rendered</p>';
    return Promise.resolve();
  }
}

export class MarkdownRenderChild {
  containerEl: HTMLElement;
  constructor(container: HTMLElement) {
    this.containerEl = container;
  }
}

export class ItemView {
  app: App = new App();
  contentEl: HTMLElement = document.createElement('div');
  getViewType(): string { return ''; }
  getDisplayText(): string { return ''; }
  getIcon(): string { return ''; }
  async onOpen(): Promise<void> {}
  async onClose(): Promise<void> {}
}

export class Modal {
  app: App = new App();
  contentEl: HTMLElement = document.createElement('div');
  open(): void {}
  close(): void {}
}

export class PluginSettingTab {
  app: App = new App();
  plugin: Plugin = new Plugin();
  containerEl: HTMLElement = document.createElement('div');
  display(): void {}
}

export class Setting {
  constructor(container: HTMLElement) {}
  setName(name: string): Setting { return this; }
  setDesc(desc: string): Setting { return this; }
  setTooltip(tooltip: string): Setting { return this; }
  addText(cb: (text: TextComponent) => unknown): Setting { return this; }
  addTextArea(cb: (text: TextAreaComponent) => unknown): Setting { return this; }
  addDropdown(cb: (dropdown: DropdownComponent) => unknown): Setting { return this; }
  addToggle(cb: (toggle: ToggleComponent) => unknown): Setting { return this; }
  addButton(cb: (button: ButtonComponent) => unknown): Setting { return this; }
  addExtraButton(cb: (button: ExtraButtonComponent) => unknown): Setting { return this; }
}

export interface TextComponent {
  setValue(value: string): TextComponent;
  getValue(): string;
  onChange(callback: (value: string) => unknown): TextComponent;
  setPlaceholder(placeholder: string): TextComponent;
  inputEl: HTMLInputElement;
}

export interface TextAreaComponent {
  setValue(value: string): TextAreaComponent;
  getValue(): string;
  onChange(callback: (value: string) => unknown): TextAreaComponent;
  inputEl: HTMLTextAreaElement;
}

export interface DropdownComponent {
  addOption(value: string, display: string): DropdownComponent;
  setValue(value: string): DropdownComponent;
  getValue(): string;
  onChange(callback: (value: string) => unknown): DropdownComponent;
  selectEl: HTMLSelectElement;
}

export interface ToggleComponent {
  setValue(value: boolean): ToggleComponent;
  getValue(): boolean;
  onChange(callback: (value: boolean) => unknown): ToggleComponent;
}

export interface ButtonComponent {
  setButtonText(text: string): ButtonComponent;
  setIcon(icon: string): ButtonComponent;
  onClick(callback: () => unknown): ButtonComponent;
  buttonEl: HTMLButtonElement;
}

export interface ExtraButtonComponent {
  setIcon(icon: string): ExtraButtonComponent;
  setTooltip(tooltip: string): ExtraButtonComponent;
  onClick(callback: () => unknown): ExtraButtonComponent;
}

export class Notice {
  constructor(message: string, duration?: number) {}
}

export function requestUrl(req: { url: string; method?: string; body?: string; headers?: Record<string, string> }): Promise<{ status: number; json: unknown; text: string; arrayBuffer?: ArrayBuffer }> {
  return Promise.resolve({ status: 200, json: {}, text: '{}' });
}

export function sanitizeHTMLToDom(html: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.content;
}

export function setIcon(el: HTMLElement, icon: string): void {}

export function normalizePath(path: string): string { return path; }

export const Platform = {
  isDesktop: true,
  isMobile: false,
  isMacOS: false,
};

export function debounce<T extends (...args: unknown[]) => unknown>(fn: T, delay: number): T {
  let timeout: ReturnType<typeof setTimeout>;
  return ((...args: unknown[]) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  }) as unknown as T;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  minAppVersion?: string;
  description?: string;
  author?: string;
  isDesktopOnly?: boolean;
  dir?: string;
}

export interface EventRef {
  unload(): void;
}

export interface CachedMetadata {
  frontmatter?: Record<string, unknown>;
  headings?: { heading: string; level: number; position: { start: { line: number } } }[];
  tags?: { tag: string }[];
  links?: { link: string }[];
}
