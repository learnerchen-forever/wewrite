import { Ollama } from "ollama";
import { $t } from "src/lang/i18n";
import WeWritePlugin from "src/main";
import { WeWriteSetting } from "src/settings/wewrite-setting";
import { DeepSeekResult } from "../types/types";
import { removeThinkTags } from "./utils";
export class OllamaClient {
	private static instance: OllamaClient;
	private plugin: WeWritePlugin;
	private settings: WeWriteSetting | undefined;

	private constructor(plugin: WeWritePlugin) {
		this.plugin = plugin;
		this.settings = this.plugin.settings;
	}

	public static getInstance(plugin: WeWritePlugin): OllamaClient {
		if (!OllamaClient.instance) {
			OllamaClient.instance = new OllamaClient(plugin);
		}
		return OllamaClient.instance;
	}

	private getOllama(name: string | undefined = undefined): {
		ollama: Ollama;
		model: string;
	} {
		const account = this.plugin.getChatAIAccount(name);
		if (!account) {
			throw new Error($t("settings.no-chat-account-selected"));
		}
		if (account.baseUrl === undefined || !account.baseUrl) {
			throw new Error($t("utils.no-ai-server-url-given"));
		}
		if (account.model === undefined || !account.model) {
			throw new Error($t("utils.no-ai-server-model-given"));
		}

		const ollama = new Ollama({
			host: account.baseUrl,
		});
		return { ollama, model: account.model };
	}

	public async getModelList(
		account: string | undefined = undefined
	): Promise<string[]> {
		const { ollama } = this.getOllama(account);
		if (!ollama) {
			return [];
		}
		const models = await ollama.list();
		return models.models.map((model) => model.name);
	}
	public async generateSummary(content: string): Promise<string | null> {
		const { ollama, model } = this.getOllama();
		if (!ollama) {
			return "";
		}
		const response = await ollama.generate({
			model: model || "deepseek-r1",
			prompt: `总结下面的一段话, 句子完整，行文流畅。输出的字数最多100个字符：\n\n${content}`,
			stream: true,
		});

		// 将流式响应拼接成完整的字符串
		let result = "";
		for await (const chunk of response) {
			result += chunk.response || "";
		}
		result = removeThinkTags(result).replace(
			/[\n\s\S]+总结：[\n\s\S]+/g,
			""
		);
		result.replace(/\n/g, "");

		return result;
	}

	public async proofContent(content: string): Promise<DeepSeekResult | null> {
		const { ollama, model } = this.getOllama();
		if (!ollama) {
			return null;
		}
		const response = await ollama.generate({
			model: model || "deepseek-r1",
			prompt: `#角色：你是一个专业的文本校对助手。请分析以下文本，找出所有拼写错误、语法错误和修辞问题。
			# 对于每个问题，请提供：
1. 错误类型（拼写/语法/修辞）
2. 错误位置（开始字符索引，结束字符索引）
3. 错误描述
4. 修改建议

# 请以以下JSON格式返回结果：
{
  "corrections": [
    {
      "type": "拼写|语法|修辞",
      "start": 0,
      "end": 5,
      "description": "错误描述",
      "suggestion": "正确的内容"
    }
  ],
  "polished": "修改后的完整文本"
}
  
# 任务：请校对以下文本：\n\n${content}`,
			stream: true,
		});

		// 将流式响应拼接成完整的字符串
		let result = "";
		for await (const chunk of response) {
			result += chunk.response || "";
		}

		result = removeThinkTags(result).replace(
			/[\n\s\S]+总结：[\n\s\S]+/g,
			""
		);
		const json = JSON.parse(result);

		return {
			summary: "",
			corrections: json.corrections || [],
			polished: result,
			coverImage: "",
		};
	}

