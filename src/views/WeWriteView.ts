// views/WeWriteView.ts
import { debounce, ItemView, WorkspaceLeaf, MarkdownRenderer, TFile, Component, Notice, DropdownComponent, Setting } from 'obsidian';
import { MPArticleHeader } from './mp-article-header';
import { $t } from 'src/lang/i18n';
import { LinkToStrong } from 'src/render/marked-extensions/link-to-strong';
import { ThemeSelector } from 'src/theme/theme-selector';
import WeWritePlugin from 'src/main';

export const VIEW_TYPE_WEWRITE = "wewrite-view";

interface WeWriteViewState {
    filePath: string | null;
}

export class WeWriteView extends ItemView {
    private plugin: WeWritePlugin;
    private file: TFile | null = null;
    private component: Component;
    private contentContainer: HTMLElement | null = null;

    // ✅ 新增：防抖重新渲染函数
    private debouncedRerender: Function & { cancel: () => void };
    draftHeader: MPArticleHeader | undefined;
    articleTitle: Setting | undefined;
    themeSelector: ThemeSelector | undefined;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
        this.plugin = (this.app as any).plugins.getPlugin("wewrite") as WeWritePlugin;
        this.themeSelector = new ThemeSelector(this.plugin);
        this.component = new Component();
        this.debouncedRerender = debounce(() => {
            this.rerenderContent();
        }, 300);
    }

        /**
         * Converts all <a> tags to <strong> tags in the rendered article content, preserving styles
         */
        async convertLinksToStrongTags() {
            const currentContent = this.contentContainer?.innerHTML || '';
            const updatedContent = LinkToStrong.convertATagsToStrongTags(currentContent);
            this.contentContainer!.innerHTML = updatedContent;
            new Notice($t("views.previewer.links-converted-to-strong-tags-successfully"));
        }
    getViewType(): string {
        return VIEW_TYPE_WEWRITE;
    }

    getDisplayText(): string {
        return this.file ? `WeWrite - ${this.file.name}` : "WeWrite 视图";
    }

    getState(): any {
        return {
            filePath: this.file ? this.file.path : null
        };
    }

    async setState(state: any, result: any): Promise<void> {
        await super.setState(state, result);
        
        let actualState: any = state;
        if (state && typeof state === 'object' && 'state' in state) {
            actualState = state.state;
        }
        
        const filePath = actualState?.filePath;
        if (filePath && typeof filePath === 'string') {
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (file instanceof TFile && file.extension === 'md') {
                await this.setFile(file);
            }
        }
    }

    async buildUI() {
        this.contentEl.addClass("wewrite-view");
        const container = this.containerEl.children[1];
		container.empty();

        const mainDiv = container.createDiv({
                    cls: "wewrite-previewer-container",
                });
                this.articleTitle = new Setting(mainDiv)
                    .setName($t("views.previewer.article-title"))
                    .setHeading()
                    .addDropdown((dropdown: DropdownComponent) => {
                        this.themeSelector?.dropdown(dropdown);
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

        this.contentContainer = mainDiv.createDiv("wewrite-view-content");
        this.contentContainer.style.padding = "16px";
        this.contentContainer.style.overflow = "auto";
    }
    renderDraft() {
        throw new Error('Method not implemented.');
    }
    getArticleContent() : string {
        // throw new Error('Method not implemented.');
        return '';
    }
    sendArticleToDraftBox() {
        throw new Error('Method not implemented.');
    }
    async checkCoverImage(): Promise<boolean> {
        // throw new Error('Method not implemented.');
        return true;
    }
    async onOpen(): Promise<void> {
        await super.onOpen();
        await this.buildUI();

        // ✅ 注册文件修改监听（自动清理）
        this.registerEvent(
            this.app.vault.on('modify', (file) => {
                // 如果修改的文件正是当前打开的文件，触发防抖重新渲染
                if (this.file && file === this.file) {
                    this.debouncedRerender();
                }
            })
        );
    }

    async onClose(): Promise<void> {
        // ✅ 取消防抖调用，避免在视图关闭后尝试渲染
        this.debouncedRerender.cancel();
        
        if (this.component) {
            this.component.unload();
        }
        this.contentEl.removeClass("wewrite-view");
        await super.onClose();
    }

    async setFile(file: TFile): Promise<void> {
        this.file = file;
        
        // @ts-expect-error
        this.leaf.updateHeader();
        
        this.leaf.setEphemeralState({ filePath: file.path });
        
        if (this.contentContainer) {
            await this.renderMarkdownContent(this.contentContainer);
        }
    }

    // ✅ 新增：重新渲染当前文件内容（不改变文件引用）
    private async rerenderContent(): Promise<void> {
        if (!this.file || !this.contentContainer) return;
        // 保存当前滚动位置（可选）
        const scrollTop = this.contentContainer.scrollTop;
        await this.renderMarkdownContent(this.contentContainer);
        // 恢复滚动位置，避免跳动
        this.contentContainer.scrollTop = scrollTop;
    }

    private async renderMarkdownContent(container: HTMLElement): Promise<void> {
        if (!this.file) {
            container.setText("未选择任何文件。");
            return;
        }

        try {
            const fileContent = await this.app.vault.read(this.file);
            container.empty();

            await MarkdownRenderer.render(
                this.app,
                fileContent,
                container,
                this.file.path,
                this.component
            );

            this.bindInternalLinkEvents(container);
        } catch (error) {
            console.error("渲染Markdown失败:", error);
            container.setText(`渲染出错: ${(error as Error).message}`);
        }
    }

    private bindInternalLinkEvents(container: HTMLElement): void {
        const links = container.querySelectorAll<HTMLElement>("a.internal-link");
        
        links.forEach((link) => {
            const href = link.getAttribute("href");
            if (!href) return;

            this.registerDomEvent(link, 'click', (e: MouseEvent) => {
                e.preventDefault();
                this.app.workspace.openLinkText(
                    href,
                    this.file?.path ?? "",
                    e.ctrlKey || e.metaKey
                );
            });

            this.registerDomEvent(link, 'mouseover', (e: MouseEvent) => {
                e.preventDefault();
                this.app.workspace.trigger("hover-link", {
                    event: e,
                    source: this.getViewType(),
                    hoverParent: this,
                    targetEl: link,
                    linktext: href,
                    sourcePath: this.file?.path ?? ""
                });
            });
        });
    }
}