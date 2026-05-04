import { Notice } from "obsidian";
import OpenAI from "openai";
import { $t } from "src/lang/i18n";
import WeWritePlugin from "src/main";
import { WeWriteSetting } from "src/settings/wewrite-setting";
import { DeepSeekResult } from "../types/types";
import prompt from "./prompt.json";
import { buildPrompt, Prompt } from "./ai-client";
import { ChatCompletionMessage } from "openai/resources";
import { obsidianFetch } from "./fetch";
export class OpenAIClient {
	private static instance: OpenAIClient;
	private plugin: WeWritePlugin;
	private settings: WeWriteSetting | undefined;

	private constructor(plugin: WeWritePlugin) {
		this.plugin = plugin;
		this.settings = this.plugin.settings;
	}

	public static getInstance(plugin: WeWritePlugin): OpenAIClient {
		if (!OpenAIClient.instance) {
			OpenAIClient.instance = new OpenAIClient(plugin);
		}
		return OpenAIClient.instance;
	}

	public async getModelList(
		name: string | undefined = undefined
	): Promise<string[]> {
		// return ["gpt-4", "gpt-3.5-turbo", "gpt-3.5-turbo-16k"];
		const openai = this.getChatAI(name);
		if (!openai) {
			return [];
		}
		const account = this.plugin.getChatAIAccount();
		if (!account) {
			new Notice($t("settings.no-chat-account-selected"));
			return [];
		}
		const models = await openai.models.list();
		return models.data.map((model) => model.id);
	}
	public async generateSummary(content: string): Promise<string | null> {
		const openai = this.getChatAI();
		if (!openai) {
			return "";
		}
		const account = this.plugin.getChatAIAccount();
		if (!account) {
			new Notice($t("settings.no-chat-account-selected"));
			return "";
		}
		const msg = buildPrompt(prompt.summary);
		msg[1].content = msg[1].content.replace("{{content}}", content);
		const completion = await openai.chat.completions.create({
			model: account.model || "qwen-plus", //"deepseek-chat",
			messages: msg as ChatCompletionMessage[],
		});
		return completion.choices[0].message.content;
	}

	public async proofContent(content: string): Promise<DeepSeekResult | null> {
		const openai = this.getChatAI();
		if (!openai) {
			return null;
		}
		const account = this.plugin.getChatAIAccount();
		if (!account) {
			new Notice($t("settings.no-chat-account-selected"));
			return null;
		}

		const msg = buildPrompt(prompt.proofread);
		msg[1].content = msg[1].content.replace("{{content}}", content);


		try {
			const completion = await openai.chat.completions.create({
				model: account.model || "qwen-plus",
				messages: msg as ChatCompletionMessage[],
				response_format: { type: "json_object" },
				max_tokens: 8192,
				temperature: 0.7,
			});


			const responseContent = completion.choices[0].message.content;
			if (!responseContent) {
				return {
					summary: "",
					corrections: [],
					polished: content,
					coverImage: "",
				};
			}

			const result = JSON.parse(responseContent);
			let start = 0;
			for (const correction of result.corrections) {
				correction.start = content.indexOf(correction.original, start);
				correction.end = correction.start + correction.original.length;
				start = correction.end;
				console.log(
					`text[${correction.start},${correction.end}]: ${correction.original} -> ${correction.suggestion}`
				);
			}

			return {
				summary: "",
				corrections: result.corrections || [],
				polished: result.polished || content,
				coverImage: "",
			};
		} catch (error) {
			console.error("Error in proofContent:", error);
			return {
				summary: "",
				corrections: [],
				polished: content,
				coverImage: "",
			};
		}
	}

	public async polishContent(
		content: string
	): Promise<DeepSeekResult | null> {
		const openai = this.getChatAI();
		if (!openai) {
			return null;
		}
		const account = this.plugin.getChatAIAccount();
		if (!account) {
			new Notice($t("settings.no-chat-account-selected"));
			return null;
		}
		const msg = buildPrompt(prompt.polish);
		msg[1].content = msg[1].content.replace("{{content}}", content);

		const completion = await openai.chat.completions.create({
			model: account.model || "qwen-plus",
			messages: msg as ChatCompletionMessage[],
			max_tokens: 8192,
			temperature: 0.7,
		});
		return {
			summary: "",
			corrections: [],
			polished: completion.choices[0].message.content || "",
			coverImage: "",
		};
	}

	private getChatAI(name: string | undefined = undefined): OpenAI | null {
		const account = this.plugin.getChatAIAccount(name);
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
		const openai = new OpenAI({
			fetch: async (url: RequestInfo, init?: RequestInit): Promise<Response> => {
				const response = await obsidianFetch(url, init);
				return response;
			},
			dangerouslyAllowBrowser: true,
			baseURL: account.baseUrl, 
			apiKey: account.apiKey, 
		});
		return openai;
	}

	public async generateMermaid(content: string): Promise<string> {
		const openai = this.getChatAI();
		if (!openai) {
			return "";
		}
		const account = this.plugin.getChatAIAccount();
		if (!account) {
			new Notice($t("settings.no-chat-account-selected"));
			return "";
		}
		const msg = buildPrompt(prompt.mermaid);
		msg[1].content = msg[1].content.replace("{{content}}", content);

		const completion = await openai.chat.completions.create({
			model: account.model || "qwen-plus",
			messages: msg as ChatCompletionMessage[],
			max_tokens: 1000,
			temperature: 0.7,
		});
		return completion.choices[0].message.content || "";
	}

	public async generateLaTeX(content: string): Promise<string> {
		const openai = this.getChatAI();
		if (!openai) {
			return "";
		}
		const account = this.plugin.getChatAIAccount();
		if (!account) {
			new Notice($t("settings.no-chat-account-selected"));
			return "";
		}
		const msg = buildPrompt(prompt.latex);
		msg[1].content = msg[1].content.replace("{{content}}", content);
		const completion = await openai.chat.completions.create({
			model: account.model || "qwen-plus",
			messages: msg as ChatCompletionMessage[],
			max_tokens: 1000,
			temperature: 0.7,
		});
		return completion.choices[0].message.content || "";
	}

	public async synonym(content: string): Promise<string[]> {
		const openai = this.getChatAI();
		if (!openai) {
			return [];
		}

		const account = this.plugin.getChatAIAccount();
		if (!account) {
			new Notice($t("settings.no-chat-account-selected"));
			return [];
		}
		const msg = buildPrompt(prompt.synonyms);
		msg[1].content = msg[1].content.replace("{{content}}", content);
		const completion = await openai.chat.completions.create({
			model: account.model || "qwen-plus",
			messages: msg as ChatCompletionMessage[],
			max_tokens: 200,
			temperature: 0.7,
		});

		const synonyms =
			completion.choices[0].message.content?.split("\n") || [];
		return synonyms.slice(0, 10);
	}

	public async translateText(
		content: string,
		sourceLang: string = "English",
		targetLang: string = "Chinese"
	): Promise<string> {
		console.log('translateText in openAI');
		
		const openai = this.getChatAI();
		if (!openai) {
			return "";
		}
		const account = this.plugin.getChatAIAccount();
		if (!account) {
			new Notice($t("settings.no-chat-account-selected"));
			return "";
		}
		const msg = buildPrompt(prompt.translate);
		msg[1].content = msg[1].content.replace("{{content}}", content);
		const completion = await openai.chat.completions.create({
			model: account.model || "qwen-plus",
			messages: msg as ChatCompletionMessage[],
			max_tokens: 4096,
			temperature: 0.7,
		});

		return completion.choices[0].message.content || "";
	}
}
