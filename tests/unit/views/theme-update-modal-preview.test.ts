// Visual harness for the theme-update dialog.
//
// jsdom cannot lay anything out, so this asserts nothing about layout — it
// renders the *real* dialog (the same class, the same onOpen path) into a
// static page that links the plugin's real styles.css, so the result can be
// looked at in a browser:
//
//   UI_PREVIEW=1 node node_modules/jest/bin/jest.js tests/unit/views/theme-update-modal-preview.test.ts
//
// Skipped in a normal run: a test that writes files into the repository is a
// side effect CI should not have. The output lands in
// `.workbuddy/theme-modal-preview/`, which is a scratch directory.

import * as fs from 'fs';
import * as path from 'path';

import {
  ThemeOverwriteConfirmModal,
  ThemeUpdateModal,
} from '../../../src/views/theme-update-modal';
import type { ThemeChange, ThemeChangeKind } from '../../../src/styles/theme-index';
import type { ThemeCheckResult } from '../../../src/styles/theme-sync';
import { bootJsdom } from '../../helpers/settings-dom-harness';

const OUT_DIR = path.join(__dirname, '..', '..', '..', '.workbuddy', 'theme-modal-preview');
const run = process.env.UI_PREVIEW ? it : it.skip;

interface RowSpec {
  file: string;
  name: string;
  kind: ThemeChangeKind;
  description: string;
  hash?: string;
  localHash?: string;
  updated?: string;
  installed: boolean;
  overwrites: boolean;
  recommended: boolean;
  localEdited?: boolean;
}

function row(spec: RowSpec): ThemeChange {
  return {
    entry: {
      name: spec.name,
      file: spec.file,
      description: spec.description,
      hash: spec.hash,
      updated: spec.updated,
    },
    kind: spec.kind,
    installed: spec.installed,
    localHash: spec.localHash,
    remoteHash: spec.hash,
    overwrites: spec.overwrites,
    recommended: spec.recommended,
    localEdited: spec.localEdited ?? false,
  };
}

/** One row of every kind, so the badges and hints are all visible at once. */
const CHANGES: ThemeChange[] = [
  row({
    file: '011-墨玉沉光.md', name: '墨玉沉光', kind: 'new', installed: false,
    hash: '9f2c1d4e5a6b7c8d', updated: '2026-09-20', overwrites: false, recommended: true,
    description: '墨玉般的深灰基调，正文宽行距，标题用细描边方框，克制而有分量。',
  }),
  row({
    file: '003-落日熔金.md', name: '落日熔金', kind: 'update', installed: true,
    hash: '1a2b3c4d5e6f7081', localHash: 'e9873412712a9b6d', updated: '2026-09-18',
    overwrites: true, recommended: true,
    description: '暖橙配衬线字与宽行距，标题为药丸三角、引用双层套框，晚霞般浓郁，适合散文与长文。',
  }),
  row({
    file: '007-鎏金古典.md', name: '鎏金古典', kind: 'conflict', installed: true,
    hash: '77aa11bb22cc33dd', localHash: '35c1ed7440417b3f', updated: '2026-09-19',
    overwrites: true, recommended: false, localEdited: true,
    description: '纸纹暖底配鎏金衬线，标题为匾额、引用为古典色条、图片加墨框，端庄复古。',
  }),
  row({
    file: '005-雨过天青.md', name: '雨过天青', kind: 'unknown', installed: true,
    localHash: 'c2ed655222cda94a', updated: '2026-09-18', overwrites: true, recommended: false,
    description: '雨后天青的冷调蓝，衬线正文，一级标题下划块、二级标题浅底，引用为玻璃卡片，清透克制。',
  }),
  row({
    file: '001-晨曦蓝调.md', name: '晨曦蓝调', kind: 'current', installed: true,
    hash: '631b328fc3a668ce', localHash: '631b328fc3a668ce', updated: '2026-09-18',
    overwrites: true, recommended: false,
    description: '晨光微亮的蓝色基调，浅底配深蓝强调，标题轻底色块、引用为经典色条，适合技术文章与日常工作记录。',
  }),
];

const RESULT: ThemeCheckResult = {
  index: { schema: 2, themes: CHANGES.map((c) => c.entry) },
  remote: {
    id: 'gitee',
    host: 'gitee.com',
    rawBase: 'https://gitee.com/northern_bank/wewrite/raw/master/themes/',
    apiUrl: 'https://gitee.com/api/v5/repos/northern_bank/wewrite/contents/themes/',
  },
  changes: CHANGES,
  pending: 3,
  fingerprint: '0123456789abcdef',
};

/** Obsidian's own theme variables, trimmed to the ones styles.css reads. */
const OBSIDIAN_VARS = `
  --background-primary: #ffffff;
  --background-primary-alt: #fbfbfb;
  --background-secondary: #f6f6f6;
  --background-modifier-hover: rgba(0, 0, 0, 0.055);
  --background-modifier-border: #e3e3e3;
  --background-modifier-form-field: #ffffff;
  --divider-color: #e3e3e3;
  --text-normal: #2e3338;
  --text-muted: #6b7280;
  --text-faint: #9aa0a6;
  --text-accent: #0b6bcb;
  --text-accent-hover: #0a5aa8;
  --text-error: #d64545;
  --text-warning: #b06f00;
  --text-on-accent: #ffffff;
  --interactive-accent: #0b6bcb;
  --interactive-accent-hover: #0a5aa8;
  --font-ui-smaller: 12px;
  --font-ui-small: 13px;
  --font-ui-medium: 14px;
  --font-text-size: 15px;
  --font-semibold: 600;
  --font-monospace: 'Consolas', 'Menlo', monospace;
`;

