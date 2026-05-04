/**
 * Define the right-side leaf of view as Previewer view
 */

import { EditorView } from "@codemirror/view";
import {
	Component,
	debounce,
	DropdownComponent,
	Editor,
	EditorChange,
	EventRef,
	ItemView,
	MarkdownView,
	Notice,
	sanitizeHTMLToDom,
	Setting,
	TAbstractFile,
	TFile,
	WorkspaceLeaf,
} from "obsidian";
import { $t } from "src/lang/i18n";
import WeWritePlugin from "src/main";
import { PreviewRender } from "src/render/marked-extensions/extension";
import { LinkToStrong } from "src/render/marked-extensions/link-to-strong";
import {
	uploadCanvas,
	uploadSVGs,
	uploadURLImage,
	uploadURLVideo,
} from "src/render/post-render";
import { WechatRender } from "src/render/wechat-render";
import { ResourceManager } from "../assets/resource-manager";
import { WechatClient } from "../wechat-api/wechat-client";
import { MPArticleHeader } from "./mp-article-header";
import { ThemeManager } from "../theme/theme-manager";
import { ThemeSelector } from "../theme/theme-selector";
import { WebViewModal } from "./webview";

export const VIEW_TYPE_WEWRITE_PREVIEW = "wewrite-article-preview";
export interface ElectronWindow extends Window {
	WEBVIEW_SERVER_URL: string;
}

/**
 * PreviewPanel is a view component that renders and previews markdown content with WeChat integration.
 * It provides real-time rendering, theme selection, and draft management capabilities for WeChat articles.
 * 
 * Features:
 * - Real-time markdown rendering with debounced updates
 * - Theme selection and application
 * - Draft management (send to WeChat draft box, copy to clipboard)
 * - Frontmatter property handling
 * - Shadow DOM rendering container
 * 
 * The panel integrates with WeChatClient for draft operations and maintains article properties in sync with markdown frontmatter.
 */
export class PreviewPanel extends ItemView implements PreviewRender {
	markdownView: MarkdownView | undefined;
	private articleDiv: HTMLDivElement | undefined;
	private listeners: EventRef[] = [];
	currentView: EditorView | undefined;
	observer: any;
	private wechatClient: WechatClient;
	private plugin: WeWritePlugin;
	private themeSelector: ThemeSelector;
	private debouncedRender = debounce(async () => {
		if (this.plugin.settings!.realTimeRender) {
			await this.renderDraft();
		}
	}, 2000);
	private debouncedUpdate = debounce(async () => {
		if (this.plugin.settings!.realTimeRender) {
			await this.renderDraft();
		}
	}, 1000);
	private debouncedCustomThemeChange = debounce(async (theme: string) => {
		this.getArticleProperties();
		this.articleProperties.set("custom_theme", theme);
		this.setArticleProperties();
		this.renderDraft();
	}, 2000);

	private draftHeader: MPArticleHeader | undefined;
	articleProperties: Map<string, string> = new Map();
	editorView: EditorView | null = null;
	lastLeaf: WorkspaceLeaf | undefined;
	renderDiv: any;
	elementMap: Map<string, Node | string> | undefined;
	articleTitle: Setting | undefined;
	containerDiv: HTMLElement | undefined;
	mpModal: WebViewModal | undefined;
	isActive: boolean = false;
	renderPreviewer: any;
	getViewType(): string {
		return VIEW_TYPE_WEWRITE_PREVIEW;
	}
	getDisplayText(): string {
		return $t("views.previewer.wewrite-previewer");
	}
	getIcon() {
		return "pen-tool";
	}
	constructor(leaf: WorkspaceLeaf, plugin: WeWritePlugin) {
		super(leaf);
		this.plugin = plugin;
		this.wechatClient = WechatClient.getInstance(this.plugin);
		this.themeSelector = new ThemeSelector(plugin);
	}

	async onOpen() {
		this.buildUI();
		this.startListen();

		this.plugin.messageService!.registerListener(
			"draft-title-updated",
			(title: string) => {
				this.articleTitle!.setName(title);
			}
		);
		this.themeSelector.startWatchThemes();
		this.plugin.messageService!.registerListener(
			"custom-theme-changed",
			async (theme: string) => {
				this.debouncedCustomThemeChange(theme);
			}
		);
		this.plugin.messageService!.sendMessage("active-file-changed", null);
		this.loadComponents();
	}

