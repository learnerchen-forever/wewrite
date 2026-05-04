/** process custom theme content */
import matter from "gray-matter";
import { CachedMetadata, Notice, TFile, TFolder, requestUrl } from "obsidian";
import postcss from "postcss";
// import { combinedCss } from "src/assets/css/template-css";
import { $t } from "src/lang/i18n";
import WeWritePlugin from "src/main";
import { CSSMerger } from "./CssMerger";

export type WeChatTheme = {
	name: string;
	path: string;
	content?: string;

}
export class ThemeManager {
	async downloadThemes() {
		const baseUrlAlter = "https://gitee.com/northern_bank/wewrite/raw/master/themes/";
		const baseUrl = "https://raw.githubusercontent.com/learnerchen-forever/wewrite/refs/heads/master/themes/";
		const saveDir = this.plugin.settings!.css_styles_folder || "/wewrite-custom-css";

		// Create save directory if it doesn't exist
		if (!this.plugin.app.vault.getAbstractFileByPath(saveDir)) {
			await this.plugin.app.vault.createFolder(saveDir);

		} else {
		}

		// Check if github is reachable, if not, use gitee
		let url = baseUrl;
		requestUrl(`${baseUrl}themes.json`).then((response) => {
			if (response.status === 200) {
				// The URL is valid, use it
				url = baseUrl;
				console.log(`Using GitHub URL: ${url}`);
			} else {
				// The URL is not valid, use the alternative URL
				console.log(`status error, Using Gitee URL: ${baseUrlAlter}`);
				url = baseUrlAlter;
			}
		}).catch((error) => {
			// The URL is not valid, use the alternative URL
			console.log(`exception, Using Gitee URL: ${baseUrlAlter}`);
			url = baseUrlAlter;
		});


		try {
			// Download themes.json
			const themesResponse = await requestUrl(`${url}themes.json`);
			if (themesResponse.status !== 200) {
				throw new Error($t('views.theme-manager.failed-to-fetch-themes-json-themesrespon', [themesResponse.text]));
			}

			const themesData = themesResponse.json;
			const themes = themesData.themes;

			// Download each theme file
			for (const theme of themes) {
				try {


					const fileResponse = await requestUrl(`${url}${theme.file}`);
					if (fileResponse.status !== 200) {
						console.warn(`Failed to download ${theme.file}: ${fileResponse.text}`);
						continue;
					}

					const fileContent = fileResponse.text;
					// Generate unique file name
					let filePath = `${saveDir}/${theme.file}`;
					let counter = 1;

					while (this.plugin.app.vault.getAbstractFileByPath(filePath)) {
						const extIndex = theme.file.lastIndexOf('.');
						const baseName = extIndex > 0 ? theme.file.slice(0, extIndex) : theme.file;
						const ext = extIndex > 0 ? theme.file.slice(extIndex) : '';
						filePath = `${saveDir}/${baseName}(${counter})${ext}`;
						counter++;
					}

					await this.plugin.app.vault.create(filePath, fileContent);
				} catch (error) {
					console.error(error);
					new Notice($t('views.theme-manager.error-downloading-theme') + error.message);
					continue;
				}
			}
			new Notice($t('views.theme-manager.total-themes-length-themes-downloaded', [themes.length]))
		} catch (error) {
			console.error("Error downloading themes:", error);
			new Notice($t('views.theme-manager.error-downloading-themes'));
		}
	}
	private plugin: WeWritePlugin;
	defaultCssRoot: postcss.Root | undefined;
	themes: WeChatTheme[] = [];
	// static template_css: string = combinedCss;

	private constructor(plugin: WeWritePlugin) {
		this.plugin = plugin;

	}
	static getInstance(plugin: WeWritePlugin): ThemeManager {
		return new ThemeManager(plugin);

	}

