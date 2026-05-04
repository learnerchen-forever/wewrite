/**
 * Manipulate WeChat API
 * credits to Sun Booshi, and another author of wechat public platform.
 */

import {
	getBlobArrayBuffer,
	Notice,
	requestUrl,
	RequestUrlParam,
} from "obsidian";
import { LocalDraftItem } from "src/assets/draft-manager";
import WeWritePlugin from "src/main";

import { getErrorMessage } from "./error-code";
import { $t } from "src/lang/i18n";
import { MSG_TYPE } from "src/utils/message-service";

export class WechatClient {
	private static instance: WechatClient;
	private plugin: WeWritePlugin;
	readonly baseUrl: string = "https://api.weixin.qq.com/cgi-bin";

	private constructor(plugin: WeWritePlugin) {
		this.plugin = plugin;
	}
	public static getInstance(plugin: WeWritePlugin): WechatClient {
		if (!WechatClient.instance) {
			WechatClient.instance = new WechatClient(plugin);
		}
		return WechatClient.instance;
	}

	public async requestToken(): Promise<string | null> {
		const url = "https://wewrite.3thinking.cn/mp_token";
		const account = this.plugin.getSelectedMPAccount();
		if (account === undefined) {
			new Notice($t("wechat-api.select-an-wechat-mp-account-first"));
			return null;
		}
		const { appId, appSecret, doc_id } = account;
		let params;
		if (doc_id === undefined || !doc_id) {
			params = {
				app_id: appId,
				secret: appSecret,
			};
		} else {
			params = {
				doc_id: doc_id,
			};
		}

		try {
			const result = await requestUrl({
				method: "POST",
				url: url,
				headers: { "Content-Type": "application/json" },
				throw: false,
				body: JSON.stringify(params),
			});
			if (result.status !== 200) {
				new Notice(result.text, 0);
				return null;
			}
			const { code, data, message, server_errcode, server_errmsg } =
				result.json;
			if (code !== 0) {
				if (code == -2) {
					account.doc_id = undefined;
					this.plugin.saveSettings();
					return await this.requestToken();
				}
				if (code == -10) {
					//white list
					if (data.errcode === 40164) {
						const { ipv4 } = extractIPs(data.errmsg);
						if (ipv4[0] !== undefined && ipv4[0]) {
							new Notice(
								$t(
									"wechat-api.add-ip-address-ipv4-0-to-wechat-mp-ip-wh",
									[ipv4[0]]
								)
							);
						}
					}
				}
				return null;
			}
			if (data.last_token === undefined) {
				new Notice(
					$t("wechat-api.failed-to-get-wechat-access-token"),
					0
				);
				return null;
			}
			account.access_token = data.last_token;
			account.doc_id = data.doc_id;
			account.expires_in = data.expiretime;
			account.lastRefreshTime = new Date().getTime();
			this.plugin.saveSettings();
			return data.last_token;
		} catch (error) {
			console.error("Get wechat access token error:", error);
			new Notice(
				$t("wechat-api.failed-to-get-wechat-access-token"),
				0
			);
			return null;
		}
	}