	getArticleProperties() {
		const activeFile = this.plugin.app.workspace.getActiveFile();
		if (
			activeFile?.extension === "md" ||
			activeFile?.extension === "markdown"
		) {
			const cache = this.app.metadataCache.getCache(activeFile.path);
			const frontmatter = cache?.frontmatter;
			this.articleProperties.clear();
			if (frontmatter !== undefined && frontmatter !== null) {
				Object.keys(frontmatter).forEach((key) => {
					this.articleProperties.set(key, frontmatter[key]);
				});
			}
		}
		return this.articleProperties;
	}
	async setArticleProperties() {
		const path = this.getCurrentMarkdownFile();

		if (path && this.articleProperties.size > 0) {
			const file = this.app.vault.getAbstractFileByPath(path);
			if (!(file instanceof TFile)) {
				throw new Error(
					$t("views.previewer.file-not-found-path", [path])
				);
			}
			this.app.fileManager.processFrontMatter(file, (frontmatter) => {
				this.articleProperties.forEach((value, key) => {
					frontmatter[key] = value;
				});
			});
		}

	}

	public getCurrentMarkdownFile() {
		const currentFile = this.plugin.app.workspace.getActiveFile();
		const leaves = this.plugin.app.workspace.getLeavesOfType("markdown");
		for (let leaf of leaves) {
			const markdownView = leaf.view as MarkdownView;
			if (markdownView.file?.path === currentFile?.path) {
				return markdownView.file?.path;
			}
		}
		return null;
	}
	async buildUI() {
		const container = this.containerEl.children[1];
		container.empty();

		const mainDiv = container.createDiv({
			cls: "wewrite-previewer-container",
		});
		this.articleTitle = new Setting(mainDiv)
			.setName($t("views.previewer.article-title"))
			.setHeading()
			.addDropdown((dropdown: DropdownComponent) => {
				this.themeSelector.dropdown(dropdown);
			})

			.addExtraButton((button) => {
				button
					.setIcon("refresh-cw")
					.setTooltip($t("views.previewer.render-article"))
					.onClick(async () => {
						this.renderDraft();
					});
			})
			.addExtraButton((button) => {
				button
					.setIcon("send-horizontal")
					.setTooltip($t("views.previewer.send-article-to-draft-box"))
					.onClick(async () => {
						if (await this.checkCoverImage()) {
							this.sendArticleToDraftBox();
						} else {
							new Notice(
								$t("views.previewer.please-set-cover-image")
							);
						}
					});
			})
			.addExtraButton((button) => {
				button
					.setIcon("clipboard-copy")
					.setTooltip($t("views.previewer.copy-article-to-clipboard"))
					.onClick(async () => {
						const data = this.getArticleContent();
						await navigator.clipboard.write([
							new ClipboardItem({
								"text/html": new Blob([data], {
									type: "text/html",
								}),
							}),
						]);
						new Notice(
							$t("views.previewer.article-copied-to-clipboard")
						);
					});
			})
			.addExtraButton((button) => {
				button
					.setIcon("bold")
					.setTooltip($t("views.previewer.convert-links-to-strong-tags"))
					.onClick(async () => {
						await this.convertLinksToStrongTags();
					});
			})
			// 调试时打开注释
			// .addExtraButton((button) => {
			// 	button
			// 		.setIcon("view")
			// 		.setTooltip("查看草稿数据")
			// 		.onClick(async () => {
			// 			this.showDraftData();
			// 		});
			// });

		this.draftHeader = new MPArticleHeader(this.plugin, mainDiv);

		this.renderDiv = mainDiv.createDiv({ cls: "render-container" });
		this.renderDiv.id = "render-div";
		this.renderPreviewer = mainDiv.createDiv({
			cls: ".wewrite-render-preview",
		})
		this.renderPreviewer.hide()
		let shadowDom = this.renderDiv.shawdowRoot;
		if (shadowDom === undefined || shadowDom === null) {
			shadowDom = this.renderDiv.attachShadow({ mode: 'open' });
			shadowDom.adoptedStyleSheets = [
				ThemeManager.getInstance(this.plugin).getShadowStleSheet()
			];
		}

		this.containerDiv = shadowDom.createDiv({ cls: "wewrite-article" });
		this.articleDiv = this.containerDiv!.createDiv({ cls: "article-div" });
	}
	async checkCoverImage() {
		return this.draftHeader!.checkCoverImage();
	}
	async sendArticleToDraftBox() {
		await uploadSVGs(this.articleDiv!, this.plugin.wechatClient!);
		await uploadCanvas(this.articleDiv!, this.plugin.wechatClient!);
		await uploadURLImage(this.articleDiv!, this.plugin.wechatClient!);
		await uploadURLVideo(this.articleDiv!, this.plugin.wechatClient!);

		const media_id = await this.wechatClient.sendArticleToDraftBox(
			this.draftHeader!.getActiveLocalDraft()!,
			this.getArticleContent()
		);

		if (media_id) {
			this.draftHeader!.updateDraftDraftId(media_id);
			const news_item = await this.wechatClient.getDraftById(
				this.plugin.settings!.selectedMPAccount!,
				media_id
			);
			if (news_item) {
				open(news_item[0].url);
				const item = {
					media_id: media_id,
					content: {
						news_item: news_item,
					},
					update_time: Date.now(),
				};
				this.plugin.messageService!.sendMessage(
					"draft-item-updated",
					item
				);
			}
		}
	}
	/**
	 * Compress HTML by removing unnecessary whitespace while preserving content in pre, code, and textarea tags
	 */
	private compressHTML(html: string): string {
		// Store protected elements temporarily
		const protectedElements: string[] = [];
		
		// Extract and store pre, code, textarea elements, with content escaping
		html = html.replace(/<(pre|code|textarea)([^>]*?)>([\s\S]*?)<\/\1>/gi, (match, tag, attrs, content) => {
			// Escape content for protected elements: tab to 4 non-breaking spaces, space to non-breaking space, newline to <br>
			const escapedContent = content
				.replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;') // 制表符转为4个不间断空格
				.replace(/\n/g, '<br>'); // 换行符转为br标签
			
			const escapedElement = `<${tag}${attrs}>${escapedContent}</${tag}>`;
			protectedElements.push(escapedElement);
			return `<!--PROTECTED_ELEMENT_${protectedElements.length - 1}-->`;
		});
		
		// Compress the remaining HTML (outside protected elements)
		html = html
			// Replace multiple whitespaces with single space
			.replace(/\s+/g, ' ')
			// Remove whitespaces around HTML tags
			.replace(/\s*(<[^>]+>)\s*/g, '$1')
			// Trim the entire string
			.trim();
		
		// Restore protected elements
		html = html.replace(/<!--PROTECTED_ELEMENT_(\d+)-->/g, (match, index) => {
			return protectedElements[parseInt(index)];
		});
		
		return html;
	}

