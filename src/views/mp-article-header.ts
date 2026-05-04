/**
 *  WeChat MP Article Header settings
 */
import {
	arrayBufferToBase64,
	Notice,
	Setting,
	TextComponent,
	TFile,
	ToggleComponent,
} from "obsidian";
import { LocalDraftItem, LocalDraftManager } from "src/assets/draft-manager";
import WeWritePlugin from "src/main";
import { UrlUtils } from "src/utils/urls";
import { fetchImageBlob } from "src/utils/utils";
import { WechatClient } from "src/wechat-api/wechat-client";
import { MaterialMeidaItem } from "src/wechat-api/wechat-types";
import { ImageGenerateModal } from "../modals/image-generate-modal";
import { ResourceManager } from "src/assets/resource-manager";

import { $t } from "src/lang/i18n";
import { validateAndConvertImage } from "src/utils/image-utils";

export class MPArticleHeader {
	updateDraftDraftId(media_id: any) {
		if (this.activeLocalDraft !== undefined) {
			this.activeLocalDraft.last_draft_id = media_id;
		}
	}

	private plugin: WeWritePlugin;
	private cover_image: string | null = null;
	private coverFrame: HTMLElement | undefined;
	private activeLocalDraft: LocalDraftItem | undefined;
	private localDraftmanager: LocalDraftManager;
	private _title: TextComponent | undefined;
	private _author: TextComponent | undefined;
	private _digest: HTMLTextAreaElement | undefined;
	private _needOpenComment: ToggleComponent | undefined;
	private _onlyFansCanComment: ToggleComponent | undefined;
	private imageGenerateModal: ImageGenerateModal | undefined;
	constructor(plugin: WeWritePlugin, containerEl: HTMLElement) {
		this.plugin = plugin;
		this.localDraftmanager = LocalDraftManager.getInstance(plugin);
		this.BuildUI(containerEl);
		this.plugin.messageService?.registerListener(
			"wechat-account-changed",
			(data: string) => {
				this.updateLocalDraft();
			}
		);

		this.plugin.messageService?.registerListener(
			"active-file-changed",
			(data: string) => {
				this.updateLocalDraft();
			}
		);
		this.plugin.messageService?.registerListener(
			"set-draft-cover-image",
			(url: string) => {
				this.cover_image = url;
				this.setCoverImage(url);
				if (this.activeLocalDraft) {
					this.activeLocalDraft.thumb_media_id = undefined;
					this.localDraftmanager.setDraft(this.activeLocalDraft);
				}
			}
		);
		this.plugin.messageService?.registerListener(
			"set-image-as-cover",
			(item: MaterialMeidaItem) => {
				this.cover_image = item.url;
				this.setCoverImage(item.url);
				if (this.activeLocalDraft) {
					this.activeLocalDraft.thumb_media_id = item.media_id;
					this.localDraftmanager.setDraft(this.activeLocalDraft);
				}
			}
		);

		this.imageGenerateModal = new ImageGenerateModal(
			this.plugin,
			(url: string) => {
				//save it to local folder.
				ResourceManager.getInstance(this.plugin).saveImageFromUrl(url);
				this.cover_image = url;
				this.setCoverImage(url);
				if (this.activeLocalDraft) {
					this.activeLocalDraft.thumb_media_id = undefined;
					this.activeLocalDraft.cover_image_url = url;
					this.localDraftmanager.setDraft(this.activeLocalDraft);
				}
			}
		);
		this.updateLocalDraft();
	}

	onNoteRename(file: TFile) {
		const activeFile = this.plugin.app.workspace.getActiveFile();
		if (activeFile === undefined || file !== activeFile) {
			return;
		}

		if (this.activeLocalDraft !== undefined) {
			this.activeLocalDraft.notePath = file.path;
			const dm = LocalDraftManager.getInstance(this.plugin);
			dm.setDraft(this.activeLocalDraft);
		}
	}