	async loadThemes() {
		this.themes = [];
		const folder_path = this.plugin.settings!.css_styles_folder;
		const folder = this.plugin.app.vault.getAbstractFileByPath(folder_path);
		if (folder instanceof TFolder) {
			this.themes = await this.getAllThemesInFolder(folder);
		}
		return this.themes;
	}
	public cleanCSS(css: string): string {

		css = css.replace(/```[cC][Ss]{2}\s*|\s*```/g, '').trim()
		const reg_multiple_line_comments = /\/\*[\s\S]*?\*\//g;
		const reg_single_line_comments = /\/\/.*/g;
		const reg_whitespace = /\s+/g;
		const reg_invisible_chars = /[\u200B\u00AD\uFEFF\u00A0]/g;

		let cleanedCSS = css
			.replace(reg_multiple_line_comments, '')
			.replace(reg_single_line_comments, '')
			.replace(reg_whitespace, ' ')
			.replace(reg_invisible_chars, '');

		return cleanedCSS.trim();
	}
	private async extractCSSblocks(path: string) {
		const result: string[] = []
		const file = this.plugin.app.vault.getFileByPath(path);
		if (!file) {
			return ''
		}
		const cache: CachedMetadata | null = this.plugin.app.metadataCache.getFileCache(file);
		if (!cache?.sections) return ''
		const content = await this.plugin.app.vault.read(file);

		for (const section of cache.sections) {
			if (section.type === "code" ) {
				const rawBlock = content.substring(
					section.position.start.offset,
					section.position.end.offset
				);
				if  (!/^```css/i.test(rawBlock)) continue;
				// const cleaned = rawBlock.replace(/^```css\s*/, "").replace(/```$/, "").trim();
				const first = rawBlock.indexOf('\n');
				const last = rawBlock.lastIndexOf('\n');
				const cleaned = rawBlock.substring(first + 1, last).trim();
				result.push(cleaned);
			}
		}
		// console.log('result=>', result);
		
		return result.join('\n')

	}
	public async getThemeContent(path: string) {
		const file = this.plugin.app.vault.getFileByPath(path);
		if (!file) {
			// return ThemeManager.template_css; //DEFAULT_STYLE;
			return ''
		}
		const fileContent = await this.plugin.app.vault.cachedRead(file);

		const reg_css_block = /```[cC][Ss]{2}\s*([\s\S]+?)\s*```/gs;
		// const reg_css_block = /```css\s*([\s\S]*?)```/g

		const cssBlocks: string[] = [];
		let match
		while ((match = reg_css_block.exec(fileContent)) !== null) {
			cssBlocks.push(this.cleanCSS(match[1].trim()));
		}
		console.log('cssBlocks=>', cssBlocks);

		return cssBlocks.join('\n');

	}
	public async getCSS() {
		let custom_css = '' //this.defaultCssRoot.toString() //''
		if (this.plugin.settings!.custom_theme === undefined || !this.plugin.settings!.custom_theme) {

		} else {
			// custom_css = await this.getThemeContent(this.plugin.settings.custom_theme)
			custom_css = await this.extractCSSblocks(this.plugin.settings!.custom_theme)
		}

		return custom_css

	}
	public getShadowStleSheet() {
		const sheet = new CSSStyleSheet();
		sheet.replaceSync(`
  /* 滚动条样式 we use shadow dom, make the preview looks better.*/
.table-container::-webkit-scrollbar {
	width: 8px;
	height: 8px;
	background-color: var(--scrollbar-bg);
}

.table-container::-webkit-scrollbar-thumb {
	background-color: var(--scrollbar-thumb-bg);
    -webkit-border-radius: var(--radius-l);
    background-clip: padding-box;
    border: 2px solid transparent;
    border-width: 3px 3px 3px 2px;
    min-height: 45px;
}
.table-container::-webkit-scrollbar-thumb:hover {
	background-color: var(--scrollbar-thumb-hover-bg);
}

.wewrite-article::-webkit-scrollbar-corner{
	background: transparent;
}

.wewrite-article pre::-webkit-scrollbar {
	width: 8px;
	height: 8px;
	background-color: var(--scrollbar-bg);
}

.wewrite-article pre::-webkit-scrollbar-thumb {
	background-color: var(--scrollbar-thumb-bg);
    -webkit-border-radius: var(--radius-l);
    background-clip: padding-box;
    border: 2px solid transparent;
    border-width: 3px 3px 3px 2px;
    min-height: 45px;
}

.wewrite-article pre::-webkit-scrollbar-thumb:hover {
	background-color: var(--scrollbar-thumb-hover-bg);
}

.wewrite-article::-webkit-scrollbar-corner{
	background: transparent;
}
`);

		return sheet

	}
	private async getAllThemesInFolder(folder: TFolder): Promise<WeChatTheme[]> {
		const themes: WeChatTheme[] = [];

		const getAllFiles = async (folder: TFolder) => {
			const promises = folder.children.map(async (child) => {
				if (child instanceof TFile && child.extension === "md") {
					const theme = await this.getThemeProperties(child);
					if (theme) {
						themes.push(theme);
					}
				} else if (child instanceof TFolder) {
					await getAllFiles(child);
				}
			});

			await Promise.all(promises);
		};

		await getAllFiles(folder);

		return themes;
	}

	private async getThemeProperties(file: TFile): Promise<WeChatTheme | undefined> {
		const fileContent = await this.plugin.app.vault.cachedRead(file);
		const { data } = matter(fileContent); // 解析前置元数据
		if (data.theme_name === undefined || !data.theme_name.trim()) {
			// it is not a valid theme.
			return;
		}

		return {
			name: data.theme_name,
			path: file.path,
		};
	}

	public async applyTheme(htmlRoot: HTMLElement) {
		const customCss = await this.getCSS()
		const cssMerger = new CSSMerger()
		await cssMerger.init(customCss)
		const node = cssMerger.applyStyleToElement(htmlRoot)
		cssMerger.removeClassName(node)
		return node

	}
}
