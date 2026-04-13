import { $t } from "src/lang/i18n";
import WeWritePlugin from "src/main";
import {
	WeWriteSetting
} from "src/settings/wewrite-setting";
import { DeepSeekResult } from "../types/types";
import { OllamaClient } from "./ollama-client";
import { OpenAIClient } from "./openAI-client";
import { QwenImageClient } from "./qwen-image-client";

export class AiClient {
	private static instance: AiClient;
	private plugin: WeWritePlugin;
	private settings: WeWriteSetting;
	private openaiClient: OpenAIClient;
	private ollamaClient: OllamaClient;
	private imageClient: QwenImageClient;

	private constructor(plugin: WeWritePlugin) {
		this.plugin = plugin;
		this.settings = this.plugin.settings;
		this.openaiClient = OpenAIClient.getInstance(plugin);
		this.ollamaClient = OllamaClient.getInstance(plugin);
		this.imageClient = QwenImageClient.getInstance(plugin);
	}

	public static getInstance(plugin: WeWritePlugin): AiClient {
		if (!AiClient.instance) {
			AiClient.instance = new AiClient(plugin);
		}
		return AiClient.instance;
	}
	private getClient() {
		const account = this.plugin.getChatAIAccount();
		if (!account) {
			throw new Error($t("settings.no-chat-account-selected"));
		}
		if (account.baseUrl === undefined || !account.baseUrl) {
			throw new Error($t("utils.no-ai-server-url-given"));
		}
		
		// 根据API路径特点判断是Ollama还是OpenAI服务
		// Ollama API路径通常包含 /api/chat，OpenAI API路径通常包含 /v1/chat/completions
		if (account.baseUrl.includes("/api/chat")) {
			return this.ollamaClient;
		} else if (account.baseUrl.includes("/v1")) {
			return this.openaiClient;
		} else {
			// 默认情况下，如果包含11434端口则认为是Ollama
			if (account.baseUrl.includes(":11434")) {
				return this.ollamaClient;
			} else {
				return this.openaiClient;
			}
		}
	}
	public async getModelList(account:string|undefined = undefined): Promise<string[]> {
		const client = this.getClient();
		return await client.getModelList(account);
	}
	public async generateSummary(content: string): Promise<string | null> {
		const client = this.getClient();
		return await client.generateSummary(content);
	}
	

	public async proofContent(content: string): Promise<DeepSeekResult | null> {
		const client = this.getClient();
		return await client.proofContent(content);
	}

	public async polishContent(
		content: string
	): Promise<DeepSeekResult | null> {
		const client = this.getClient();
		return await client.polishContent(content);
	}
	


	public async generateCoverImageFromText(
		prompt: string,
		negative_prompt: string = "",
		size: string = "1440*613"
	): Promise<string> {
		return await this.imageClient.generateCoverImageFromText(prompt, negative_prompt, size);
	}


	public async generateMermaid(content: string): Promise<string> {
		const client = this.getClient();
		return await client.generateMermaid(content);
	}

	public async generateLaTeX(content: string): Promise<string> {
		const client = this.getClient();
		return await client.generateLaTeX(content);
	}

	public async synonym(content: string): Promise<string[]> {
		const client = this.getClient();
		return await client.synonym(content);
	}

	public async translateText(
		content: string,
		sourceLang: string = "English",
		targetLang: string = "Chinese"
	): Promise<string> {
		const client = this.getClient();
		return await client.translateText(content, sourceLang, targetLang);
	}
}

export interface Prompt {
	role: string;
	content: string[];
}

export  const buildPrompt = (msg: Prompt[]) => {
	return msg.map((item) => {
		return {
			role: item.role,
			content: item.content.join(""),
		}
	})
};

