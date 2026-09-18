// build.mjs — 把六个分片写成 SVG 文件，并产出一份 data.json 给对比页用。
// 运行：node icon-redesign/_src/build.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PART_A } from './part-a.mjs';
import { PART_B } from './part-b.mjs';
import { PART_C } from './part-c.mjs';
import { PART_D } from './part-d.mjs';
import { PART_E } from './part-e.mjs';
import { PART_F } from './part-f.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const OLD_DIR = path.join(ROOT, 'src', 'resources', 'icons');
const OUT_DIR = path.join(ROOT, 'icon-redesign', 'icons');

/** 展示顺序 + 分组。id 必须与 src/core/icon-registry.ts 完全一致。 */
const GROUPS = [
  ['视图与品牌', ['wewrite-mark', 'wewrite-news', 'wewrite-newspic', 'wewrite-theme', 'wewrite-material', 'wewrite-publish', 'wewrite-copy', 'wewrite-ai-generate']],
  ['推文设置标签页', ['wewrite-account', 'wewrite-digest', 'wewrite-cover', 'wewrite-link', 'wewrite-settings', 'wewrite-device', 'wewrite-zoom', 'wewrite-refresh', 'wewrite-crop', 'wewrite-compose']],
  ['主题编辑器工具栏', ['wewrite-save', 'wewrite-undo', 'wewrite-redo', 'wewrite-panel', 'wewrite-new-theme', 'wewrite-code']],
  ['素材库工具条', ['wewrite-gallery', 'wewrite-draft', 'wewrite-multiselect', 'wewrite-select-all', 'wewrite-cancel', 'wewrite-trash']],
  ['同步', ['wewrite-sync']],
  ['图片插入', ['wewrite-image-vault', 'wewrite-image-system']],
  ['AI 文本命令', ['wewrite-proofread', 'wewrite-synonyms', 'wewrite-translate', 'wewrite-math', 'wewrite-mermaid']],
];

/** 借用 Obsidian 内置图标表达 WeWrite 语义的 5 处——不在本套 SVG 里，但要一并决策。 */
const BUILTIN_SWAPS = [
  { where: '封面区域右键「从仓库选择」', now: 'folder-search', want: 'wewrite-image-vault', why: '同一场景的编辑器菜单里已经用的是 WeWrite 版，右键菜单却是内置图标，一次操作里出现两套语汇。' },
  { where: '封面区域右键「从系统选择」', now: 'image-file', want: 'wewrite-image-system', why: '同上；而且 image-file 是一张「文件」，读不出「从系统取图」。' },
  { where: '图片右键「裁剪 4:3」', now: 'scissors', want: 'wewrite-crop', why: '插件自己就有 wewrite-crop，且图片编辑弹窗用的就是它——同一个动作用了两个符号。' },
  { where: '设置页「测试连接」', now: 'plug-zap', want: 'wewrite-link', why: 'WebDAV 连通性测试，与同步菜单里的「测试连接」是同一件事，那边用的就是 wewrite-link。' },
  { where: '设置页公告 / What\'s New 入口', now: 'megaphone', want: 'wewrite-digest', why: '命令面板里「更新摘要」用的是 wewrite-digest，设置页却用喇叭，同一个入口两个符号。' },
];

const ALL = [...PART_A, ...PART_B, ...PART_C, ...PART_D, ...PART_E, ...PART_F];
const problems = [];

if (ALL.length !== 38) problems.push(`新图标数量 ${ALL.length}，应为 38`);
const ids = new Set(ALL.map((e) => e.id));
if (ids.size !== ALL.length) problems.push('存在重复 id');

const grouped = new Set(GROUPS.flatMap(([, list]) => list));
for (const id of ids) if (!grouped.has(id)) problems.push(`未分组：${id}`);
for (const g of grouped) if (!ids.has(g)) problems.push(`分组里有未定义的 id：${g}`);

const oldFiles = fs.readdirSync(OLD_DIR).filter((f) => f.endsWith('.svg'));
for (const f of oldFiles) {
  if (!ids.has(path.basename(f, '.svg'))) problems.push(`旧图标没有对应新设计：${f}`);
}

if (problems.length) {
  console.error('校验未通过：\n  - ' + problems.join('\n  - '));
  process.exit(1);
}

/** 去掉注释与固定尺寸，交给页面 CSS 控制大小。 */
function clean(svg) {
  return svg
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/<svg([^>]*)>/, (_m, attrs) =>
      '<svg' + attrs.replace(/\s(?:width|height)="[^"]*"/g, '') + '>'
    );
}

const rows = [];
for (const [group, list] of GROUPS) {
  for (const id of list) {
    const entry = ALL.find((e) => e.id === id);
    const oldRaw = fs.readFileSync(path.join(OLD_DIR, `${id}.svg`), 'utf8');
    fs.writeFileSync(path.join(OUT_DIR, `${id}.svg`), entry.svg, 'utf8');
    rows.push({
      id,
      group,
      name: entry.name,
      scope: entry.scope,
      changed: entry.changed,
      note: entry.note,
      old: clean(oldRaw),
      next: clean(entry.svg),
    });
  }
}

fs.writeFileSync(
  path.join(HERE, 'data.json'),
  JSON.stringify({ rows, builtinSwaps: BUILTIN_SWAPS }, null, 1),
  'utf8'
);

const tally = rows.reduce((acc, r) => ((acc[r.changed] = (acc[r.changed] || 0) + 1), acc), {});
console.log(`写入 ${rows.length} 个 SVG -> icon-redesign/icons/`);
console.log('改动级别统计：', tally);