	public getArticleContent() {
		return this.compressHTML(this.articleDiv!.innerHTML!);
	}
	// async getCSS() {
	// 	return await ThemeManager.getInstance(this.plugin).getCSS();
	// }

	async onClose() {
		// Clean up our view
		this.stopListen();
	}

	/**
	 * Converts all <a> tags to <strong> tags in the rendered article content, preserving styles
	 */
	async convertLinksToStrongTags() {
		const currentContent = this.articleDiv!.innerHTML!;
		const updatedContent = LinkToStrong.convertATagsToStrongTags(currentContent);
		this.articleDiv!.innerHTML = updatedContent;
		new Notice($t("views.previewer.links-converted-to-strong-tags-successfully"));
	}

	private async showDraftData() {
		// 获取两个方法的值
		const draftData = this.draftHeader!.getActiveLocalDraft();
		const articleContent = this.getArticleContent();
		
		// 安全的字符串化函数，处理循环引用
		const safeStringify = (obj: any): string => {
			const seen = new WeakSet();
			return JSON.stringify(obj, (key, val) => {
				if (val != null && typeof val === "object") {
					if (seen.has(val)) return "[Circular]";
					seen.add(val);
				}
				return val;
			}, 2);
		};
		
		// 创建弹窗显示内容
		const modalContent = `
			<h3>草稿数据</h3>
			<div style="margin-bottom: 20px;">
				<h4>Active Local Draft:</h4>
				<pre style="background: #f5f5f5; padding: 10px; border-radius: 4px; overflow: auto; max-height: 200px; white-space: pre-wrap; word-wrap: break-word;">${safeStringify(draftData)}</pre>
			</div>
			<div style="margin-bottom: 20px;">
				<h4>Article Content:</h4>
				<pre style="background: #f5f5f5; padding: 10px; border-radius: 4px; overflow: auto; max-height: 200px; white-space: pre-wrap; word-wrap: break-word;">${articleContent}</pre>
			</div>
		`;
		
		// 创建自定义模态框
		const modal = document.createElement('div');
		modal.className = 'modal-container';
		modal.style.position = 'fixed';
		modal.style.top = '0';
		modal.style.left = '0';
		modal.style.width = '100%';
		modal.style.height = '100%';
		modal.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
		modal.style.display = 'flex';
		modal.style.justifyContent = 'center';
		modal.style.alignItems = 'center';
		modal.style.zIndex = '9999';
		modal.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
		
		const modalContentDiv = document.createElement('div');
		modalContentDiv.className = 'modal-content';
		modalContentDiv.style.backgroundColor = 'white';
		modalContentDiv.style.padding = '20px';
		modalContentDiv.style.borderRadius = '8px';
		modalContentDiv.style.maxWidth = '80%';
		modalContentDiv.style.maxHeight = '80%';
		modalContentDiv.style.overflow = 'auto';
		modalContentDiv.innerHTML = modalContent;
		
		// 添加复制按钮
		const copyButton = document.createElement('button');
		copyButton.textContent = '复制所有数据';
		copyButton.style.marginTop = '10px';
		copyButton.style.padding = '8px 16px';
		copyButton.style.backgroundColor = '#007acc';
		copyButton.style.color = 'white';
		copyButton.style.border = 'none';
		copyButton.style.borderRadius = '4px';
		copyButton.style.cursor = 'pointer';
		copyButton.style.marginRight = '10px';
		
		copyButton.onclick = async () => {
			const fullData = `草稿数据:\n${safeStringify(draftData)}\n\n文章内容:\n${articleContent}`;
			await navigator.clipboard.writeText(fullData);
			new Notice('数据已复制到剪贴板');
		};
		
		modalContentDiv.appendChild(copyButton);
		
		// 添加复制草稿数据按钮
		const copyDraftButton = document.createElement('button');
		copyDraftButton.textContent = '仅复制草稿数据';
		copyDraftButton.style.marginTop = '10px';
		copyDraftButton.style.padding = '8px 16px';
		copyDraftButton.style.backgroundColor = '#28a745';
		copyDraftButton.style.color = 'white';
		copyDraftButton.style.border = 'none';
		copyDraftButton.style.borderRadius = '4px';
		copyDraftButton.style.cursor = 'pointer';
		copyDraftButton.style.marginRight = '10px';
		
		copyDraftButton.onclick = async () => {
			const draftDataStr = safeStringify(draftData);
			await navigator.clipboard.writeText(draftDataStr);
			new Notice('草稿数据已复制到剪贴板');
		};
		
		modalContentDiv.appendChild(copyDraftButton);
		
		// 添加复制文章内容按钮
		const copyContentButton = document.createElement('button');
		copyContentButton.textContent = '仅复制文章内容';
		copyContentButton.style.marginTop = '10px';
		copyContentButton.style.padding = '8px 16px';
		copyContentButton.style.backgroundColor = '#17a2b8';
		copyContentButton.style.color = 'white';
		copyContentButton.style.border = 'none';
		copyContentButton.style.borderRadius = '4px';
		copyContentButton.style.cursor = 'pointer';
		copyContentButton.style.marginRight = '10px';
		
		copyContentButton.onclick = async () => {
			await navigator.clipboard.writeText(articleContent);
			new Notice('文章内容已复制到剪贴板');
		};
		
		modalContentDiv.appendChild(copyContentButton);
		
		// 添加关闭按钮
		const closeButton = document.createElement('button');
		closeButton.textContent = '关闭';
		closeButton.style.marginTop = '10px';
		closeButton.style.padding = '8px 16px';
		closeButton.style.backgroundColor = '#6c757d';
		closeButton.style.color = 'white';
		closeButton.style.border = 'none';
		closeButton.style.borderRadius = '4px';
		closeButton.style.cursor = 'pointer';
		
		closeButton.onclick = () => {
			document.body.removeChild(modal);
		};
		
		modalContentDiv.appendChild(closeButton);
		modal.appendChild(modalContentDiv);
		document.body.appendChild(modal);
	}
	
