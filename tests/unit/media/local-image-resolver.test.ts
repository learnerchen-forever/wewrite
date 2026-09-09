import { resolveLocalImagePath } from '../../../src/media/local-image-resolver';
import type { App } from 'obsidian';

function mockApp(basePath: string, vaultName: string): App {
  return {
    vault: {
      getName: () => vaultName,
      adapter: { getBasePath: () => basePath },
    },
  } as unknown as App;
}

describe('resolveLocalImagePath — absolute path recovery', () => {
  const vaultRoot = '/Users/vanabel/SynologyDrive/Workspace/MyVault';
  const app = mockApp(vaultRoot, 'MyVault');

  it('maps app:// absolute path missing leading slash (Synology Drive)', () => {
    const src = 'app://local/Users/vanabel/SynologyDrive/Workspace/MyVault/assets/a.png';
    expect(resolveLocalImagePath(app, src)).toBe('assets/a.png');
  });

  it('maps plain Users/... path missing leading slash', () => {
    const src = 'Users/vanabel/SynologyDrive/Workspace/MyVault/img/b.jpg';
    expect(resolveLocalImagePath(app, src)).toBe('img/b.jpg');
  });

  it('maps absolute path with leading slash', () => {
    const src = '/Users/vanabel/SynologyDrive/Workspace/MyVault/cover.png';
    expect(resolveLocalImagePath(app, src)).toBe('cover.png');
  });

  it('falls back to vault name when basePath mismatches', () => {
    const otherApp = mockApp('/Volumes/Other/MyVault', 'MyVault');
    const src = 'app://x/Users/vanabel/SynologyDrive/Workspace/MyVault/notes/c.png';
    expect(resolveLocalImagePath(otherApp, src)).toBe('notes/c.png');
  });

  it('keeps normal vault-relative paths', () => {
    expect(resolveLocalImagePath(app, 'folder/pic.png')).toBe('folder/pic.png');
  });

  it('returns null for remote URLs', () => {
    expect(resolveLocalImagePath(app, 'https://example.com/a.png')).toBeNull();
  });
});
