import { requestUrl } from 'obsidian';

function normalizeBody(body: unknown): string | ArrayBuffer | undefined {
  if (typeof body === 'string' || body === undefined) {
    return body;
  }

  if (body instanceof ArrayBuffer) {
    return body;
  }

  if (ArrayBuffer.isView(body)) {
    const view = new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
    return view.slice().buffer;
  }

  throw new Error('Unsupported body type passed to requestUrl');
}

export const obsidianFetch: typeof fetch = async (url, init) => {
  const method = init?.method ?? 'GET';
  const body = normalizeBody(init?.body);

  // Pass through all original headers safely
  const headers: Record<string, string> = {};
  if (init?.headers) {
    const originalHeaders = init.headers as Record<string, string>;
    for (const [key, value] of Object.entries(originalHeaders)) {
      headers[key] = value;
    }
  }

  const param = {
    url: typeof url === 'string' ? url : url.toString(),
    method,
    headers,
    body,
  };

  return await requestUrl(param)
    .then((res) => {
      return {
        ok: res.status >= 200 && res.status < 300,
        status: res.status,
        statusText: '',
        headers: new Headers(res.headers),
        json: async () => JSON.parse(res.text),
        text: async () => res.text,
        arrayBuffer: async () => new TextEncoder().encode(res.text).buffer,
      } as Response;
    })
    .catch((e) => {
      return {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Headers(),
        json: async () => ({ error: e }),
        text: async () => e.toString(),
        arrayBuffer: async () => new TextEncoder().encode(e.toString()).buffer,
      } as Response;
    });
};
