/**
 * the panel to show wechat materials
 */
import { Menu, Notice, setIcon } from "obsidian";
import { AssetsManager } from "src/assets/assets-manager";
import { $t } from "src/lang/i18n";
import WeWritePlugin from "src/main";
import { MaterialMeidaItem, MediaType } from "src/wechat-api/wechat-types";

interface REROUCE_ITEM {
	item: MaterialMeidaItem;
	el: HTMLElement;
}

export class MaterialPanel {
	public name: string;
	public containerEl: HTMLElement;
	public timestamp: number | undefined;
	private container: HTMLElement;
	private header: HTMLElement;
	private content: HTMLElement;
	private titleSpan: HTMLSpanElement;
	private totalSpan: HTMLSpanElement;
	private refreshButton: HTMLElement;
	private plugin: WeWritePlugin;
	public type: MediaType;
	private items: REROUCE_ITEM[] = [];

	constructor(plugin: WeWritePlugin, parent: HTMLElement, title: string, type: MediaType) {
		this.plugin = plugin;
		this.type = type;
		this.name = title;
		this.container = parent.createDiv({ cls: 'wewrite-material-panel-container' });
		this.containerEl = this.container;
		this.header = parent.createDiv({ cls: 'wewrite-material-panel-header' });
		this.refreshButton = this.header.createEl('i', { cls: 'refresh-material-button' });
		this.titleSpan = this.header.createSpan({ cls: 'wewrite-material-panel-title' });
		this.totalSpan = this.header.createSpan({ cls: 'wewrite-material-panel-total' });

		this.content = parent.createDiv({ cls: 'wewrite-material-panel-content', text: 'content' });
		setIcon(this.refreshButton, 'folder-sync')



		this.titleSpan.textContent = title;
		this.totalSpan.textContent = '0';

		this.container.appendChild(this.header);
		this.container.appendChild(this.content);

		this.refreshButton.addEventListener('click', () => this.refreshContent());
		this.initContent()

		this.plugin.messageService!.registerListener(`clear-${this.type}-list`, () => {
			this.clearContent()
		})
		this.plugin.messageService!.registerListener(`${this.type}-item-updated`, (item) => {
			this.addItem(item)
		})
		this.plugin.messageService!.registerListener(`${this.type}-item-deleted`, (item) => {
			this.removeItem(item)
		})
		if (this.type === 'image') {
			this.plugin.messageService!.registerListener(`image-used-updated`, (item) => {
				this.updateItemUsed(item)
			})
		}
	}
	getLocalItems() {
		const list = this.plugin.assetsManager!.assets.get(this.type)

		if (list !== undefined) {
			list.forEach((item) => {

				this.addItem(item)
			})
		}
	}
	async refreshContent(): Promise<any> {
		this.content.empty();
		this.items = []
		this.setTotal(0);

		if (this.type === 'draft') {

			return await this.plugin.assetsManager!.getAllDrafts((item) => {
				this.addItem(item)
			}, this.plugin.settings!.selectedMPAccount)
		}
		await this.plugin.assetsManager!.getAllMaterialOfType(this.type, (item) => {
			this.addItem(item)
		}, this.plugin.settings!.selectedMPAccount)

	}
	showContextMenu(mediaItem: MaterialMeidaItem, event: MouseEvent) {
		const menu = new Menu();

		if (mediaItem.type === 'image') {
			const urls = AssetsManager.getInstance(this.plugin.app, this.plugin).getImageUsedUrl(mediaItem)
			if (urls === null || urls === undefined) {
				menu.addItem((item) => {
					item.setTitle($t('views.delete-image'))
						.setIcon('image-minus')
						.setDisabled(mediaItem.used)
						.onClick(() => {
							this.plugin.messageService!.sendMessage("delete-media-item", mediaItem)
						});
				});
			} else {

			}

			//set as cover image
			menu.addItem((item) => {
				item.setTitle($t('set-as-cover-of-current-draft'))
					.setIcon('image-plus')
					.onClick(() => {
						new Notice($t('set-cover-tu-pian-mediaitemname', [mediaItem.name]));
						this.plugin.messageService!.sendMessage("set-image-as-cover", mediaItem)
					});
			});
		}

		// voice and video
		if (mediaItem.type === 'voice' || mediaItem.type === 'video') {
			if (!mediaItem.used) {

				menu.addItem((item) => {
					item.setTitle('delete')
						.setIcon('eye')
						.setDisabled(mediaItem.used)
						.onClick(() => {
							this.plugin.messageService!.sendMessage("delete-media-item", mediaItem)
						});
				});
			}

		}

		if (mediaItem.type === 'draft') {
			menu.addItem((item) => {
				item.setTitle($t('views.delete-draft'))
					.setIcon('trash-2')
					.onClick(async () => {
						this.plugin.messageService!.sendMessage("delete-draft-item", mediaItem)
					});
			});
			menu.addItem((item) => {
				item.setTitle($t('views.free-publish'))
					.setIcon('send')
					.onClick(async () => {
						this.plugin.messageService!.sendMessage("publish-draft-item", mediaItem)
					});
			});
			menu.addItem((item) => {
				item.setTitle($t('views.preview-draft'))
					.setIcon('eye')
					.onClick(async () => {
						this.plugin.wechatClient!.senfForPreview(mediaItem.media_id, this.plugin.settings!.previewer_wxname, this.plugin.settings!.selectedMPAccount)

					});
			});
			menu.addItem((item) => {
				item.setTitle($t('views.send-mass-message'))
					.setIcon('send')
					.onClick(async () => {
						this.plugin.wechatClient!.massSendAll(mediaItem.media_id, this.plugin.settings!.selectedMPAccount)

					});
			});
		}

		menu.showAtPosition({ x: event.clientX, y: event.clientY });
	}

