/*
manage the wechat account settings

*/
import { settingsStorage } from 'src/utils/storage';
import { areObjectsEqual } from 'src/utils/utils';

export type WeChatAccountInfo = {
    _id?: string;
    accountName: string;
    appId: string;
    appSecret: string;
    access_token?: string;
    expires_in?: number;
    lastRefreshTime?: number;
    isTokenValid?: boolean;
    doc_id?: string;
}

export type AIChatAccountInfo = {
    _id?: string;
    accountName: string;
    baseUrl: string;
    apiKey: string;
    model: string;
    doc_id?: string;
}
export type AITaskAccountInfo = {
    _id?: string;
    accountName: string;
    baseUrl: string;
    taskUrl: string;
    apiKey: string;
    model: string;
    doc_id?: string;
}

export type WeWriteSetting = {
	useCenterToken: boolean;
    realTimeRender: boolean;
    previewer_wxname?: string;
    custom_theme?: string;
    codeLineNumber: boolean;
    css_styles_folder: string;
    _id?: string;
    _rev?: string;
    ipAddress?: string;
    selectedMPAccount?: string;
    selectedChatAccount?: string;
    selectedDrawAccount?: string;
    mpAccounts: Array<WeChatAccountInfo>;
    chatAccounts: Array<AIChatAccountInfo>;
    drawAccounts: Array<AITaskAccountInfo>;
    accountDataPath: string;
	chatSetting: ChatSetting;

}

export type ChatSetting = {
    _id?: string;
    _rev?: string;
	chatSelected?: string;
	modelSelected?: string;
	temperature?: number;
	top_p?: number;
	frequency_penalty?: number;
	presence_penalty?: number;
	max_tokens?: number;
}

const db = settingsStorage;

export const getWeWriteSetting = async (): Promise<WeWriteSetting | undefined> => {
    try {
        return await db.get('wewrite-settings');
    } catch (error) {
        console.info('Error getting WeWriteSetting:', error);
        return undefined;
    }
}

export const saveWeWriteSetting = async (doc: WeWriteSetting): Promise<void> => {
    doc._id = 'wewrite-settings';
    try {
        const existedDoc = await db.get(doc._id);
        if (areObjectsEqual(doc, existedDoc)) {
            return;
        }
        doc._rev = existedDoc._rev;
        await db.put(doc);
    } catch {
        await db.put(doc);
    }
}
