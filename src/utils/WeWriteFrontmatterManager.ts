import { App, TFile, MetadataCache } from 'obsidian';

// 定义所有可用的属性键（常量，避免拼写错误）
export const WE_WRITE_KEYS = {
    TITLE: 'wewrite-title',
    SUMMARY: 'wewrite-summary',
    COVER_IMAGE: 'wewrite-cover-image',
    COVER_PARAM: 'wewrite-cover-param',
    COMMENT_PRIVILEGE: 'wewrite-comment-privilege',
    COMMENT_SWITCH: 'wewrite-comment-switch',
    AUTHOR: 'wewrite-author',
    RENDER_STYLE: 'wewrite-render-style',
} as const;

export type WeWriteKey = typeof WE_WRITE_KEYS[keyof typeof WE_WRITE_KEYS];

export interface WeWriteFrontmatter {
    [WE_WRITE_KEYS.TITLE]?: string;
    [WE_WRITE_KEYS.SUMMARY]?: string;
    [WE_WRITE_KEYS.COVER_IMAGE]?: string;
    [WE_WRITE_KEYS.COVER_PARAM]?: string | Record<string, any>;
    [WE_WRITE_KEYS.COMMENT_PRIVILEGE]?: 'public' | 'private' | 'follow';
    [WE_WRITE_KEYS.COMMENT_SWITCH]?: boolean;
    [WE_WRITE_KEYS.AUTHOR]?: string;
    [WE_WRITE_KEYS.RENDER_STYLE]?: string;
}

type OnChangeCallback = (file: TFile, changedKeys: WeWriteKey[], newData: WeWriteFrontmatter) => void;

export class WeWriteFrontmatterManager {
    private app: App;
    private metadataCache: MetadataCache;
    private snapshotMap: WeakMap<TFile, WeWriteFrontmatter> = new WeakMap();
    private callbacks: Set<OnChangeCallback> = new Set();
    // 修正：事件处理器接受可变参数，并提取第一个参数作为文件
    private boundHandler: (...args: unknown[]) => void;

    constructor(app: App) {
        this.app = app;
        this.metadataCache = app.metadataCache;
        this.boundHandler = this.handleMetadataChange.bind(this);
        this.registerEvent();
    }

    private registerEvent() {
        // 使用 'changed' 事件，Obsidian 官方事件名
        this.metadataCache.on('changed', this.boundHandler);
    }

    // 修正：参数改为可变参数，从 args[0] 获取 TFile
    private handleMetadataChange(...args: unknown[]) {
        const file = args[0];
        // 类型守卫：确保是 TFile 实例
        if (!(file instanceof TFile)) {
            return;
        }

        const currentData = this.getWeWriteSubset(file);
        const previousData = this.snapshotMap.get(file) || {};

        const changedKeys: WeWriteKey[] = [];
        const allKeys = Object.values(WE_WRITE_KEYS) as WeWriteKey[];

        for (const key of allKeys) {
            const oldVal = previousData[key];
            const newVal = currentData[key];
            if (oldVal !== newVal) {
                changedKeys.push(key);
            }
        }

        if (changedKeys.length > 0) {
            this.callbacks.forEach(cb => {
                try {
                    cb(file, changedKeys, currentData);
                } catch (e) {
                    console.error('Error in WeWriteFrontmatterManager callback', e);
                }
            });
            this.snapshotMap.set(file, currentData);
        } else {
            if (!this.snapshotMap.has(file)) {
                this.snapshotMap.set(file, currentData);
            }
        }
    }

    private getWeWriteSubset(file: TFile): WeWriteFrontmatter {
        const cache = this.metadataCache.getFileCache(file);
        const fm = cache?.frontmatter || {};
        const subset: WeWriteFrontmatter = {};
        for (const key of Object.values(WE_WRITE_KEYS)) {
            if (fm[key] !== undefined) {
                subset[key] = fm[key];
            }
        }
        return subset;
    }

    // 公开方法：获取完整的 wewrite frontmatter
    public get(file: TFile): WeWriteFrontmatter {
        const cache = this.metadataCache.getFileCache(file);
        const fm = cache?.frontmatter || {};
        const result: WeWriteFrontmatter = {};
        for (const key of Object.values(WE_WRITE_KEYS)) {
            result[key] = fm[key];
        }
        return result;
    }

    public getEffectiveTitle(file: TFile): string {
        const custom = this.get(file)[WE_WRITE_KEYS.TITLE];
        if (custom && custom.trim() !== '') {
            return custom;
        }
        return file.basename;
    }

    public async set(file: TFile, key: WeWriteKey, value: any): Promise<void> {
        await this.app.fileManager.processFrontMatter(file, (fm) => {
            if (value === undefined || value === null) {
                delete fm[key];
            } else {
                fm[key] = value;
            }
        });
    }

    public async batchSet(file: TFile, updates: Partial<WeWriteFrontmatter>): Promise<void> {
        await this.app.fileManager.processFrontMatter(file, (fm) => {
            for (const [key, val] of Object.entries(updates)) {
                if (val === undefined || val === null) {
                    delete fm[key];
                } else {
                    fm[key] = val;
                }
            }
        });
    }

    public async remove(file: TFile, key: WeWriteKey): Promise<void> {
        await this.set(file, key, undefined);
    }

    public onChange(callback: OnChangeCallback): () => void {
        this.callbacks.add(callback);
        return () => {
            this.callbacks.delete(callback);
        };
    }

    // 清理事件监听
    public unload(): void {
        this.metadataCache.off('changed', this.boundHandler);
        this.callbacks.clear();
    }
}