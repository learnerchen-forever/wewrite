import { requestUrl } from "obsidian";

export async function getPublicIpAddress(): Promise<string> {
    const response = await requestUrl('https://httpbin.org/ip');
    return response.json.origin;
}
