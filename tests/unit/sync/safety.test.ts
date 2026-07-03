// Unit tests for sync safety guards

import {
  validatePath, validateFileSize, validateCycleSize, filterUnsafePaths,
  MAX_FILE_SIZE, MAX_FILES_PER_CYCLE,
} from '../../../src/sync/safety';

describe('Sync Safety', () => {
  describe('validatePath', () => {
    it('should allow normal vault paths', () => {
      expect(validatePath('notes/readme.md').allowed).toBe(true);
      expect(validatePath('folder/sub/file.txt').allowed).toBe(true);
      expect(validatePath('简单的文件.md').allowed).toBe(true);
    });

    it('should reject paths starting with /', () => {
      const r = validatePath('/etc/passwd');
      expect(r.allowed).toBe(false);
      expect(r.reason).toContain('vault-relative');
    });

    it('should reject path traversal', () => {
      const r = validatePath('../outside/file.md');
      expect(r.allowed).toBe(false);
      expect(r.reason).toContain('traversal');
    });

    it('should reject null bytes', () => {
      const r = validatePath('file\x00.md');
      expect(r.allowed).toBe(false);
      expect(r.reason).toContain('null');
    });

    it('should reject empty paths', () => {
      const r = validatePath('');
      expect(r.allowed).toBe(false);
      expect(r.reason).toContain('empty');
    });

    it('should reject whitespace-only paths', () => {
      const r = validatePath('   ');
      expect(r.allowed).toBe(false);
    });

    it('should reject .obsidian paths', () => {
      const r = validatePath('.obsidian/workspace.json');
      expect(r.allowed).toBe(false);
      expect(r.reason).toContain('excluded');
    });

    it('should reject .git paths', () => {
      const r = validatePath('.git/config');
      expect(r.allowed).toBe(false);
      expect(r.reason).toContain('excluded');
    });

    it('should reject .DS_Store', () => {
      const r = validatePath('.DS_Store');
      expect(r.allowed).toBe(false);
    });

    it('should reject node_modules', () => {
      const r = validatePath('node_modules/pkg/index.js');
      expect(r.allowed).toBe(false);
    });

    it('should reject hidden files', () => {
      expect(validatePath('.secret').allowed).toBe(false);
      expect(validatePath('folder/.hidden/file.md').allowed).toBe(false);
    });

    it('should reject excluded extensions', () => {
      expect(validatePath('program.exe').allowed).toBe(false);
      expect(validatePath('data.zip').allowed).toBe(false);
      expect(validatePath('file.tmp').allowed).toBe(false);
      expect(validatePath('backup.bak').allowed).toBe(false);
    });

    it('should accept common file types', () => {
      expect(validatePath('note.md').allowed).toBe(true);
      expect(validatePath('image.png').allowed).toBe(true);
      expect(validatePath('doc.pdf').allowed).toBe(true);
      expect(validatePath('script.js').allowed).toBe(true);
      expect(validatePath('style.css').allowed).toBe(true);
      expect(validatePath('audio.mp3').allowed).toBe(true);
    });
  });

  describe('validateFileSize', () => {
    it('should allow files under the limit', () => {
      expect(validateFileSize(1024).allowed).toBe(true);
      expect(validateFileSize(MAX_FILE_SIZE - 1).allowed).toBe(true);
    });

    it('should reject files over the limit', () => {
      const r = validateFileSize(MAX_FILE_SIZE + 1);
      expect(r.allowed).toBe(false);
      expect(r.reason).toContain('too large');
    });

    it('should allow zero-byte files (empty notes are valid)', () => {
      const r = validateFileSize(0);
      expect(r.allowed).toBe(true);
    });
  });

  describe('validateCycleSize', () => {
    it('should allow cycles under the limit', () => {
      expect(validateCycleSize(100).allowed).toBe(true);
    });

    it('should reject cycles over the limit', () => {
      const r = validateCycleSize(MAX_FILES_PER_CYCLE + 1);
      expect(r.allowed).toBe(false);
      expect(r.reason).toContain('too many files');
    });
  });

  describe('filterUnsafePaths', () => {
    it('should separate safe and unsafe paths', () => {
      const stats = new Map([
        ['good.md', { size: 100 }],
        ['.obsidian/bad.json', { size: 50 }],
        ['huge.bin', { size: MAX_FILE_SIZE + 1 }],
        ['normal.txt', { size: 200 }],
      ]);

      const { safe, skipped } = filterUnsafePaths(stats);

      expect(safe.size).toBe(2);
      expect(safe.has('good.md')).toBe(true);
      expect(safe.has('normal.txt')).toBe(true);

      expect(skipped).toHaveLength(2);
      expect(skipped[0].path).toBe('.obsidian/bad.json');
      expect(skipped[1].path).toBe('huge.bin');
    });

    it('should return all files when none are unsafe', () => {
      const stats = new Map([
        ['a.md', { size: 100 }],
        ['b.txt', { size: 200 }],
      ]);

      const { safe, skipped } = filterUnsafePaths(stats);
      expect(safe.size).toBe(2);
      expect(skipped).toHaveLength(0);
    });

    it('should handle empty input', () => {
      const { safe, skipped } = filterUnsafePaths(new Map());
      expect(safe.size).toBe(0);
      expect(skipped).toHaveLength(0);
    });
  });
});
