/**
 * Assets Manager
 * 
 * - manages the assets for WeChat MP platform, including:
 *  - thumbnails from WeChat
 *  - images, videos, audios, etc from WeChat.
 *  - local meida and images
 *  - icons
 *  - svgs
 *  - excalidraw
 *  - mermaid
 *  - admonitions
 *  - LaTeX
 * 
 * 
 * - tracking the mapping between local and remote assets
 * - sync the assets with remote, upload.
 * - for replacing links during markdown rendering 
 */

import { App, Notice, sanitizeHTMLToDom } from "obsidian";
import WeWritePlugin from "src/main";
import { assetsStorage } from "src/utils/storage";
import { areObjectsEqual } from "src/utils/utils";
import { getErrorMessage } from "src/wechat-api/error-code";
import { ConfirmDeleteModal } from "src/modals/confirm-delete-modal";
import { ConfirmPublishModal } from "src/modals/confirm-publish-modal";
import { DraftItem, MaterialItem, MaterialMeidaItem, MaterialNewsItem, MediaType, NewsItem } from "src/wechat-api/wechat-types";
import { StorageInterface } from "src/utils/storage";
import { $t } from "src/lang/i18n";
export const MediaTypeLable = new Map([
    ['image', $t('assets.image')],
    ['voice', $t('assets.voice')],
    ['video', $t('assets.video')],
    ['news', $t('assets.news')],
    ['draft', $t('assets.draft')]
]);

type DeletableMaterialItem = MaterialItem & {
    _deleted?: boolean;
}

type ASSETS = {
    images: Array<MaterialMeidaItem>,
    videos: Array<MaterialMeidaItem>
    voices: Array<MaterialMeidaItem>
    news: Array<MaterialNewsItem>
    drafts: Array<DraftItem>
}
const MAX_COUNT = 20;
export const initAssetsDB = () => {
	return assetsStorage;
}
export class AssetsManager {
    app: App;
    assets: Map<string, any[]>
    db: StorageInterface;
    used: Map<string, string[]>
    confirmPublishModal: ConfirmPublishModal | undefined;
    confirmDeleteModal: ConfirmDeleteModal | undefined;


    private static instance: AssetsManager;
    private plugin: WeWritePlugin;
    constructor(app: App, plugin: WeWritePlugin) {
        this.app = app;
        this.plugin = plugin
        this.assets = new Map()
        this.used = new Map()
        this.db = initAssetsDB()

        this.plugin.messageService!.registerListener('wechat-account-changed', (data: string) => {
            this.loadMaterial(data)
        })
        this.plugin.messageService!.registerListener('delete-media-item', (item: MaterialItem) => {
            this.confirmDelete(item)
        })
        this.plugin.messageService!.registerListener('delete-draft-item', (item: MaterialItem) => {
            this.confirmDelete(item)
        })
        this.plugin.messageService!.registerListener('image-item-updated', (item: MaterialItem) => {
            this.addImageItem(item)
        })
        this.plugin.messageService!.registerListener('draft-item-updated', (item: MaterialItem) => {
            this.addImageItem(item)
        })
        this.plugin.messageService!.registerListener('publish-draft-item', async (item: DraftItem) => {
            this.confirmPublish(item)
        })
        this.plugin.messageService!.registerListener('delete-media-item', async (item: MaterialItem) => {
            this.confirmDelete(item)
        })

    }
    addImageItem(item: MaterialItem) {
        this.assets.get('image')?.push(item)
    }
    addDraftItem(item: MaterialItem) {
        this.assets.get('draft')?.push(item)
        this.scanDraftNewsUsedImages()
    }
    public static getInstance(app: App, plugin: WeWritePlugin): AssetsManager {
        if (!AssetsManager.instance) {
            AssetsManager.instance = new AssetsManager(app, plugin);
        }
        return AssetsManager.instance;
    }
    