	public getActiveLocalDraft() {
		return this.activeLocalDraft;
	}
	private BuildUI(containerEl: HTMLElement) {
		const container = containerEl.createEl("div", {
			cls: "wewrite-article-header",
		});
		const details = container.createEl("details");
		details.createEl("summary", { text: $t("views.article-header.title"), cls: "wewrite-draft-header" });

		new Setting(details)
			.setName($t("views.article-header.article-title"))
			.addText((text) => {
				this._title = text;
				text.setPlaceholder(
					$t("views.article-header.article-title-placeholder")
				).onChange(async (value) => {
					if (this.activeLocalDraft !== undefined) {
						this.activeLocalDraft.title = value;
						this.localDraftmanager.setDraft(this.activeLocalDraft);
						this.plugin.messageService?.sendMessage(
							"draft-title-updated",
							value
						);
					}
				});
			});
		new Setting(details)
			.setName($t("views.article-header.author"))
			.addText((text) => {
				this._author = text;
				text.setPlaceholder(
					$t("views.article-header.author-name")
				).onChange(async (value) => {
					if (this.activeLocalDraft !== undefined) {
						this.activeLocalDraft.author = value;
						this.localDraftmanager.setDraft(this.activeLocalDraft);
					}
				});
			});

		new Setting(details)
			.setName($t("views.article-header.digest"))
			.addExtraButton((button) => {
				button
					.setIcon("sparkles")
					.setTooltip(
						$t("views.article-header.generate-digest-by-ai")
					)
					.onClick(async () => {
						this.generateDigest();
					});
			});

		this._digest = details.createEl("textarea", {
			cls: "digest",
			attr: {
				rows: 3,
				placeholder: $t("views.article-header.digest-text"),
			},
		});
		this._digest.onkeyup = (event: KeyboardEvent) => {
			const target = event.target as HTMLTextAreaElement;
			if (this.activeLocalDraft !== undefined) {
				this.activeLocalDraft.digest = target.value;
				this.localDraftmanager.setDraft(this.activeLocalDraft);
			}
		};

		this.coverFrame = this.createCoverFrame(details);

		new Setting(details)
			.setName($t("views.article-header.open-comments"))
			.setDesc($t("views.article-header.comments-description"))
			.addToggle((toggle) => {
				this._needOpenComment = toggle;
				toggle.setValue(true);
				toggle.onChange((value) => {
					if (this.activeLocalDraft !== undefined) {
						this.activeLocalDraft.need_open_comment = value ? 1 : 0;
						this.localDraftmanager.setDraft(this.activeLocalDraft);
					}
				});
			});
		new Setting(details)
			.setName($t("views.article-header.only-fans-can-comment"))
			.setDesc($t("views.article-header.only-fans-can-comment-description"))
			.addToggle((toggle) => {
				this._onlyFansCanComment = toggle;
				toggle.setValue(false);
				toggle.onChange((value) => {
					if (this.activeLocalDraft !== undefined) {
						this.activeLocalDraft.only_fans_can_comment = value
							? 1
							: 0;
						this.localDraftmanager.setDraft(this.activeLocalDraft);
					}
				});
			});
	}
	async generateDigest() {
		if (!this.plugin.aiClient) {
			new Notice($t("ai.no-llm"));
			return;
		}
		if (this.activeLocalDraft === undefined) {
			new Notice($t("views.article-header.no-active-note"));
			return;
		}
		if (this.activeLocalDraft.notePath === undefined) {
			new Notice($t("views.article-header.no-active-note"));
			return;
		}
		this.plugin.showSpinner($t("views.article-header.generating-digest"));
		const md = await this.plugin.app.vault.adapter.read(
			this.activeLocalDraft.notePath
		);
		const summary = await this.plugin.aiClient?.generateSummary(md);
		if (summary) {
			this._digest!.value = summary;
			this.activeLocalDraft.digest = summary;
			this.localDraftmanager.setDraft(this.activeLocalDraft);
		}
		this.plugin.hideSpinner();
	}
	private createCoverFrame(details: HTMLElement) {
		new Setting(details)
			.setName($t("views.article-header.cover-image"))
			.setDesc($t("views.article-header.cover-image-description"))
			.addExtraButton((button) =>
				button
					.setIcon("sparkles")
					.setTooltip(
						$t("views.article-header.generate-cover-image-by-ai")
					)
					.onClick(async () => {
						if (this.imageGenerateModal === undefined) {
							return;
						}
						if (this._digest!.value !== undefined && this._digest!.value) {
							const prompt = this._digest!.value.trim()
							if (prompt){
								this.imageGenerateModal.prompt = prompt;
							}
						}
						this.imageGenerateModal.open();
					})
			);
		const container = details.createDiv({ cls: "cover-container" });
		const coverframe = container.createDiv({
			cls: "cover-frame",
			attr: { droppable: true },
		});

		coverframe.ondragenter = (e) => {
			e.preventDefault();
			coverframe.addClass("image-on-dragover");
		};
		coverframe.ondragleave = (e) => {
			e.preventDefault();
			coverframe.removeClass("image-on-dragover");
		};
		coverframe.ondragover = (e) => {
			e.preventDefault();
		};
		coverframe.addEventListener("drop", async (e) => {
			e.preventDefault();

			const url = e.dataTransfer?.getData("text/uri-list");
			if (url) {
				if (url.startsWith("obsidian://")) {
					//image from vault

					const urlParser = new UrlUtils(this.plugin.app);

					const appurl = await urlParser.getInternalLinkDisplayUrl(
						url
					);
					this.cover_image = appurl;
				} else if (url.startsWith("http") || url.startsWith("https")) {
					this.cover_image = url;
					const media_id = await this.getCoverImageMediaId(url);
					coverframe.setAttr("data-media_id", media_id);
					if (this.activeLocalDraft !== undefined) {
						this.activeLocalDraft.thumb_media_id = media_id;
					}
				} else if (url.startsWith("file://")) {
					//image from local file
					const filePath = url.replace("file://", "");
					const file = await this.plugin.app.vault.adapter.readBinary(
						filePath
					);
					const base64 = arrayBufferToBase64(file);
					this.cover_image = `data:image/png;base64,${base64}`;
				} else {
					this.cover_image = "";
					this.setCoverImageXY();
				}
				if (this.activeLocalDraft !== undefined) {
					this.activeLocalDraft.cover_image_url = this.cover_image!;
				}
				this.localDraftmanager.setDraft(this.activeLocalDraft!);
				this.setCoverImage(this.cover_image!);
			}
			coverframe.removeClass("image-on-dragover");
		});

		return coverframe;
	}
	
