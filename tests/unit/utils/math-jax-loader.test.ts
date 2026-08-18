import { WEWRITE_MATHJAX_GLOBAL, type WeWriteMathJaxApi } from '../../../src/core/mathjax-api';

// The loader keeps module-level state; use jest.resetModules() + dynamic
// import so each test exercises a fresh module instance.

interface ScriptEl {
  src: string;
  onload: (() => void) | null;
  onerror: (() => void) | null;
}

interface DomMocks {
  scripts: ScriptEl[];
  /** Called with the newly created script element before onload fires. */
  onAppend: (el: ScriptEl) => void;
}

function mockBrowser(global: WeWriteMathJaxApi | null, dom: Partial<DomMocks> = {}): void {
  const scripts: ScriptEl[] = [];
  (globalThis as { window?: unknown }).window = global
    ? { [WEWRITE_MATHJAX_GLOBAL]: global }
    : {};
  (globalThis as { document?: unknown }).document = {
    createElement: () => {
      const el: ScriptEl = { src: '', onload: null, onerror: null };
      scripts.push(el);
      return el;
    },
    head: {
      appendChild: (el: ScriptEl) => {
        dom.onAppend?.(el);
        queueMicrotask(() => el.onload?.());
      },
    },
  };
  dom.scripts = scripts;
}

function fakePlugin(overrides: { loadScript?: (path: string) => Promise<void> } = {}) {
  return {
    manifest: { dir: '.obsidian/plugins/wewrite' },
    app: {
      vault: { adapter: { getResourcePath: (p: string) => `app://local/${p}` } },
    },
    loadScript: overrides.loadScript,
  };
}

async function freshLoader() {
  jest.resetModules();
  return await import('../../../src/utils/math-jax-loader');
}

describe('math-jax-loader', () => {
  test('returns the already-loaded global API without touching the DOM', async () => {
    const api: WeWriteMathJaxApi = { latexToSvg: () => '<svg/>' };
    const dom: DomMocks = { scripts: [] };
    mockBrowser(api, dom);
    const { initMathJaxLoader, loadMathJax } = await freshLoader();
    initMathJaxLoader(fakePlugin() as never);
    const resolved = await loadMathJax();
    expect(resolved).toBe(api);
    expect(dom.scripts).toHaveLength(0);
  });

  test('loads via plugin.loadScript when it sets the global', async () => {
    const api: WeWriteMathJaxApi = { latexToSvg: () => '<svg/>' };
    const dom: DomMocks = { scripts: [] };
    mockBrowser(null, dom);
    const loadScript = jest.fn(async () => {
      ((globalThis as { window: Record<string, unknown> }).window)[WEWRITE_MATHJAX_GLOBAL] = api;
    });
    const { initMathJaxLoader, loadMathJax } = await freshLoader();
    initMathJaxLoader(fakePlugin({ loadScript }) as never);
    const resolved = await loadMathJax();
    expect(loadScript).toHaveBeenCalledWith('mathjax-chunk.js');
    expect(resolved).toBe(api);
    expect(dom.scripts).toHaveLength(0); // fallback not used
  });

  test('falls back to script-tag injection when loadScript is missing', async () => {
    const api: WeWriteMathJaxApi = { latexToSvg: () => '<svg/>' };
    const dom: DomMocks = { scripts: [] };
    mockBrowser(null, dom);
    // The appendChild hook installs the global before onload fires — must be
    // set before loadMathJax() because appendChild runs synchronously.
    dom.onAppend = () => {
      ((globalThis as { window: Record<string, unknown> }).window)[WEWRITE_MATHJAX_GLOBAL] = api;
    };
    // No loadScript method on the plugin → typeof check skips to injection.
    const { initMathJaxLoader, loadMathJax } = await freshLoader();
    initMathJaxLoader(fakePlugin() as never);
    const resolved = await loadMathJax();
    expect(resolved).toBe(api);
    expect(dom.scripts).toHaveLength(1);
    expect(dom.scripts[0].src).toBe('app://local/.obsidian/plugins/wewrite/mathjax-chunk.js');
  });

  test('falls back to injection when loadScript resolves without the global', async () => {
    const api: WeWriteMathJaxApi = { latexToSvg: () => '<svg/>' };
    const dom: DomMocks = { scripts: [] };
    mockBrowser(null, dom);
    dom.onAppend = () => {
      ((globalThis as { window: Record<string, unknown> }).window)[WEWRITE_MATHJAX_GLOBAL] = api;
    };
    const loadScript = jest.fn(async () => undefined); // no-op, never sets global
    const { initMathJaxLoader, loadMathJax } = await freshLoader();
    initMathJaxLoader(fakePlugin({ loadScript }) as never);
    const resolved = await loadMathJax();
    expect(loadScript).toHaveBeenCalled();
    expect(resolved).toBe(api);
    expect(dom.scripts).toHaveLength(1);
  });

  test('rejects when the chunk loads but the global is missing, then retries on next call', async () => {
    const dom: DomMocks = { scripts: [] };
    mockBrowser(null, dom);
    const { initMathJaxLoader, loadMathJax } = await freshLoader();
    initMathJaxLoader(fakePlugin() as never);
    // No onAppend hook → global stays missing → rejection.
    await expect(loadMathJax()).rejects.toThrow(/global is missing/);

    // A retry must work once the global is available (state was reset).
    dom.onAppend = () => {
      ((globalThis as { window: Record<string, unknown> }).window)[WEWRITE_MATHJAX_GLOBAL] = {
        latexToSvg: () => '<svg/>',
      };
    };
    await expect(loadMathJax()).resolves.toBeTruthy();
    expect(dom.scripts.length).toBeGreaterThanOrEqual(2);
  });

  test('rejects when initMathJaxLoader was never called', async () => {
    mockBrowser(null, { scripts: [] });
    const { loadMathJax } = await freshLoader();
    await expect(loadMathJax()).rejects.toThrow(/not initialized/);
  });
});
