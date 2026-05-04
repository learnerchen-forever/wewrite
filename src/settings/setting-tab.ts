/**
 * tab for setting
 */

import {
	App,
	DropdownComponent,
	Notice,
	PluginSettingTab,
	Setting,
} from "obsidian";
import WeWritePlugin from "src/main";
import { ThemeManager } from "src/theme/theme-manager";
import { $t } from "src/lang/i18n";
import { FolderSuggest } from "src/utils/folder-suggest";
import { WECHAT_MP_WEB_PAGE } from "./mp-web-images";
import {
	AIChatAccountInfo,
	AITaskAccountInfo,
	WeChatAccountInfo,
	WeWriteSetting,
} from "./wewrite-setting";

interface FileSystemFileHandle {
	createWritable(): Promise<FileSystemWritableFileStream>;
	getFile(): Promise<File>;
	queryPermission(options: {
		mode: "read" | "readwrite";
	}): Promise<"granted" | "denied">;
}

interface FileSystemDirectoryHandle {
	getFileHandle(
		name: string,
		options?: { create?: boolean }
	): Promise<FileSystemFileHandle>;
	queryPermission(options: {
		mode: "read" | "readwrite";
	}): Promise<"granted" | "denied">;
}

declare global {
	interface Window {
		showDirectoryPicker(): Promise<FileSystemDirectoryHandle>;
		showSaveFilePicker(
			options?: SaveFilePickerOptions
		): Promise<FileSystemFileHandle>;
	}
}

interface SaveFilePickerOptions {
	suggestedName?: string;
	types?: FilePickerAcceptType[];
}

interface FilePickerAcceptType {
	description: string;
	accept: Record<string, string[]>;
}