	private getHeaders() {
		return {
			"Accept-Encoding": "gzip, deflate, br",
			"Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
		};
	}
	public async getAccessToken(appId: string, appSecret: string) {
		const url = `${this.baseUrl}/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`;
		const req: RequestUrlParam = {
			url: url,
			method: "GET",
			headers: this.getHeaders(),
		};
		const resp = await requestUrl(req);

		const { access_token, errcode, expires_in } = resp.json;
		const respAccessToken: string = resp.json["access_token"];

		if (access_token === undefined) {
			new Notice(getErrorMessage(errcode), 0);
			return false;
		}
		return { access_token, expires_in };
	}
	public async getBatchMaterial(
		accountName: string | undefined,
		type: string,
		offset: number = 0,
		count: number = 10
	) {
		const accessToken = await this.plugin.refreshAccessToken(accountName);
		if (!accessToken) {
			return false;
		}
		const url =
			"https://api.weixin.qq.com/cgi-bin/material/batchget_material?access_token=" +
			accessToken;
		const body = {
			type,
			offset,
			count,
		};

		const res = await requestUrl({
			method: "POST",
			url: url,
			throw: false,
			body: JSON.stringify(body),
		});

		return await res.json;
	}
	public async sendArticleToDraftBox(
		localDraft: LocalDraftItem,
		data: string
	) {
		const accessToken = await this.plugin.refreshAccessToken(
			this.plugin.settings!.selectedMPAccount
		);
		if (!accessToken) {
			return false;
		}
		const url =
			"https://api.weixin.qq.com/cgi-bin/draft/add?access_token=" +
			accessToken;
		const body = {
			articles: [
				{
					title: localDraft.title,
					content: data,
					digest: localDraft.digest,
					thumb_media_id: localDraft.thumb_media_id,
					...(localDraft.content_source_url && {
						content_source_url: localDraft.content_source_url,
					}),
					...(localDraft.need_open_comment !== undefined && {
						need_open_comment: localDraft.need_open_comment,
					}),
					...(localDraft.only_fans_can_comment !== undefined && {
						only_fans_can_comment: localDraft.only_fans_can_comment,
					}),
					...(localDraft.author && { author: localDraft.author }),
				},
			],
		};

		const res = await requestUrl({
			method: "POST",
			url: url,
			throw: false,
			body: JSON.stringify(body),
		});

		const { errcode, media_id } = res.json;
		if (errcode !== undefined && errcode !== 0) {
			new Notice(getErrorMessage(errcode), 0);
			return false;
		} else {
			new Notice($t("wechat-api.send-article-to-draft-box-successfully"));
		}

		return media_id;
	}

	public async uploadXMaterial(data: Blob, filename: string, type?: string) {
		//check size
		if (type === "video") {
			// < 10M
			if (data.size > 1024 * 1024 * 10) {
				new Notice($t("wechat-api.video-size-exceeds-10m"));
				return false;
			}
		} else if (type === "voice") {
			// < 2M
			if (data.size > 1024 * 1024 * 2) {
				new Notice($t("wechat-api.voice-size-exceeds-2m"));
				return false;
			}
		} else {
			// < 10M
			if (data.size > 1024 * 1024 * 10) {
				new Notice($t("wechat-api.image-size-exceeds-10m"));
				return false;
			}
		}
		const accessToken = await this.plugin.refreshAccessToken(
			this.plugin.settings!.selectedMPAccount
		);
		if (!accessToken) {
			return false;
		}

		let url = `https://api.weixin.qq.com/cgi-bin/media/uploadimg?access_token=${accessToken}`;
		if (type === undefined && data.size >= 1024 * 1024) {
			type = "image";
		}
		if (type !== undefined) {
			url = `https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${accessToken}&type=${type}`;
		}

		const N = 16; // The length of our random boundry string
		const randomBoundryString =
			"wewriteBoundary" +
			Array(N + 1)
				.join(
					(Math.random().toString(36) + "00000000000000000").slice(
						2,
						18
					)
				)
				.slice(0, N);

		const bodyParts = [];

		const description = JSON.stringify({
			title: "title of video",
			content: "content of video",
		});

		bodyParts.push(
			`-----${randomBoundryString}\r\n` +
				`Content-Disposition: form-data; name="media"; filename="${filename}"\r\n` +
				`Content-Type: "application/octet-stream"\r\n\r\n`
		);

		// 将 Blob 转换为 Uint8Array
		const blob = await getBlobArrayBuffer(data);

		bodyParts.push(blob);
		bodyParts.push(`\r\n`);

		if (type === "video") {
			bodyParts.push(
				`-----${randomBoundryString}\r\n` +
					'Content-Disposition: form-data; name="description"\r\n' +
					"Content-Type: application/json\r\n\r\n" +
					description +
					"\r\n"
			);
		}

		bodyParts.push(`-----${randomBoundryString}--\r\n`);

		const encoder = new TextEncoder();

		const body = bodyParts.map((part) => {
			if (typeof part === "string") {
				return encoder.encode(part);
			} else {
				return part;
			}
		});


		const bodyBuffer = await new Blob(body).arrayBuffer();
		const options: RequestUrlParam = {
			method: "POST",
			url: url,
			contentType: `multipart/form-data; boundary=----${randomBoundryString}`,
			body: bodyBuffer,
		};

		const res = await requestUrl(options);


		const resData = await res.json;
		if (resData.errcode === undefined || resData.errcode == 0) {
			this.plugin.messageService!.sendMessage(
				(type + "-item-updated") as MSG_TYPE,
				resData
			);
		}
		return {
			url: resData.url || "",
			media_id: resData.media_id || "",
			errcode: resData.errcode || 0,
			errmsg: resData.errmsg || "",
		};
	}