    public async loadMaterial(accountName: string) {
        const types: MediaType[] = [
            'draft', 'image', 'video', 'voice', 'news'
        ];
        for (const type of types) {
            this.plugin.messageService!.sendMessage(`clear-${type}-list`, null)
            const list = await this.getAllMeterialOfTypeFromDB(accountName, type)
            this.assets.set(type, list)
            list.forEach(item => {
                this.plugin.messageService!.sendMessage(`${type}-item-updated`, item)
            });
        }
        this.scanDraftNewsUsedImages()
    }
    public async pullAllMaterial(accountName: string) {
        const json = await this.plugin.wechatClient!.getMaterialCounts(accountName)

        const types: MediaType[] = [
            'draft', 'image', 'video', 'voice', 'news'
        ];
        for (const type of types) {
            this.plugin.messageService!.sendMessage(`clear-${type}-list`, null)
            this.getAllMaterialOfType(type, (item) => { this.plugin.messageService!.sendMessage(`${type}-item-updated`, item) }, accountName)
        }
        this.plugin.assetsUpdated()
    }

    public async getAllNews(callback: (newsItems: MaterialNewsItem) => void, accountName: string | undefined) {
        const list = []
        let offset = 0;
        let total = MAX_COUNT;
        while (offset < total) {
            const json = await this.plugin.wechatClient!.getBatchMaterial(accountName, 'news', offset, MAX_COUNT);
            const { errcode, item, total_count, item_count } = json;
            if (errcode !== undefined && errcode !== 0) {
                new Notice(getErrorMessage(errcode), 0)
                break;
            }
            list.push(...item);
            total = total_count
            offset += item_count;
        }
        this.assets.set('news', list)
        list.forEach((item: MaterialNewsItem) => {
            item.accountName = accountName
            item.type = 'news'

            this.pushMaterailToDB(item)
            if (callback) {
                callback(item)
            }
        })
        this.scanDraftNewsUsedImages()
    }
    public async getAllDrafts(callback: (newsItem: DraftItem) => void, accountName: string | undefined) {
        const draftList = []
        let offset = 0;
        let total = MAX_COUNT;
        while (offset < total) {
            const json = await this.plugin.wechatClient!.getBatchDraftList(accountName, offset, MAX_COUNT);
            const { errcode, item, total_count, item_count } = json;
            if (errcode !== undefined && errcode !== 0) {
                new Notice(getErrorMessage(errcode), 0)
                break;
            }
            draftList.push(...item);
            total = total_count
            offset += item_count;


        }
        draftList.sort((a, b) => {
            return b.update_time - a.update_time
        })
        this.assets.set('draft', draftList)
        await this.removeMediaItemsFromDB('draft')
        draftList.forEach((i: DraftItem) => {
            i.accountName = accountName
            i.type = 'draft'
            if (callback) {
                callback(i)
            }
            this.pushMaterailToDB(i)
        })
        this.scanDraftNewsUsedImages()
    }
    public async getAllMaterialOfType(type: MediaType, callback: (item: MaterialItem) => void, accountName: string | undefined) {
        if (type === 'news') {
            return await this.getAllNews(callback, accountName);
        }
        if (type === 'draft') {
            return await this.getAllDrafts(callback, accountName);
        }
        const list = []
        let offset = 0;
        let total = MAX_COUNT;
        while (offset < total) {
            const json = await this.plugin.wechatClient!.getBatchMaterial(accountName, type, offset, MAX_COUNT);
            const { errcode, item, total_count, item_count } = json;
            if (errcode !== undefined && errcode !== 0) {
                new Notice(getErrorMessage(errcode), 0)
                break;
            }
            list.push(...item);
            total = total_count
            offset += item_count;

        }
        list.sort((a, b) => {
            return b.update_time - a.update_time
        })

        this.assets.set(type, list)
        await this.removeMediaItemsFromDB(type)
        list.forEach((item: MaterialItem) => {
            item.accountName = accountName
            item.type = type
            if (callback) {
                callback(item)
            }
            this.pushMaterailToDB(item)
        })
    }
    public getImageUsedUrl(imgItem: any) {

        let urls = null
        if (imgItem.url !== undefined && imgItem.url) {
            const urlUrls = this.used.get(imgItem.url)
            if (urlUrls !== undefined) {
                urls = urlUrls
            }
        }
        if (imgItem.media_id !== undefined && imgItem.media_id) {
            const idUrls = this.used.get(imgItem.media_id)
            if (idUrls !== undefined) {
                if (urls === null) {
                    urls = idUrls
                } else {
                    urls = urls.concat(idUrls)
                }
            }
        }
        return urls
    }
    public scanUsedImage(type: MediaType) {

        // Process news items
        const newsItems = this.assets.get(type) || [];
        newsItems.forEach(news => {
            news.content.news_item.forEach((item: NewsItem) => {
                if (item.thumb_media_id) {
                    this.setUsed(item.thumb_media_id, item.url);
                }
                this.scanUsedImageInContent(item.content, item.url)
            });
        });
    }
    public scanDraftNewsUsedImages() {
        // Clear existing used media map
        this.used.clear();
        this.scanUsedImage('draft')
        this.scanUsedImage('news')
    }
    public setUsed(media_id: string, url: string) {
        let v = this.used.get(media_id)
        if (v === undefined) {
            v = []
        }
        v.push(url)
        this.used.set(media_id, v)
    }
    public unUsed(media_id: string, url: string) {
        let v = this.used.get(media_id)
        if (v === undefined) {
            return
        }
        v = v.filter(i => i !== url)
        this.used.set(media_id, v)
    }
    public updateUsed(url: string) {
        Array.from(this.used.entries()).forEach(([media_id, urls]) => {
            urls = urls.filter(i => i !== url)
            this.used.set(media_id, urls)
        });
    }
    public scanUsedImageInContent(content: string, url: string) {

        const dom = sanitizeHTMLToDom(content)
        const imgs = dom.querySelectorAll('img')
        imgs.forEach(img => {
            const data_src = img.getAttribute('data-src')

            if (data_src !== null) {
                this.setUsed(data_src, url)
            }
        })
    }

