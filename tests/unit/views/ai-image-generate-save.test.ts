// 回归用例：编辑器内「AI 文生图 → 插入」的保存路径必须先保证 cache 目录存在。
//
// `vault.createBinary` 不会创建父目录 —— 桌面端表现为 ENOENT，移动端
// （Capacitor 文件层）表现为 "Parent folder doesn't exist"。该命令可以在普通
// Markdown 笔记里直接触发，不经过 WeWrite 图文视图，因此不能依赖
// `{wewriteFolder}/cache` 已被别的链路（prescanImages → ensureCacheDir、
// image-edit-modal、主题下载…）顺手建出来 —— 这条保证必须在写入前就地完成。
//
// `downloadAndSave()` 先 await `prepareCacheDir()` 再 `vault.createBinary()`，
// 所以这里对 prepareCacheDir 的断言即覆盖了「先建目录、再写文件」的顺序。

import { prepareCacheDir } from '../../../src/views/ai-image-generate-modal';

/** Minimal App double recording the ordered vault calls. */
function createAppHarness(preExisting: string[]) {
  const calls: string[] = [];
  const folders = new Set(preExisting);

  const app = {
    vault: {
      adapter: {
        exists: jest.fn(async (p: string) => folders.has(p)),
      },
      createFolder: jest.fn(async (p: string) => {
        calls.push(p);
        folders.add(p);
      }),
    },
  };
  return { app, calls, folders };
}

describe('AI 文生图保存：cache 目录前置保证', () => {
  it('目录不存在时逐级创建，并返回带尾斜杠的目录', async () => {
    const { app, calls } = createAppHarness([]);

    const dir = await prepareCacheDir(app as never, 'wewrite');

    expect(calls).toEqual(['wewrite', 'wewrite/cache']);
    expect(dir).toBe('wewrite/cache/');
  });

  it('目录已存在时不重复创建', async () => {
    const { app, calls } = createAppHarness(['wewrite', 'wewrite/cache']);

    const dir = await prepareCacheDir(app as never, 'wewrite');

    expect(calls).toEqual([]);
    expect(dir).toBe('wewrite/cache/');
  });

  it('只缺 cache 一层时只补这一层', async () => {
    const { app, calls } = createAppHarness(['wewrite']);

    await prepareCacheDir(app as never, 'wewrite');

    expect(calls).toEqual(['wewrite/cache']);
  });

  it('自定义 wewriteFolder（多级路径）同样逐级创建', async () => {
    const { app, calls } = createAppHarness([]);

    const dir = await prepareCacheDir(app as never, 'My Vault/WeWrite');

    expect(calls).toEqual(['My Vault', 'My Vault/WeWrite', 'My Vault/WeWrite/cache']);
    expect(dir).toBe('My Vault/WeWrite/cache/');
  });

  it('wewriteFolder 末尾带斜杠时不产生空路径段', async () => {
    // getWeWriteSubPath 会先去掉尾斜杠，所以不会出现 'wewrite//cache'。
    const { app, calls } = createAppHarness([]);

    const dir = await prepareCacheDir(app as never, 'wewrite/');

    expect(calls).toEqual(['wewrite', 'wewrite/cache']);
    expect(dir).toBe('wewrite/cache/');
  });
});