	async uploadMaterial(data: Blob, filename: string, type?: string) {

		//check size
		if (type === "video") {
			// < 10M
			if (data.size > 1024 * 1024 * 10) {
				new Notice($t("wechat-api.video-size-exceeds-10m"));
				return false;
			}
		} else if (type === "voice") {
			// < 2M
			if (data.size > 1024 * 1024 * 2) {
				new Notice($t("wechat-api.voice-size-exceeds-2m"));
				return false;
			}
		} else {
			// < 10M
			if (data.size > 1024 * 1024 * 10) {
				new Notice($t("wechat-api.image-size-exceeds-10m"));
				return false;
			}
		}
		const accessToken = await this.plugin.refreshAccessToken(
			this.plugin.settings!.selectedMPAccount
		);
		if (!accessToken) {
			return false;
		}

		let url = `https://api.weixin.qq.com/cgi-bin/media/uploadimg?access_token=${accessToken}`;
		if (type === undefined && data.size >= 1024 * 1024) {
			type = "image";
		}
		if (type !== undefined) {
			url = `https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${accessToken}&type=${type}`;
		}
		const description = {
			title: "title of video",
			introduction: "content of video",
		};


		// 1. 读取文件内容
		const fileBuffer = await getBlobArrayBuffer(data); //await app.vault.readBinary(filePath); // 使用 Obsidian 的 API 读取文件
		const fileName = filename; //filePath.split('/').pop(); // 获取文件名

		const boundary =
			"----WebKitFormBoundary" + Math.random().toString(36).substring(2);
		const bodyParts: (string | Uint8Array)[] = [];

		// 添加 media 部分
		bodyParts.push(
			`--${boundary}\r\n` +
				`Content-Disposition: form-data; name="media"; filename="${fileName}"\r\n` +
				"Content-Type: application/octet-stream\r\n\r\n"
		);
		bodyParts.push(new Uint8Array(fileBuffer));
		bodyParts.push("\r\n");

		// 如果是视频素材，添加 description 部分
		if (type === "video" && description) {
			bodyParts.push(
				`--${boundary}\r\n` +
					'Content-Disposition: form-data; name="description"\r\n' +
					"Content-Type: application/json\r\n\r\n" +
					JSON.stringify(description) +
					"\r\n"
			);
		}

		// 添加结束边界
		bodyParts.push(`--${boundary}--\r\n`);

		// 3. 将 bodyParts 转换为 ArrayBuffer
		const encoder = new TextEncoder();
		const body = bodyParts
			.map((part) => {
				if (typeof part === "string") return encoder.encode(part);
				return part;
			})
			.reduce((acc, part) => {
				const combined = new Uint8Array(acc.length + part.length);
				combined.set(acc);
				combined.set(part, acc.length);
				return combined;
			}, new Uint8Array(0));

		// 4. 使用 requestUrl 发送请求
		
		try {
			this.plugin.showSpinner($t('wechat-api.uploading-material-type', [type?type:'unknown']))
			const response = await requestUrl({
				url: url,
				method: "POST",
				headers: {
					"Content-Type": `multipart/form-data; boundary=${boundary}`,
				},
				body: body.buffer as ArrayBuffer,
			});

			// return result; // 返回上传结果
			this.plugin.hideSpinner()
			const resData = await response.json;
			if (resData.errcode === undefined || resData.errcode == 0) {
				this.plugin.messageService!.sendMessage(
					(type + "-item-updated") as MSG_TYPE,
					resData
				);
			}
			return {
				url: resData.url || "",
				media_id: resData.media_id || "",
				errcode: resData.errcode || 0,
				errmsg: resData.errmsg || "",
			};
		} catch (error) {
			this.plugin.hideSpinner()
			console.error("上传素材时出错:", error);
			throw error;
		}
	}
	public async getMaterialList(
		accountName: string,
		type: string,
		offset: number = 0,
		count: number = 20
	) {
		const accessToken = await this.plugin.refreshAccessToken(accountName);
		if (!accessToken) {
			return false;
		}
		// get all images by loop
		const url = `${this.baseUrl}/material/batchget_material?access_token=${accessToken}`;
		const body = {
			type: type, // image, video, voice, news
			offset: offset,
			count: count,
		};

		const req: RequestUrlParam = {
			url: url,
			method: "POST",
			headers: this.getHeaders(),
			body: JSON.stringify(body),
		};
		const resp = await requestUrl(req);

		return resp.json;
	}
	public async getMaterialById(media_id: string, accountName?: string) {
		if (!media_id) {
			return false;
		}
		if (accountName === undefined) {
			accountName = this.plugin.settings!.selectedMPAccount;
		}
		const accessToken = await this.plugin.refreshAccessToken(accountName);
		if (!accessToken) {
			return false;
		}
		// get all images by loop
		const url = `${this.baseUrl}/material/get_material?access_token=${accessToken}`;
		const body = {
			media_id: media_id,
		};

		const req: RequestUrlParam = {
			url: url,
			method: "POST",
			headers: this.getHeaders(),
			body: JSON.stringify(body),
		};
		const resp = await requestUrl(req);
		return resp.json;
	}
	public async getBatchDraftList(
		accountName: string | undefined,
		offset: number = 0,
		count: number = 20
	) {
		const accessToken = await this.plugin.refreshAccessToken(accountName);
		if (!accessToken) {
			return false;
		}
		// get all images by loop
		const url = `${this.baseUrl}/draft/batchget?access_token=${accessToken}`;
		const body = {
			offset: offset,
			count: count,
			no_content: false,
		};

		const req: RequestUrlParam = {
			url: url,
			method: "POST",
			headers: this.getHeaders(),
			body: JSON.stringify(body),
		};
		const resp = await requestUrl(req);

		return resp.json;
	}