    async fetchAllMeterialOfTypeFromDB(accountName: string, type: MediaType): Promise<MaterialItem[]> {
        return new Promise((resolve) => {

            this.db.find({
                selector: {
                    accountName: { $eq: accountName },
                    type: { $eq: type }
                }
            }).then((result: any) => {
                resolve(result.docs as Array<MaterialItem>)
            }).catch((err) => {
                console.error(err);
                resolve([])
            })

        })
    }
    async pushMaterailToDB(doc: MaterialItem): Promise<void> {
        return new Promise((resolve) => {
            if (doc._id === undefined) {
                doc._id = doc.media_id
            }

            this.db.get(doc._id).then(existedDoc => {
                if (areObjectsEqual(doc, existedDoc)) {
                    // the material has not been changed
                    resolve()
                } else {
                    doc._rev = existedDoc._rev;
                    this.db.put(doc)
                        .then(() => {
                            resolve();
                        })
                        .catch((error: any) => {
                            console.error('Error saving material:', error);
                            resolve()
                        });
                }
            }).catch(error => {
                this.db.put(doc).then(() => {
                    resolve()
                }).catch((err) => {
                    console.error(err);
                    resolve()
                })
                resolve()
            })
        })
    }
    async AllMeterialOfTypeFromDB(media_id: string): Promise<MaterialItem[]> {
        return new Promise((resolve) => {
            this.db.find({
                selector: {
                    mediea_id: { $eq: media_id }
                }
            }).then((result: any) => {
                resolve(result.docs as Array<MaterialItem>)
            }).catch((err) => {
                console.error(err);
                resolve([])
            })
        })
    }
    async getAllMeterialOfTypeFromDB(accountName: string, type: string): Promise<MaterialItem[]> {
        return new Promise(async (resolve) => {

            const pageSize = 10; 
            let offset = 0; 
            let total = 10; 
            const items: Array<MaterialItem> = []
            if (accountName === undefined || !accountName) {
                resolve(items)
                return
            }
            while (true) {
                const result = await this.db.find({
                    selector: {
                        accountName: { $eq: accountName },
                        type: { $eq: type }
                    },
                    limit: pageSize,
                    skip: offset
                });

                const docs = result as Array<MaterialItem>;
                if (docs.length === 0) {
                    break; 
                }

                items.push(...docs)

                offset += docs.length;
            }
            items.sort((a, b) => {
                return b.update_time - a.update_time
            })
            resolve(items)
        })
    }
    findUrlOfMediaId(type: MediaType, media_id: string) {
        const list = this.assets.get(type)
        if (list !== undefined) {
            const m = list.find(item => item.media_id === media_id)

            if (m !== undefined) {
                return m.url
            }
        }
    }
    findMediaIdOfUrl(type: MediaType, url: string) {
        const list = this.assets.get(type)
        if (list !== undefined) {
            const m = list.find(item => item.url === url)

            if (m !== undefined) {
                return m.media_id
            }
        }
    }