export class WeWriteSettingTab extends PluginSettingTab {
	private plugin: WeWritePlugin;
	// appIdEl: Setting;
	// appSecretEl: Setting;
	mpAccountContainer: HTMLElement;
	aiChatAccountContainer: HTMLElement;
	aiDrawAccountContainer: HTMLElement;
	mpAccountDropdown: DropdownComponent;
	aiChatAccountDropdown: DropdownComponent;
	aiDrawAccountDropdown: DropdownComponent;
	constructor(app: App, plugin: WeWritePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	async display(): Promise<void> {
		const { containerEl } = this;

		containerEl.empty();
		this.createWeChatSettings(containerEl);
		this.creatCSSStyleSetting(containerEl);
		this.createAiChatSettings(containerEl);
		this.createAiDrawSettings(containerEl);
		new Setting(containerEl)
			.setName($t("settings.import-export-wewrite-account"))
			.setHeading()
			.setDesc($t("settings.import-or-export-your-account-info-for-b"))
			.setClass("wewrite-import-export-config")
			.addExtraButton((button) => {
				button
					.setIcon("upload")
					.setTooltip($t("settings.import-account-info"))
					.onClick(async () => {
						this.importSettings();
					});
			})
			.addExtraButton((button) => {
				button
					.setIcon("download")
					.setTooltip($t("settings.export-account-info"))
					.onClick(async () => {
						this.exportSettings();
					});
			});
	}
	async exportSettings() {
		try {
			const settingData = JSON.stringify(this.plugin.settings, null, 2);
			const blob = new Blob([settingData], { type: "application/json" });

			// Use File System Access API for better control
			const fileHandle = await window.showSaveFilePicker({
				suggestedName: `wewrite-settings-${new Date()
					.toISOString()
					.slice(0, 10)}.json`,
				types: [
					{
						description: "JSON Files",
						accept: { "application/json": [".json"] },
					},
				],
			});

			// User selected a file location
			const writable = await fileHandle.createWritable();
			await writable.write(blob);
			await writable.close();

			new Notice($t("settings.settings-exported"));
			return true;
		} catch (error) {
			if (error.name === "AbortError") {
				// User canceled the save dialog
				return false;
			}
			new Notice($t("settings.settings-exporting-failed") + error);
			console.error(error);
			return false;
		}
	}

	async importSettings() {
		try {
			// Create file input
			const input = document.createElement("input");
			input.type = "file";
			input.accept = ".json";

			input.onchange = async (e) => {
				const file = (e.target as HTMLInputElement).files?.[0];
				if (!file) return;

				const reader = new FileReader();
				reader.onload = async (e) => {
					try {
						const content = e.target?.result as string;
						let importedData: WeWriteSetting;

						// Validate JSON structure
						try {
							importedData = JSON.parse(content);
						} catch (error) {
							new Notice($t("settings.invalid-json-file"));
							return;
						}

						// Validate account data structure
						const { mpAccounts, css_styles_folder } = importedData;
						if (
							mpAccounts === undefined ||
							css_styles_folder === undefined
						) {
							new Notice(
								$t("settings.invalid-wewerite-settings-file")
							);
							return;
						}
						this.plugin.settings = importedData;
						// save it
						await this.plugin.saveSettings();
						this.updateMPAccountOptions();
						this.display();
						new Notice(
							$t("settings.settings-imported-successfully")
						);
					} catch (error) {
						new Notice(
							$t("settings.settings-imported-failed") + error
						);
						console.error(error);
					}
				};

				reader.readAsText(file);
			};

			input.click();
		} catch (error) {
			new Notice($t("settings.settings-imported-error") + error);
			console.error(error);
		}
	}

	creatCSSStyleSetting(container: HTMLElement) {
		const frame = container.createDiv({ cls: "wewrite-setting-frame" });

		new Setting(frame).setName($t('settings.custom-themes')).setHeading();

		new Setting(frame)
			.setName($t("settings.custom-themes-folder"))
			.setDesc($t("settings.the-folder-where-your-custom-themes"))
			.addSearch((cb) => {
				new FolderSuggest(this.app, cb.inputEl);
				cb.setPlaceholder($t("settings.themes-folder-path"))
					.setValue(this.plugin.settings!.css_styles_folder)
					.onChange((new_folder) => {
						this.plugin.settings!.css_styles_folder = new_folder;
						this.plugin.saveThemeFolderDebounce();
					});
			})
			.addExtraButton((button) => {
				button
					.setIcon("download")
					.setTooltip(
						$t("views.theme-manager.download-predefined-custom-themes")
					)
					.onClick(async () => {
						ThemeManager.getInstance(this.plugin).downloadThemes();
					});
			});
	}
	newMPAccountInfo() {
		let n = 0;
		let newName = $t("settings.new-account");
		while (true) {
			const account = this.plugin.settings!.mpAccounts.find(
				(account: WeChatAccountInfo) => account.accountName === newName
			);
			if (account === undefined || account === null) {
				break;
			}
			n += 1;
			newName = $t("settings.new-account") + "-" + n;
		}

		const newAccount = {
			accountName: newName,
			appId: "",
			appSecret: "",
		};
		this.plugin.settings!.mpAccounts.push(newAccount);
		// this.mpAccountDropdown.addOption(newName, newName);
		this.mpAccountDropdown.selectEl.options.length = 0;
		this.plugin.settings!.mpAccounts.forEach((account) => {
			this.mpAccountDropdown.addOption(
				account.accountName,
				account.accountName
			);
		});
		this.plugin.settings!.selectedMPAccount = newAccount.accountName;
		this.mpAccountDropdown.setValue(newName);
		
		this.updateMPAccountSettings(newName, this.mpAccountContainer);
	}
	updateMPAccountSettings(
		accountName: string | undefined,
		container: HTMLElement
	) {
		if (accountName === undefined) {
			return;
		}
		const account = this.plugin.getMPAccountByName(accountName);
		if (account === undefined) {
			return;
		}
		container.empty();

		//account Name
		new Setting(container)
			.setName($t("settings.account-name"))
			.setDesc($t("settings.account-name-for-your-wechat-official"))
			.setClass("wewrite-setting-input")
			.addText((text) =>
				text.setValue(account.accountName).onChange(async (value) => {
					account.accountName = value;
					this.plugin.settings!.selectedMPAccount = value;
					await this.plugin.saveSettings();
					this.updateMPAccountOptions();
				})
			);
		//addId
		new Setting(container)
			.setName("AppId")
			.setDesc($t("settings.appid-for-your-wechat-official-account"))
			.setClass("wewrite-setting-input")
			.addText((text) =>
				text.setValue(account.appId).onChange(async (value) => {
					account.appId = value;
					await this.plugin.saveSettings();
				})
			);

		//addSecret
		new Setting(container)
			.setName($t("settings.app-secret"))
			.setDesc($t("settings.app-secret-for-your-wechat-official"))
			.setClass("wewrite-setting-input")
			.addText((text) =>
				text.setValue(account.appSecret).onChange(async (value) => {
					account.appSecret = value;
					await this.plugin.saveSettings();
				})
			);
		// refresh token
		new Setting(container)
			.setName($t("settings.test-connection"))
			.setDesc($t("settings.check-if-your-account-setting-is-correct"))
			.addExtraButton(async (button) => {
				button
					.setTooltip($t("settings.click-to-connect-wechat-server"))
					.setIcon("plug-zap");
				button.onClick(async () => {
					const success = await this.plugin.TestAccessToken(
						account.accountName
					);
					if (success) {
						new Notice(
							$t(
								"settings.successfully-connected-to-wechat-server"
							)
						);
					} else {
						new Notice(
							$t("settings.failed-to-connect-to-wechat-server")
						); // 添加错误提示
					}
				});
			});

		// delete this account
		new Setting(container)
			.setName($t("settings.delete-account"))
			.setDesc($t("settings.be-carefull-delete-account"))
			.setClass("danger-extra-button")
			.addExtraButton(async (button) => {
				button
					.setTooltip($t("settings.delete-account"))
					.setIcon("trash-2");
				button.onClick(async () => {
					const accountToDelete =
						this.plugin.settings!.selectedMPAccount;
					this.plugin.settings!.mpAccounts =
						this.plugin.settings!.mpAccounts.filter(
							(account) => account.accountName !== accountToDelete
						);
					const account = this.plugin.settings!.mpAccounts[0];
					
					if (account !== undefined) {
						this.plugin.settings!.selectedMPAccount =
							account.accountName;
						this.updateMPAccountOptions();
						this.updateMPAccountSettings(
							account.accountName,
							this.mpAccountContainer
						);
					} else {
						this.newMPAccountInfo();
					}
					this.plugin.saveSettings();
				});
			});
	}
	updateMPAccountOptions() {
		this.mpAccountDropdown.selectEl.options.length = 0;
		this.plugin.settings!.mpAccounts.forEach((account) => {
			this.mpAccountDropdown.addOption(
				account.accountName,
				account.accountName
			);
		});
		this.mpAccountDropdown.setValue(
			this.plugin.settings!.selectedMPAccount ?? ""
		);
	}
	
	createAiChatSettings(container: HTMLElement) {
		const frame = container.createDiv({ cls: "wewrite-setting-frame" });
		
		new Setting(frame).setName($t('settings.text-llm')).setHeading();

		const  selectAiChatSetting = new Setting(frame)
			.setName($t("settings.select-account"))
			.setDesc($t("settings.choose-the-llm-account-to-modify"))
			
		this.aiChatAccountContainer = frame.createDiv({
			cls: "wewrite-account-info-content",
		});
	
		selectAiChatSetting.addDropdown((dropdown) => {
			this.aiChatAccountDropdown = dropdown;
			dropdown.selectEl.empty();
			this.plugin.settings!.chatAccounts.forEach((account) => {
				dropdown.addOption(
					account.accountName,
					account.accountName
				);
			});
			dropdown
				.setValue(this.plugin.settings!.selectedChatAccount || "")
				.onChange(async (value) => {
					this.plugin.settings!.selectedChatAccount = value;
					this.updateAIChatSettings(
						value,
						this.aiChatAccountContainer
					);
					await this.plugin.saveSettings();
				});
		})
		.addExtraButton((button) => {
			button
				.setIcon("plus")
				.setTooltip($t("settings.create-new-chat-llm-account"))
				.onClick(async () => {
					this.newAIChatAccount();
				});
		});
		this.updateAIChatSettings(
			this.plugin.settings!.selectedChatAccount,
			this.aiChatAccountContainer
		);
	}

	updateAIChatSettings(
		accountName: string | undefined,
		container: HTMLElement
	) {
		const account = this.plugin.getChatAIAccount(accountName);
		if (account === undefined) {
			this.newAIChatAccount();
			return;
		}
		container.empty();

		new Setting(container)
			.setName($t("settings.account-name"))
			.addText((text) =>
				text.setValue(account.accountName).onChange(async (value) => {
					value = value.trim();
					if (value !== account.accountName) {
						account.accountName = value;
						this.plugin.settings!.selectedChatAccount = value;
						await this.plugin.saveSettings();
						this.updateAIChatOptions();
					}
				})
			);

		new Setting(container).setName("base_url").addText((text) =>
			text.setValue(account.baseUrl).onChange(async (value) => {
				account.baseUrl = value;
				await this.plugin.saveSettings();
			})
		);

		new Setting(container).setName("api_key").addText((text) =>
			text.setValue(account.apiKey).onChange(async (value) => {
				account.apiKey = value;
				await this.plugin.saveSettings();
			})
		);

		new Setting(container).setName("model").addText((text) =>
			text.setValue(account.model).onChange(async (value) => {
				account.model = value;
				await this.plugin.saveSettings();
			})
		);

		new Setting(container)
			.setName($t("settings.delete-account"))
			.setClass("danger-extra-button")
			.addExtraButton((button) => {
				button.setIcon("trash-2").onClick(async () => {
					const accountToDelete =
						this.plugin.settings!.selectedChatAccount;
					this.plugin.settings!.chatAccounts =
						this.plugin.settings!.chatAccounts.filter(
							(a) => a.accountName !== accountToDelete
						);
					const account = this.plugin.settings!.chatAccounts[0];
					await this.plugin.saveSettings();
					if (account !== undefined) {
						this.plugin.settings!.selectedChatAccount =
						account.accountName;
						this.updateAIChatOptions();
						this.updateAIChatSettings(
							account.accountName,
							this.aiChatAccountContainer
						);
						await this.plugin.saveSettings();
					}else{
						this.newAIChatAccount();
					}
				});
			});
	}
	updateAIChatOptions() {
		this.aiChatAccountDropdown.selectEl.options.length = 0;
		this.plugin.settings!.chatAccounts.forEach((account) => {
			this.aiChatAccountDropdown.addOption(
				account.accountName,
				account.accountName
			);
		});
		this.aiChatAccountDropdown.setValue(
			this.plugin.settings!.selectedChatAccount ?? ""
		);
	}
	updateAIDrawOptions() {
		this.aiDrawAccountDropdown.selectEl.options.length = 0;
		this.plugin.settings!.drawAccounts.forEach((account) => {
			this.aiDrawAccountDropdown.addOption(
				account.accountName,
				account.accountName
			);
		});
		this.aiDrawAccountDropdown.setValue(
			this.plugin.settings!.selectedDrawAccount ?? ""
		);
	}

	newAIChatAccount() {
		let n = this.plugin.settings!.chatAccounts.length + 1;
		let newName = $t("settings.new-chat-llm-account");
		while (true) {
			const account = this.plugin.settings!.chatAccounts.find(
				(account: AIChatAccountInfo) => account.accountName === newName
			);
			if (account === undefined || account === null) {
				break;
			}
			n += 1;
			newName = $t("settings.new-chat-llm-account") + "-" + n;
		}
		const newAccount = {
			accountName: newName,
			baseUrl: "",
			apiKey: "",
			model: "",
		};
		this.plugin.settings!.chatAccounts.push(newAccount);
		// this.aiChatAccountDropdown.addOption(newName, newName);
		this.aiChatAccountDropdown.selectEl.options.length = 0;
		this.plugin.settings!.chatAccounts.forEach((account) => {
			this.aiChatAccountDropdown.addOption(
				account.accountName,
				account.accountName
			);
		});
		this.aiChatAccountDropdown.setValue(newName);
		this.plugin.settings!.selectedChatAccount = newAccount.accountName;
		this.updateAIChatSettings(newName, this.aiChatAccountContainer);
	}

	// 新增 createAiDrawAccount 方法
	newAiDrawAccount() {
		let n = this.plugin.settings!.drawAccounts.length + 1;
		let newName = $t("settings.new-draw-llm-account");
		while (true) {
			const account = this.plugin.settings!.drawAccounts.find(
				(account: AITaskAccountInfo) => account.accountName === newName
			);
			if (account === undefined || account === null) {
				break;
			}
			n += 1;
			newName = $t("settings.new-draw-llm-account") + "-" + n;
		}
		const newAccount = {
			accountName: newName,
			baseUrl: "",
			apiKey: "",
			taskUrl: "",
			model: "",
		};
		// Add to settings but don't save yet
		this.plugin.settings!.drawAccounts.push(newAccount);
		// this.aiDrawAccountDropdown.addOption(newName, newName);
		this.aiDrawAccountDropdown.selectEl.options.length = 0;
		this.plugin.settings!.drawAccounts.forEach((account) => {
			this.aiDrawAccountDropdown.addOption(
				account.accountName,
				account.accountName
			);
		});
		this.aiDrawAccountDropdown.setValue(newName);
		this.plugin.settings!.selectedDrawAccount = newAccount.accountName;
		this.updateAiDrawSettings(newName, this.aiDrawAccountContainer);
	}

	createAiDrawSettings(container: HTMLElement) {
		const frame = container.createDiv({ cls: "wewrite-setting-frame" });
		new Setting(frame).setName($t("settings.image-llm")).setHeading();

		const selectAIDrawSetting = new Setting(frame)
			.setName($t("settings.select-account"))
			.setDesc($t("settings.choose-the-llm-account-to-modify"))
			
		this.aiDrawAccountContainer = frame.createDiv({
			cls: "wewrite-account-info-content",
		});
		
		selectAIDrawSetting.addDropdown((dropdown) => {
			this.aiDrawAccountDropdown = dropdown;
			dropdown.selectEl.empty();
			this.plugin.settings!.drawAccounts.forEach((account) => {
				dropdown.addOption(
					account.accountName,
					account.accountName
				);
			});
			dropdown
				.setValue(this.plugin.settings!.selectedDrawAccount || "")
				.onChange(async (value) => {
					this.plugin.settings!.selectedDrawAccount = value;
					this.updateAiDrawSettings(
						value,
						this.aiDrawAccountContainer
					);
					await this.plugin.saveSettings();
				});
		})
		.addExtraButton((button) => {
			button
				.setIcon("plus")
				.setTooltip($t("settings.create-new-draw-llm-account"))
				.onClick(async () => {
					this.newAiDrawAccount();
				});
		});
		this.updateAiDrawSettings(
			this.plugin.settings!.selectedDrawAccount,
			this.aiDrawAccountContainer
		);

	}

	// 新增 updateAiDrawSettings 方法
	updateAiDrawSettings(
		accountName: string | undefined,
		container: HTMLElement
	) {
		const account = this.plugin.getDrawAIAccount(accountName);
		if (account === undefined) {
			this.newAiDrawAccount();
			return;
		}
		container.empty();

		new Setting(container)
			.setName($t("settings.account-name"))
			.addText((text) =>
				text.setValue(account.accountName).onChange(async (value) => {
					value = value.trim();
					if (value.trim() !== account.accountName) {
						account.accountName = value.trim();
						this.plugin.settings!.selectedDrawAccount = value;
						await this.plugin.saveSettings();
						this.updateAIDrawOptions();
					}
				})
			);

		new Setting(container).setName("base_url").addText((text) =>
			text.setValue(account.baseUrl).onChange(async (value) => {
				if (value.trim() !== account.baseUrl) {
					account.baseUrl = value;
					await this.plugin.saveSettings();
				}
			})
		);
		new Setting(container).setName("task_url").addText((text) =>
			text.setValue(account.taskUrl).onChange(async (value) => {
				if (value.trim() !== account.taskUrl) {
					account.taskUrl = value;
					await this.plugin.saveSettings();
				}
			})
		);

		new Setting(container).setName("api_key").addText((text) =>
			text.setValue(account.apiKey).onChange(async (value) => {
				if (value.trim() !== account.apiKey) {
					account.apiKey = value;
					await this.plugin.saveSettings();
				}
			})
		);

		new Setting(container).setName("model").addText((text) =>
			text.setValue(account.model).onChange(async (value) => {
				if (value.trim() !== account.model) {
					account.model = value;
					await this.plugin.saveSettings();
				}
			})
		);

		new Setting(container)
			.setName($t("settings.delete-account"))
			.setClass("danger-extra-button")
			.addExtraButton((button) => {
				button.setIcon("trash-2").onClick(async () => {
					const accountToDelete =
						this.plugin.settings!.selectedDrawAccount;
					this.plugin.settings!.drawAccounts =
						this.plugin.settings!.drawAccounts.filter(
							(a) => a.accountName !== accountToDelete
						);
					const account = this.plugin.settings!.drawAccounts[0];
					await this.plugin.saveSettings();
					if (account !== undefined) {
						this.plugin.settings!.selectedDrawAccount =
							account.accountName;
						this.updateAIDrawOptions();
						this.updateAiDrawSettings(
							account.accountName,
							this.aiDrawAccountContainer
						);
						await this.plugin.saveSettings();
					}else{
						this.newAiDrawAccount();
					}
				});
			});
	}

	createWeChatSettings(container: HTMLElement) {
		const mpFrame = container.createDiv({ cls: "wewrite-setting-frame" });
		new Setting(mpFrame).setName($t("settings.wechat-account")).setHeading();
		
		// mpFrame.createEl("hr");

		const ip = new Setting(mpFrame)
			.setName(
				$t("settings.public-ip-address") +
					": " +
					// this.plugin.settings!.ipAddress
					$t('settings.fetching')
			)
			.setHeading()
			.setDesc($t("settings.you-should-add-this-ip-to-ip-whitelist-o"));

		this.plugin.updateIpAddress().then((ipAddress) => {
			console.info("ipAddress: " + ipAddress);
			ip.setName($t("settings.public-ip-address") + ": " + ipAddress);
		}).catch((error) => {
			ip.setName($t("settings.public-ip-address") + ": " + $t("settings.no-ip-address"));
		});

		ip.addExtraButton((button) => {
			button
				.setIcon("clipboard-copy")
				.setTooltip($t("settings.copy-ip-to-clipboard"))
				.onClick(async () => {
					await navigator.clipboard.writeText(
						this.plugin.settings!.ipAddress ?? ""
					);
					new Notice($t("settings.ip-copied-to-clipboard"));
				});
		});

		new Setting(mpFrame)
			.setName($t("settings.use-center-token-server"))
			.setDesc($t("settings.if-your-device-cannot-get-static-pubic-i"))
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings!.useCenterToken)
					.onChange(async (value) => {
						this.plugin.settings!.useCenterToken = value;
						await this.plugin.saveSettings();
					});
			});
		new Setting(mpFrame)
			.setName($t("settings.real-time-render"))
			.setDesc($t("settings.enable-real-time-rendering"))
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings!.realTimeRender)
					.onChange(async (value) => {
						this.plugin.settings!.realTimeRender = value;
						await this.plugin.saveSettings();
					});
			});

		// mpFrame.createEl("hr");

		new Setting(mpFrame).setName($t("settings.account-info")).setHeading();

		const div = mpFrame.createDiv({
			cls: "wewrite-web-image elevated-shadow",
		});
		const link = div.createEl("a", {
			cls: "wewrite-web-image-link",
			href: "https://mp.weixin.qq.com/cgi-bin/frame?t=pages/developsetting/page/developsetting_frame&nav=10141",
		});
		const img = link.createEl("img", { cls: "wewrite-web-image-img" });
		img.src = WECHAT_MP_WEB_PAGE;
		img.alt = "wewrite-web-page";
		// div.innerHTML = `<a href="https://mp.weixin.qq.com/cgi-bin/frame?t=pages/developsetting/page/developsetting_frame&nav=10141"><img src="${WECHAT_MP_WEB_PAGE}" alt="wewrite-web-page"></a> </p>`

		const selectAccountSetting = new Setting(mpFrame)
			.setName($t("settings.select-account"))
			.setHeading()
			.setDesc($t("settings.choose-the-account-to-modify"))
			
		const frame = mpFrame.createDiv({ cls: "wewrite-account-info-div" });
		const title = frame.createEl("div", {
			cls: "wewrite-account-info-title",
			text: $t("settings.account.info"),
		});

		// new Setting(mpFrame).setName($t("settings.draft-previewer-wechat-id"));
		new Setting(mpFrame)
			.setName($t("settings.draft-previewer-wechat-id"))
			.setDesc($t("settings.draft-only-visible-for-the-wechat-user-o"))
			.addText((text) =>
				text
					.setValue(this.plugin.settings!.previewer_wxname || "")
					.onChange(async (value) => {
						this.plugin.settings!.previewer_wxname = value;
						await this.plugin.saveSettings();
					})
			);

		this.mpAccountContainer = frame.createDiv({
			cls: "wewrite-account-info-content",
		});
		
		selectAccountSetting
			.addDropdown((dropdown) => {
				dropdown.selectEl.empty();
				this.mpAccountDropdown = dropdown;
				if (this.plugin.settings!.mpAccounts.length == 0) {
					this.newMPAccountInfo();
				} else {
					this.plugin.settings!.mpAccounts.forEach((account) => {
						dropdown.addOption(
							account.accountName,
							account.accountName
						);
					});
				}
				dropdown
					.setValue(
						this.plugin.settings!.selectedMPAccount ??
							$t("settings.select-account")
					)
					.onChange(async (value) => {
						this.plugin.settings!.selectedMPAccount = value;
						this.updateMPAccountSettings(
							this.plugin.settings!.selectedMPAccount,
							this.mpAccountContainer
						);
						await this.plugin.saveSettings();
						this.plugin.messageService!.sendMessage(
							"wechat-account-changed",
							value
						);
					});
			})
			.addExtraButton((button) => {
				button
					.setIcon("plus")
					.setTooltip($t("settings.create-new-account"))
					.onClick(async () => {
						this.newMPAccountInfo();
					});
			});
			this.updateMPAccountSettings(
				this.mpAccountDropdown.getValue(),
				this.mpAccountContainer
			);
	
		
	}
}