	setCoverImage(url: string | null) {
		while (this.coverFrame?.firstChild) {
			this.coverFrame.firstChild.remove();
		}
		if (!url) {
			return;
		}

		const img = new Image();
		img.src = url;

		img.onload = () => {
			const canvas = document.createElement("canvas");
			const ctx = canvas.getContext("2d")!;

			canvas.width = 900;
			canvas.height = 383;

			let scale = Math.max(900 / img.width, 383 / img.height);
			let offsetX = 0; //(canvas.width - img.width * scale) / 2;
			let offsetY = 0; // (canvas.height - img.height * scale) / 2;

			ctx.drawImage(
				img,
				offsetX,
				offsetY,
				img.width * scale,
				img.height * scale
			);

			

			this.coverFrame!.appendChild(canvas);
		};
	}
	async updateCoverImage() {
		if (this.imageGenerateModal === undefined) {
			return;
		}
		if (this._digest!.value !== undefined && this._digest!.value) {
			const prompt = this._digest!.value.trim()
			if (prompt){
				this.imageGenerateModal.prompt = prompt;
			}
		}
		this.imageGenerateModal.open();
	}
	resetImage() {
		this.setCoverImageXY(0, 0);
	}

	async checkCoverImage() {
		if (this.activeLocalDraft !== undefined) {
			if (
				this.activeLocalDraft.thumb_media_id === undefined ||
				!this.activeLocalDraft.thumb_media_id
			) {
				if (this.cover_image) {
					const media_id = await this.getCoverImageMediaId(
						this.cover_image,
						true
					);
					this.activeLocalDraft.thumb_media_id = media_id;
					return true;
				}
			} else {
				return true;
			}
		}
		return false;
	}
	async getCoverImageMediaId(url: string, upload: boolean = false) {
		let _media_id = this.plugin.findImageMediaId(url);
		if (_media_id === undefined && upload) {
			const blob = await fetchImageBlob(url);
			if (blob === undefined || !blob) {
				return;
			}

			// 验证并转换图片格式
			const validatedBlob = await validateAndConvertImage(blob);
			const res = await WechatClient.getInstance(this.plugin).uploadMaterial(
				validatedBlob,
				"banner-cover.png",
				"image"
			);

			if (res) {
				const { errcode, media_id } = res;

				if (errcode !== 0) {
					new Notice(
						$t("views.article-header.upload-cover-image-error")
					);
					return;
				} else {
					_media_id = media_id;
				}
			}
		}
		return _media_id;
	}
	private setCoverImageXY(x: number = 0, y: number = 0) {
		this.setCoverImage(this.cover_image);
	}
	async updateLocalDraft() {
		this.activeLocalDraft =
			await this.localDraftmanager.getDrafOfActiveNote();
		this.updateHeaderProporties();
		return true;
	}
	updateHeaderProporties() {
		if (this.activeLocalDraft !== undefined) {
			this._title!.setValue(this.activeLocalDraft.title);
			this._author!.setValue(this.activeLocalDraft.author || "");
			this._digest!.value = this.activeLocalDraft.digest || "";
			this._needOpenComment!.setValue(
				(this.activeLocalDraft.need_open_comment || 1) > 0
			);
			this._onlyFansCanComment!.setValue(
				(this.activeLocalDraft.only_fans_can_comment || 0) > 0
			);
			this.cover_image = this.activeLocalDraft.cover_image_url || "";
			const x = this.activeLocalDraft.pic_crop_235_1?.split(" ")[0] || 0;
			const y = this.activeLocalDraft.pic_crop_235_1?.split(" ")[1] || 0;
		} else {
			this._title!.setValue("");
			this._author!.setValue("");
			this._digest!.value = "";
			this._needOpenComment!.setValue(false);
			this._onlyFansCanComment!.setValue(false);
			this.cover_image = "";
			const x = 0;
			const y = 0;
		}
		
		this.setCoverImageXY();
		this.plugin.messageService?.sendMessage(
			"draft-title-updated",
			this._title!.getValue()
		);
	}
}