	public async polishContent(
		content: string
	): Promise<DeepSeekResult | null> {
		const { ollama, model } = this.getOllama();
		if (!ollama) {
			return null;
		}
		const response = await ollama.generate({
			model: model || "deepseek-r1",
			prompt: `请遵循以下原则润色文本：
1. 保持原文核心意思不变
2. 改进句子结构和语法
3. 提升表达清晰度和流畅度
4. 优化用词，使其更准确和专业
5. 保持适当的语气和风格
6. 确保逻辑连贯性
7. 消除冗余表达
8. 优化段落结构，保持原意但提升表达质量：：\n\n${content}`,
			stream: true,
		});

		// 将流式响应拼接成完整的字符串
		let result = "";
		for await (const chunk of response) {
			result += chunk.response || "";
		}
		result = removeThinkTags(result); //.replace(/[\n\s\S]+总结：[\n\s\S]+/g,"");

		return {
			summary: "",
			corrections: [],
			polished: result,
			coverImage: "",
		};
	}

	public async generateMermaid(content: string): Promise<string> {
		const { ollama, model } = this.getOllama();
		if (!ollama) {
			return "";
		}
		const response = await ollama.generate({
			model: model || "deepseek-r1",
			prompt: `#角色：你是一个专业的Mermaid图表生成助手，请根据提供的文本内容生成相应的Mermaid图表代码。生成的代码应该可以直接插入Markdown文档中使用。

# 任务：请为以下内容生成Mermaid图表代码：\n\n${content}`,
			stream: true,
		});
		// 将流式响应拼接成完整的字符串
		let result = "";
		for await (const chunk of response) {
			result += chunk.response || "";
		}

		result = removeThinkTags(result).replace(
			/[\n\s\S]+总结：[\n\s\S]+/g,
			""
		);
		return result;
	}

	public async generateLaTeX(content: string): Promise<string> {
		const { ollama, model } = this.getOllama();
		if (!ollama) {
			return "";
		}
		const response = await ollama.generate({
			model: model || "deepseek-r1",
			prompt: `#角色：你是一个专业的LaTeX生成助手。请根据提供的文本内容生成相应的LaTeX代码。生成的代码应该可以直接插入Markdown文档中使用。

# 任务：请为以下内容生成LaTeX代码：\n\n${content}`,
			stream: true,
		});
		// 将流式响应拼接成完整的字符串
		let result = "";
		for await (const chunk of response) {
			result += chunk.response || "";
		}

		result = removeThinkTags(result).replace(
			/[\n\s\S]+总结：[\n\s\S]+/g,
			""
		);
		return result;
	}

	public async synonym(content: string): Promise<string[]> {
		const { ollama, model } = this.getOllama();
		if (!ollama) {
			return [];
		}
		const response = await ollama.generate({
			model: model || "deepseek-r1",
			prompt: `#角色：你是一个专业的同义词生成助手。先确定原文的语言，同义表达的语言与原文一致，请为提供的内容生成最多10个不同的同义表达。每个表达应该简洁明了。

# 任务：请为以下内容生成同义表达：\n\n${content}`,
			stream: true,
		});
		// 将流式响应拼接成完整的字符串
		let result = "";
		for await (const chunk of response) {
			result += chunk.response || "";
		}

		result = removeThinkTags(result).replace(
			/[\n\s\S]+总结：[\n\s\S]+/g,
			""
		);
		const synonyms = result.split("\n") || [];
		return synonyms.slice(0, 10);
	}

	public async translateText(
		content: string,
		sourceLang: string = "English",
		targetLang: string = "Chinese"
	): Promise<string> {
		const { ollama, model } = this.getOllama();
		if (!ollama) {
			return "";
		}
		const response = await ollama.generate({
			model: model || "deepseek-r1",
			prompt: `#角色：你是一个专业的翻译助手。请遵循以下原则进行翻译：
1. 保持原文意思准确
2. 使用自然流畅的目标语言表达
3. 保持专业术语的准确性
4. 保持上下文一致性
5. 保留原文格式和特殊符号

# 任务：请将以下内容从${sourceLang}翻译成${targetLang}：\n\n${content}`,
			stream: true,
		});
		// 将流式响应拼接成完整的字符串
		let result = "";
		for await (const chunk of response) {
			result += chunk.response || "";
		}

		result = removeThinkTags(result).replace(
			/[\n\s\S]+总结：[\n\s\S]+/g,
			""
		);
		return result;
	}
}