    getMaterialPanels(): MaterialPanelItem[] {
        const panels: MaterialPanelItem[] = [];

        // Get all material types and map to panel items
        const types: MediaType[] = [
            'draft', 'image', 'video', 'voice', 'news'
        ];
        types.forEach(type => {
            panels.push({
                name: MediaTypeLable.get(type)!,
                type: type,
                timestamp: Date.now(),
                url: ''
            });
        });

        return panels;
    }
    async removeMediaItemsFromDB(type: MediaType) {
        const accountName = this.plugin.settings!.selectedMPAccount;
        await this.db.find({
            selector: {
                accountName: { $eq: accountName },
                type: { $eq: type }
            }
        }).then((result: any) => {
            const docsToDelete = result.map((doc: DeletableMaterialItem) => {
                doc._deleted = true; // Mark the document for deletion
                return doc;
            });

            // Perform bulk deletion
            return this.db.bulkDocs(docsToDelete);
        }).then((result) => {
        }).catch((err) => {
            console.error('Error deleting documents:', err);
        });
    }
    public async deleteMediaItem(item: MaterialItem) {
        const type = item.type
        if (type === undefined) {
            console.error('deleteMediaItem type is undefined', item)
            return;
        }
        if (!await this.plugin.wechatClient!.deleteMedia(item.media_id)) {
            console.error('delete media failed', item)
            return false;
        }
        await this.removeDocFromDB(item._id!)
        this.plugin.messageService!.sendMessage(`${type}-item-deleted`, item)
        if ('url' in item && item.url) {
            this.updateUsed(item.url)
        }
        return true
    }
    public async deleteDraftItem(item: MaterialItem) {
        if (!await this.plugin.wechatClient!.deleteDraft(item.media_id)) {
            console.error('delete draft failed', item)
            return false;
        }
        if (item._id) {
            this.removeDocFromDB(item._id)
        }
        this.plugin.messageService!.sendMessage('draft-item-deleted', item)
        if ('url' in item && item.url) {
            this.updateUsed(item.url)
        }
        return true;
    }
    public async removeDocFromDB(_id: string) {
        await this.db.get(_id).then((doc) => {
            return this.db.remove(doc);
        })
            .then((result) => {
            })
            .catch((err) => {
                console.error('Error deleting document:', err);
            });

    }
    confirmPublish(item: DraftItem) {
        if (this.confirmPublishModal === undefined) {
            this.confirmPublishModal = new ConfirmPublishModal(this.plugin, item)
        } else {
            this.confirmPublishModal.update(item)
        }
        this.confirmPublishModal.open()
    }
    confirmDelete(item: MaterialItem) {
        let callback: (item: MaterialItem) => Promise<boolean | undefined> = this.deleteMediaItem.bind(this)
        if (item.type === 'draft') {
            callback = this.deleteDraftItem.bind(this)
        }

        if (this.confirmDeleteModal === undefined) {
            this.confirmDeleteModal = new ConfirmDeleteModal(this.plugin, item, callback)

        } else {
            this.confirmDeleteModal.update(item, callback)
        }

        this.confirmDeleteModal.open()
    }
}

export interface MaterialPanelItem {
    name: string;
    type: MediaType;
    timestamp: number;
    url: string;
}