	public async getMaterialCounts(accountName: string) {
		const accessToken = await this.plugin.refreshAccessToken(accountName);
		if (!accessToken) {
			return false;
		}

		const url = `${this.baseUrl}/material/get_materialcount?access_token=${accessToken}`;
		const req: RequestUrlParam = {
			url: url,
			method: "GET",
			headers: this.getHeaders(),
		};
		const resp = await requestUrl(req);

		const { errcode, voice_count, video_count, image_count, news_count } =
			resp.json;
		if (errcode !== undefined && errcode !== 0) {
			new Notice(getErrorMessage(errcode), 0);
			return false;
		} else {
			return resp.json;
		}
	}
	public async getDraftCount(accountName: string) {
		const accessToken = this.plugin.getAccessToken(accountName);
		const url = `${this.baseUrl}/draft/count?access_token=${accessToken}`;
		const req: RequestUrlParam = {
			url: url,
			method: "GET",
			headers: this.getHeaders(),
		};
		const resp = await requestUrl(req);

		const { errcode, total_count } = resp.json;
		if (errcode !== undefined && errcode !== 0) {
			new Notice(getErrorMessage(errcode), 0);
			return false;
		} else {
			return total_count;
		}
	}
	public async getDraftById(accountName: string, meida_id: string) {
		const accessToken = await this.plugin.refreshAccessToken(accountName);
		if (!accessToken) {
			return false;
		}
		// get all images by loop
		const url = `${this.baseUrl}/draft/get?access_token=${accessToken}`;
		const body = {
			media_id: meida_id,
		};

		const req: RequestUrlParam = {
			url: url,
			method: "POST",
			headers: this.getHeaders(),
			body: JSON.stringify(body),
		};
		const resp = await requestUrl(req);

		const { errcode, news_item } = resp.json;
		if (errcode !== undefined && errcode !== 0) {
			new Notice(getErrorMessage(errcode), 0);
			return false;
		} else {
			return news_item;
		}
	}
	public async publishDraft(meida_id: string, accountName: string = "") {
		if (!accountName) {
			accountName = this.plugin.settings!.selectedMPAccount!;
		}
		const accessToken = await this.plugin.refreshAccessToken(accountName);
		if (!accessToken) {
			return false;
		}
		// get all images by loop
		const url = `${this.baseUrl}/freepublish/submit?access_token=${accessToken}`;
		const body = {
			media_id: meida_id,
		};

		const req: RequestUrlParam = {
			url: url,
			method: "POST",
			headers: this.getHeaders(),
			body: JSON.stringify(body),
		};
		const resp = await requestUrl(req);

		const { errcode, errmsg, publish_id } = resp.json;
		if (errcode !== undefined && errcode !== 0) {
			new Notice(getErrorMessage(errcode), 0);
			return false;
		} else {
			return publish_id;
		}
	}
	public async deleteMedia(meida_id: string, accountName: string = "") {
		if (!accountName) {
			accountName = this.plugin.settings!.selectedMPAccount!;
		}
		const accessToken = await this.plugin.refreshAccessToken(accountName);
		if (!accessToken) {
			return false;
		}
		// get all images by loop
		const url = `${this.baseUrl}/material/del_material?access_token=${accessToken}`;
		const body = {
			media_id: meida_id,
		};

		const req: RequestUrlParam = {
			url: url,
			method: "POST",
			headers: this.getHeaders(),
			body: JSON.stringify(body),
		};
		const resp = await requestUrl(req);

		const { errcode, errmsg } = resp.json;
		if (errcode !== undefined && errcode !== 0) {
			new Notice(getErrorMessage(errcode), 0);
			return false;
		} else {
			return true;
		}
	}
	public async deleteDraft(meida_id: string, accountName: string = "") {
		if (!accountName) {
			accountName = this.plugin.settings!.selectedMPAccount!;
		}
		const accessToken = await this.plugin.refreshAccessToken(accountName);
		if (!accessToken) {
			return false;
		}
		// get all images by loop
		const url = `${this.baseUrl}/draft/delete?access_token=${accessToken}`;
		const body = {
			media_id: meida_id,
		};

		const req: RequestUrlParam = {
			url: url,
			method: "POST",
			headers: this.getHeaders(),
			body: JSON.stringify(body),
		};
		const resp = await requestUrl(req);

		const { errcode, errmsg } = resp.json;
		if (errcode !== undefined && errcode !== 0) {
			new Notice(getErrorMessage(errcode), 0);
			return false;
		} else {
			return true;
		}
	}
	public async massSendAll(media_id: string, accountName: string = "") {
		if (!accountName) {
			accountName = this.plugin.settings!.selectedMPAccount!;
		}
		const accessToken = await this.plugin.refreshAccessToken(accountName);
		if (!accessToken) {
			return false;
		}
		// get all images by loop
		const url = `${this.baseUrl}/message/mass/sendall?access_token=${accessToken}`;
		const body = {
			filter: {
				is_to_all: true,
			},
			mpnews: {
				media_id: media_id,
			},
			msgtype: "mpnews",
		};

		const req: RequestUrlParam = {
			url: url,
			method: "POST",
			headers: this.getHeaders(),
			body: JSON.stringify(body),
		};
		const resp = await requestUrl(req);

		const { errcode, errmsg } = resp.json;
		if (errcode !== undefined && errcode !== 0) {
			new Notice(getErrorMessage(errcode), 0);
			return false;
		} else {
			return true;
		}
	}
	public async senfForPreview(
		media_id: string,
		wxname: string = "",
		accountName: string = ""
	) {
		if (!accountName) {
			accountName = this.plugin.settings!.selectedMPAccount!;
		}
		if (!wxname) {
			wxname = this.plugin.settings!.previewer_wxname!;
		}
		const accessToken = await this.plugin.refreshAccessToken(accountName);
		if (!accessToken) {
			return false;
		}
		const url = `${this.baseUrl}/message/mass/preview?access_token=${accessToken}`;
		const body = {
			towxname: wxname,
			mpnews: {
				media_id: media_id,
			},
			msgtype: "mpnews",
		};
		const req: RequestUrlParam = {
			url: url,
			method: "POST",
			headers: this.getHeaders(),
			body: JSON.stringify(body),
		};
		const resp = await requestUrl(req);

		const { errcode, errmsg } = resp.json;
		if (errcode !== undefined && errcode !== 0) {
			new Notice(getErrorMessage(errcode), 0);
			return false;
		} else {
			return true;
		}
	}
}

function extractIPs(input: string) {
	const ipv4Pattern = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
	const ipv6Pattern =
		/(?:::ffff:)?([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|::(?:ffff:)?(?:\d{1,3}\.){3}\d{1,3}/g;

	const ipv4Matches = input.match(ipv4Pattern) || [];

	const ipv6Matches = input.match(ipv6Pattern) || [];

	return {
		ipv4: ipv4Matches,
		ipv6: ipv6Matches,
	};
}
