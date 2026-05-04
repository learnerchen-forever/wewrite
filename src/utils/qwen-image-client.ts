import { Notice, requestUrl } from "obsidian";
import { $t } from "src/lang/i18n";
import WeWritePlugin from "src/main";
import {
	WeWriteSetting
} from "src/settings/wewrite-setting";

export class QwenImageClient {
	private static instance: QwenImageClient;
	private plugin: WeWritePlugin;
	private settings: WeWriteSetting | undefined;

	private constructor(plugin: WeWritePlugin) {
		this.plugin = plugin;
		this.settings = this.plugin.settings;
	}

	public static getInstance(plugin: WeWritePlugin): QwenImageClient {
		if (!QwenImageClient.instance) {
			QwenImageClient.instance = new QwenImageClient(plugin);
		}
		return QwenImageClient.instance;
	}

	
	private prepareImageGenerateRequestHeader() {
		const account = this.plugin.getDrawAIAccount();
		if (!account) {
			new Notice($t("settings.no-chat-account-selected"));
			return null;
		}

		if (account.baseUrl === undefined || !account.baseUrl) {
			new Notice($t("utils.no-ai-server-url-given"));
			return null;
		}
		if (account.apiKey === undefined || !account.apiKey) {
			new Notice($t("utils.no-ai-server-key-given"));
			return null;
		}
		const header = {
			url: account.baseUrl,
			method: "POST",
			headers: {
				"X-DashScope-Async": "enable",
				"Content-Type": "application/json",
				Authorization: `Bearer ${account.apiKey}`,
			},
		};
		return header;
	}
	private prepareImageTaskCheckingHeader() {
		const account = this.plugin.getDrawAIAccount();
		if (!account) {
			new Notice($t("settings.no-chat-account-selected"));
			return null;
		}
		if (account.taskUrl === undefined || !account.taskUrl) {
			new Notice($t("utils.no-ai-server-url-given"));
			return null;
		}
		if (account.apiKey === undefined || !account.apiKey) {
			new Notice($t("utils.no-ai-server-key-given"));
			return null;
		}
		const header = {
			url: account.taskUrl,
			method: "GET",
			headers: {
				Authorization: `Bearer ${account.apiKey}`,
			},
		};
		return header;
	}
	

	public async generateCoverImageFromText(
		prompt: string,
		negative_prompt: string = "",
		size: string = "1440*613"
	): Promise<string> {
		return new Promise(async (resolve, reject) => {
			const headers = this.prepareImageGenerateRequestHeader();
			if (!headers) {
				throw new Error($t("utils.missing-api-configuration"));
			}
			const account = this.plugin.getDrawAIAccount();
			if (!account) {
				throw new Error($t("settings.no-chat-account-selected"));
			}
			this.plugin.showSpinner($t("ai.generating-image"));

			const response = await requestUrl({
				...headers,
				body: JSON.stringify({
					model: account.model || "wanx2.1-t2i-turbo",
					input: {
						prompt: prompt,
						negative_prompt: negative_prompt,
					},
					parameters: {
						size: size, //`900*383`,
						n: 1,
					},
				}),
			});

			if (response.status !== 200) {
				throw new Error(
					`API request failed with status ${response.status}`
				);
			}
			const result = response.json;
			const intervalId = setInterval(async () => {
				const json = await this.checkImageGenerationStatus(
					result.output.task_id
				);
				if (json.output.task_status === "SUCCEEDED") {
					clearInterval(intervalId);
					this.plugin.hideSpinner();
					resolve(json.output.results[0].url);
				}
				if (
					json.output.task_status === "FAILED" ||
					json.output.task_status === "UNKNOWN"
				) {
					clearInterval(intervalId);
					this.plugin.hideSpinner();
					resolve("");
				}
			}, 2000);

			setTimeout(() => {
				clearInterval(intervalId);
				reject("");
			}, 30000);
		});
	}

	checkImageGenerationStatus(taskId: string): Promise<any> {
		return new Promise(async (resolve, reject) => {
			const headers = this.prepareImageTaskCheckingHeader();
			if (!headers) {
				this.plugin.hideSpinner();
				throw new Error($t("utils.missing-api-configuration"));
			}
			if (!headers.url.endsWith("/")) {
				headers.url += "/";
			}
			headers.url += taskId;
			const response = await requestUrl({ ...headers, url: headers.url });

			resolve(response.json);
		});
	}

	
}