	public getElement(): HTMLElement {
		return this.container;
	}
	setTotal(total: number) {
		this.totalSpan.textContent = `[${total.toString()}]`;
	}
	setTitle(title: string) {
		this.titleSpan.textContent = title;
	}
	updateItems(items: []) {

	}
	clearContent() {
		this.items = [];
		this.content.empty();
		this.setTotal(0);

	}

	isItemExist(item: any) {
		return this.items.some((i) => {
			return i.item.media_id === item.media_id
		})
	}
	addItem(item: any) {
		if (this.isItemExist(item)) {
			return
		}
		const itemDiv = this.content.createDiv({ cls: 'wewrite-material-panel-item' });


		this.items.push({ item: item, el: itemDiv });
		this.content.appendChild(itemDiv);


		if (this.type === 'draft' || this.type === 'news') {
			let title = item.content.news_item[0].title
			if (title === undefined || !title) {
				title = $t('views.no-title-article')
			}
			//itemDiv.innerHTML = `<a href=${item.content.news_item[0].url}> ${title}</a>`
			const link = itemDiv.createEl('a', { href: item.content.news_item[0].url })
			link.text = title
			itemDiv.addEventListener('click', () => { })
			itemDiv.addClass("draft-news-item")
		} else if (this.type === 'image') {
			//   itemDiv.innerHTML = '<img src="' + item.url + '" alt="' + item.name + '" />'
			const img = itemDiv.createEl('img')
			img.src = item.url
			img.alt = item.name
			itemDiv.addEventListener('click', () => {
			})
		} else if (this.type === 'video') {
			const video = itemDiv.createEl('video', { cls: 'draft-video-item' })
			video.setAttribute('controls', 'controls')
			video.setAttribute('poster', item.cover_url)
			const wechatClient = this.plugin.wechatClient
			wechatClient!.getMaterialById(item.media_id).then(video_info => {
				const source = video.createEl('source', { type: 'video/mp4' })
				source.setAttribute('src', video_info.down_url)
				video.appendChild(source)
			})
		} else if (this.type === 'voice') {
			itemDiv.innerHTML = '<audio src="' + item.url + '" controls></audio>'
		} else {
			console.error($t('views.other-type-has-not-been-implemented'), + this.type);

		}
		this.setTotal(this.items.length)

		itemDiv.addEventListener('contextmenu', (event) => {
			event.preventDefault();
			this.showContextMenu(item, event)
		})
	}
	updateItemUsed(item: any) {
		const old_item = this.items.find((i) => {
			return i.item.media_id === item.media_id
		})
		if (old_item !== undefined && old_item !== null) {
			old_item.item.used = item.used
		} else {
			this.addItem(item)
		}
	}
	removeItem(item: any) {
		const index = this.items.findIndex((i) => {
			return i.item.media_id === item.media_id

		})

		if (index !== -1) {
			this.items[index].el.remove();
			this.items.splice(index, 1)
		}
		this.setTotal(this.items.length)
	}

	removeItemsByAttributes(attributes: Partial<MaterialMeidaItem>) {
		const itemsToRemove = this.items.filter(i => {
			return Object.entries(attributes).every(([key, value]) => {
				const itemKey = key as keyof MaterialMeidaItem;
				return i.item[itemKey] === value;
			});
		});

		itemsToRemove.forEach(item => {
			item.el.parentElement?.removeChild(item.el);
			const index = this.items.indexOf(item);
			if (index !== -1) {
				this.items.splice(index, 1);
			}
		});

		this.setTotal(this.items.length);
		return itemsToRemove.length;
	}
	async initContent(): Promise<any> {
		this.content.empty();
		this.setTotal(0);

		const items = this.plugin.assetsManager!.assets.get(this.type)
		if (items === undefined || items === null) {
			return;
		}
		items.forEach((item: any) => {
			this.addItem(item)
		})
	}
}
