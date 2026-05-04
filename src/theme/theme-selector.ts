/**
 * Theme Selector
 */
import { DropdownComponent, TFile } from "obsidian";
import WeWritePlugin from "src/main";
import { ThemeManager } from "./theme-manager";
import { $t } from "src/lang/i18n";

export class ThemeSelector {
    private plugin: WeWritePlugin;
    private _themeDropdown: DropdownComponent | undefined;
    private _themeManager: ThemeManager

    constructor(plugin: WeWritePlugin) {
        this.plugin = plugin;
        this._themeManager = ThemeManager.getInstance(plugin)
		this.plugin.messageService!.registerListener('custom-theme-folder-changed', async () => {
			this.updateThemeOptions()
		})
    }
    public async dropdown(themDropdown: DropdownComponent) {
        this._themeDropdown = themDropdown;
        await this.updateThemeOptions()

        themDropdown.onChange(async (value) => {
            this.plugin.settings!.custom_theme = value
            this.plugin.saveSettings()
            this.plugin.messageService!.sendMessage('custom-theme-changed', value)
        })
    }
    private async updateThemeOptions() {
        const themes = await this._themeManager.loadThemes()

        //clear all options
        this._themeDropdown!.selectEl.length = 0
        this._themeDropdown!.addOption('--default--', $t('views.theme-manager.default-theme'))
        themes.forEach(theme => {
            this._themeDropdown!.addOption(theme.path, theme.name)
        })
        if (this.plugin.settings!.custom_theme === undefined || !this.plugin.settings!.custom_theme) {
            this._themeDropdown!.setValue('--default--')
        } else {
            this._themeDropdown!.setValue(this.plugin.settings!.custom_theme)
        }

    }
    onThemeChange(file: TFile) {
        if (file instanceof TFile && file.extension === 'md' && file.path.startsWith(this.plugin.settings!.css_styles_folder)) {
            this.updateThemeOptions()
        } else {

        }
    }
    public startWatchThemes() {
        this.plugin.registerEvent(
            this.plugin.app.vault.on('rename', (file: TFile) => {
                this.onThemeChange(file)
            })
        );
        this.plugin.registerEvent(
            this.plugin.app.vault.on('modify', (file: TFile) => {
                this.onThemeChange(file)

            })
        );

        this.plugin.registerEvent(
            this.plugin.app.vault.on('create', (file: TFile) => {
                this.onThemeChange(file)
            })
        );

        this.plugin.registerEvent(
            this.plugin.app.vault.on('delete', (file: TFile) => {
                this.onThemeChange(file)
            })
        );
    }
}
