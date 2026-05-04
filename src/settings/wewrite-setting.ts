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

// export type WeWriteAccountInfo = WeChatAccountInfo | AIChatAccountInfo | AITaskAccountInfo;
export type WeWriteSetting = {
	useCenterToken: boolean;
    realTimeRender: boolean;
    previewer_wxname?: string;
    custom_theme?: string;
    codeLineNumber: boolean;
    css_styles_folder: string;
    _id?: string; // = 'wewrite-setting';
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

// Use the storage abstraction layer
const db = settingsStorage;


export const getWeWriteSetting = async (): Promise<WeWriteSetting | undefined> => {
    return new Promise((resolve, reject) => {
        db.get('wewrite-settings')
            .then((doc: any) => {
                resolve(doc);
            })
            .catch((error: any) => {
                console.info('Error getting WeWriteSetting:', error);
                resolve(undefined)
            });
    })
}

export const saveWeWriteSetting = async (doc: WeWriteSetting): Promise<void> => {
    return new Promise((resolve, reject) => {
        doc._id = 'wewrite-settings';
        db.get(doc._id).then(existedDoc => {
            if (areObjectsEqual(doc, existedDoc)) {
                resolve()
            }
            doc._rev = existedDoc._rev;
            db.put(doc)
                .then(() => {
                    resolve();
                })
                .catch((error: any) => {
                    console.error('Error setting WeWriteSetting:', error);
                    resolve()
                });
        }).catch(error => {
            db.put(doc)
                .then(() => {
                    resolve();
                })
                .catch((error: any) => {
                    console.error('Error setting WeWriteSetting:', error);
                    resolve()
                });
        })
    })
}