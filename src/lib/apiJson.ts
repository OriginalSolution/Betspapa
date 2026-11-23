import { CapacitorHttp } from '@capacitor/core';
import { isNativeApp, nativeRequestOptions } from './nativeHttp';

export const API_ORIGIN = 'https://api.betspapa.com';

/**
 * Where an /api path lives. The Android app is served from https://localhost,
 * so a relative /api path there reads the bundled index.html, not the API.
 * Only the Vite dev server on a desktop browser proxies /api.
 */
export function apiUrl(path: string, opts: { native?: boolean; host?: string } = {}): string {
  const native = opts.native ?? isNativeApp();
  const host = opts.host ?? (typeof location !== 'undefined' ? location.hostname : '');
  if (!native && (host === 'localhost' || host === '127.0.0.1')) return path;
  return `${API_ORIGIN}${path}`;
}

/** A plain error a screen can show as it is. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Turn a response body into JSON, or a readable error when the server sent a web page or nothing. */
export function parseApiBody(status: number, body: unknown, label: string): unknown {
  if (status < 200 || status >= 300) {
    throw new ApiError(`${label} are not available right now (error ${status}). Try again in a moment.`, status);
  }
  if (body && typeof body === 'object') return body;
  const text = typeof body === 'string' ? body.trim() : '';
  if (text && /^[{[]/.test(text)) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      /* fall through */
    }
  }
  throw new ApiError(`${label} could not be read. Check your connection and try again.`, status);
}

/** GET or POST an API path and return its JSON. Native uses CapacitorHttp so no WebView Origin is sent. */
export async function apiJson<T>(path: string, label: string, method: 'GET' | 'POST' = 'GET'): Promise<T> {
  const url = apiUrl(path);
  if (isNativeApp()) {
    let response;
    try {
      response = await CapacitorHttp.request(nativeRequestOptions(method, url, { connectMs: 15_000, readMs: 30_000 }));
    } catch {
      throw new ApiError(`${label} could not load. Check your connection and try again.`, 0);
    }
    return parseApiBody(response.status, response.data, label) as T;
  }
  let response: Response;
  try {
    response = await fetch(url, { method, headers: { Accept: 'application/json' } });
  } catch {
    throw new ApiError(`${label} could not load. Check your connection and try again.`, 0);
  }
  const text = await response.text();
  return parseApiBody(response.status, text, label) as T;
}

/** What a screen shows for a failed load. Never raw parser text such as "Unexpected token '<'". */
export function friendlyError(reason: unknown, fallback: string): string {
  return reason instanceof ApiError ? reason.message : fallback;
}