	async parseActiveMarkdown() {
		// get properties
		const prop = this.getArticleProperties();
		const mview = ResourceManager.getInstance(
			this.plugin
		).getCurrentMarkdownView();
		if (!mview) {
			return $t("views.previewer.not-a-markdown-view");
		}
		this.articleDiv!.empty();
		this.elementMap = new Map<string, HTMLElement | string>();
		const activeFile = this.app.workspace.getActiveFile();

		if (!activeFile) {
			return `<h1>No active file</h1>`;
		}
		if (activeFile.extension !== "md") {
			return `<h1>Not a markdown file</h1>`;
		}
		let html = await WechatRender.getInstance(this.plugin, this).parseNote(
			activeFile.path,
			this.renderPreviewer,
			this
		);

		// return; //to see the render tree.
		const articleSection = createEl("section", {
			cls: "wewrite-article-content wewrite",
		});
		const dom = sanitizeHTMLToDom(html);
		articleSection.appendChild(dom);

		this.articleDiv!.empty();
		this.articleDiv!.appendChild(articleSection);

		this.elementMap.forEach(
			async (value: string | Node, key: string, map: Map<string, string | Node>) => {
				const item = this.articleDiv!.querySelector(
					"#" + key
				) as HTMLElement;

				if (!item) return;
				if (typeof value === "string") {
					const tf = ResourceManager.getInstance(
						this.plugin
					).getFileOfLink(value);
					if (tf) {
						const file = this.plugin.app.vault.getFileByPath(
							tf.path
						);
						if (file) {
							const body = await WechatRender.getInstance(
								this.plugin,
								this
							).parseNote(file.path, this.renderPreviewer, this);
							item.empty();
							item.appendChild(sanitizeHTMLToDom(body));
						}
					}
				} else if (value instanceof HTMLElement) {
					item.appendChild(value);
				}
			}
		);
		// return this.articleDiv.innerHTML;
	}
	async renderDraft() {
		if (!this.isViewActive()) {
			return;
		}

		await this.parseActiveMarkdown();
		if (this.articleDiv === null || this.articleDiv!.firstChild === null) {
			return;
		}
		await ThemeManager.getInstance(this.plugin).applyTheme(
			this.articleDiv!.firstChild as HTMLElement
		);
	}
	isViewActive(): boolean {
		return this.isActive && !this.app.workspace.rightSplit.collapsed
	}

