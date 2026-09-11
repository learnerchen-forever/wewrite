import { replaceMediaUrlByVaultPath } from '../../../src/media/copy-upload';

describe('replaceMediaUrlByVaultPath', () => {
  it('replaces vault path embedded in app:// URL', () => {
    const html = '<img src="app://obsidian.md/folder/pic.png">';
    const out = replaceMediaUrlByVaultPath(html, 'folder/pic.png', 'https://mmbiz.qpic.cn/x');
    expect(out).toContain('https://mmbiz.qpic.cn/x');
    expect(out).not.toContain('app://');
  });

  it('replaces absolute https image URL', () => {
    const html = '<img src="https://example.com/a.png">';
    const out = replaceMediaUrlByVaultPath(html, 'https://example.com/a.png', 'https://mmbiz.qpic.cn/y');
    expect(out).toBe('<img src="https://mmbiz.qpic.cn/y">');
  });
});