const DARK_VARS = `
  --background-primary: #1e1e1e;
  --background-primary-alt: #232323;
  --background-secondary: #262626;
  --background-modifier-hover: rgba(255, 255, 255, 0.075);
  --background-modifier-border: #3a3a3a;
  --background-modifier-form-field: #2a2a2a;
  --divider-color: #3a3a3a;
  --text-normal: #dcddde;
  --text-muted: #a3a6ab;
  --text-faint: #7a7d82;
  --text-accent: #6cb6ff;
  --text-accent-hover: #8ac6ff;
  --text-error: #ff8080;
  --text-warning: #e0b055;
  --text-on-accent: #ffffff;
  --interactive-accent: #3f7fbf;
  --interactive-accent-hover: #4d8fcf;
`;

const PAGE_CSS = `
  body { margin: 0; padding: 18px; background: #dfe1e5; font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif; }
  .stage { display: flex; flex-direction: column; gap: 18px; align-items: flex-start; }
  .stage-light { ${OBSIDIAN_VARS} background: #ffffff; padding: 16px; border-radius: 8px; }
  .stage-dark { ${DARK_VARS} background: #1e1e1e; padding: 16px; border-radius: 8px; }
  .stage h2 { font-size: 12px; color: #5b6270; margin: 0 0 10px; letter-spacing: 0.08em; text-transform: uppercase; }
  .modal { position: static; box-shadow: 0 8px 28px rgba(0, 0, 0, 0.18); background: var(--background-primary); color: var(--text-normal); border-radius: 8px; margin-bottom: 16px; }
  .modal-title { padding: 14px 18px 0; font-weight: 600; font-size: 16px; }
  .modal-content { padding: 12px 18px 18px; }
  .notice { display: flex; align-items: center; background: var(--background-primary); color: var(--text-normal); border: 1px solid var(--background-modifier-border); border-radius: 6px; padding: 10px 12px; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.10); max-width: 520px; }
`;

run('writes a static preview of the theme update dialog', () => {
  bootJsdom();

  const modal = new ThemeUpdateModal({} as never, {
    initial: RESULT,
    getLanguage: () => 'zh-CN',
    check: async () => ({ ok: true, result: RESULT }),
    apply: async () => ({ created: 0, overwritten: 0, failed: [], mismatched: [] }),
  });
  // onOpen() is what Obsidian calls; the mock Modal does not call it.
  modal.onOpen();

  const dialog = `<div class="modal wewrite-theme-update-modal">
      <div class="modal-title">${modal.titleEl.textContent ?? ''}</div>
      <div class="modal-content">${modal.contentEl.innerHTML}</div>
    </div>`;

  // setIcon() is a no-op in the test mock, so the warning glyph comes out as an
  // empty span. Injecting the character makes the row's vertical alignment —
  // the thing this preview exists to check — visible. Nothing else is altered.
  const withGlyphs = dialog.replace(
    /<span class="wewrite-theme-update-hint-icon"><\/span>/g,
    '<span class="wewrite-theme-update-hint-icon">\u26a0</span>',
  );

  const notice = `<div class="notice wewrite-theme-update-notice">
      <div class="wewrite-theme-update-notice-text">有 3 个主题可以更新</div>
      <button class="mod-cta wewrite-theme-update-notice-button">查看</button>
    </div>`;

  // The second step the download button leads to: the exact files being replaced.
  const confirm = new ThemeOverwriteConfirmModal({} as never, CHANGES.filter((c) => c.overwrites), () => {});
  confirm.onOpen();
  const confirmHtml = `<div class="modal wewrite-theme-update-confirm">
      <div class="modal-title">${confirm.titleEl.textContent ?? ''}</div>
      <div class="modal-content">${confirm.contentEl.innerHTML}</div>
    </div>`;

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>主题更新弹窗预览</title>
<link rel="stylesheet" href="../../styles.css">
<style>${PAGE_CSS}</style>
</head>
<body>
<div class="stage">
  <div class="stage-light">
    <h2>Light theme — update dialog</h2>
    ${withGlyphs}
    <h2>Light theme — overwrite confirmation</h2>
    ${confirmHtml}
    <h2>Light theme — startup notice</h2>
    ${notice}
  </div>
  <div class="stage-dark">
    <h2>Dark theme — update dialog</h2>
    ${withGlyphs}
    <h2>Dark theme — overwrite confirmation</h2>
    ${confirmHtml}
    <h2>Dark theme — startup notice</h2>
    ${notice}
  </div>
</div>
</body>
</html>`;

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, 'theme-update-modal.html');
  fs.writeFileSync(outPath, html, 'utf8');
  expect(fs.existsSync(outPath)).toBe(true);
});