	startListen() {
		this.registerEvent(
			this.plugin.app.vault.on("rename", (file: TAbstractFile, oldPath: string) => {
				if (file instanceof TFile) {
					this.draftHeader!.onNoteRename(file);
				}
			})
		);
		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				const isOpen = this.app.workspace.getLeavesOfType(VIEW_TYPE_WEWRITE_PREVIEW).length > 0;
				this.isActive = isOpen;
			})
		);

		// 监听文件内容变化
		const ec = this.app.vault.on(
			"modify",
			(file: TFile) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (file === activeFile) {
					this.debouncedRender();
				}
			}
		);
		this.listeners.push(ec);

		const el = this.app.workspace.on("active-leaf-change", async (leaf) => {
			if (leaf){
				if(leaf.view.getViewType() === "markdown") {
					this.plugin.messageService!.sendMessage(
						"active-file-changed",
						null
					);
					this.debouncedUpdate();
				}else {
					
					this.isActive = (leaf.view === this)
				}

			}
		});
		this.listeners.push(el);
	}
	stopListen() {
		this.listeners.forEach((e) => this.app.workspace.offref(e));
	}

	onEditorChange(editor: Editor, info: EditorChange) {
		this.debouncedRender();
	}
	updateElementByID(id: string, html: string): void {
		const item = this.articleDiv!.querySelector("#" + id) as HTMLElement;
		if (!item) return;
		const doc = sanitizeHTMLToDom(html);

		item.empty();
		item.appendChild(doc);
		// if (doc.childElementCount > 0) {
		// 	for (const child of doc.children) {
		// 		item.appendChild(child.cloneNode(true));
		// 	}
		// } else {
		// 	item.innerText = $t("views.previewer.article-render-failed");
		// }
	}
	addElementByID(id: string, node: HTMLElement | string): void {
		if (typeof node === "string") {
			this.elementMap!.set(id, node);
		} else {
			this.elementMap!.set(id, node.cloneNode(true));
		}
	}
	private async loadComponents() {
			const view = this;
			type InternalComponent = Component & {
				_children: Component[];
				onload: () => void | Promise<void>;
			}
	
			const internalView = view as unknown as InternalComponent;
	
			// recursively call onload() on all children, depth-first
			const loadChildren = async (
				component: Component,
				visited: Set<Component> = new Set()
			): Promise<void> => {
				if (visited.has(component)) {
					return;  // Skip if already visited
				}
	
				visited.add(component);
	
				const internalComponent = component as InternalComponent;
	
				if (internalComponent._children?.length) {
					for (const child of internalComponent._children) {
						await loadChildren(child, visited);
					}
				}
				try {
					// relies on the Sheet plugin (advanced-table-xt) not to be minified
					if (component?.constructor?.name === 'SheetElement') {
						await component.onload();
					}
				} catch (error) {
					console.error(`Error calling onload()`, error);
				}
			};
			await loadChildren(internalView);
		}
}