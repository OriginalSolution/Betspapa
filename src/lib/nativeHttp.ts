import { Capacitor, CapacitorHttp } from '@capacitor/core';

/** Same browser agent the server booking client sends. Keep the two in step. */
export const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36';

const BLOCKED_HEADERS = new Set(['origin', 'referer', 'referrer']);

/**
 * The Android WebView is served from https://localhost. A browser fetch to
 * api.betspapa.com sends that Origin, and the API answers 403
 * ("Origin not allowed by CORS"), which the WebView surfaces as "Failed to fetch".
 * A request with no Origin is already allowed. Native HTTP does not add Origin.
 * x-cap-user-agent is how Capacitor applies a User-Agent on Android.
 */
export function nativeHeaders(extra: Record<string, string | undefined> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  for (const [key, value] of Object.entries(extra)) {
    if (value == null) continue;
    if (BLOCKED_HEADERS.has(key.toLowerCase())) continue;
    headers[key] = value;
  }
  headers['User-Agent'] = BROWSER_UA;
  headers['x-cap-user-agent'] = BROWSER_UA;
  return headers;
}

export type NativeCall = {
  url: string;
  method: string;
  headers: Record<string, string>;
  data?: unknown;
  responseType: 'json';
  connectTimeout: number;
  readTimeout: number;
};

/** The full upcoming list is about 800 KB. A slow mobile link can stall longer than 20s, and Android then reports the socket error as "timeout". */
export const FIXTURE_CONNECT_MS = 30_000;
export const FIXTURE_READ_MS = 90_000;

export function nativeRequestOptions(
  method: string,
  url: string,
  opts: { body?: unknown; headers?: Record<string, string | undefined>; timeout?: number; connectMs?: number; readMs?: number } = {},
): NativeCall {
  const headers = nativeHeaders({
    ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(opts.headers ?? {}),
  });
  const fallback = (opts.timeout ?? 25) * 1000;
  const call: NativeCall = {
    url,
    method,
    headers,
    responseType: 'json',
    connectTimeout: opts.connectMs ?? fallback,
    readTimeout: opts.readMs ?? fallback,
  };
  if (opts.body !== undefined) call.data = opts.body;
  return call;
}

export function readJsonBody(data: unknown): unknown {
  if (typeof data === 'string') {
    const text = data.trim();
    if (!text || !/^[{\[]/.test(text)) return {};
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return {};
    }
  }
  if (data && typeof data === 'object') return data;
  return {};
}

export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export async function nativeBookRequest(
  method: string,
  url: string,
  opts: { body?: unknown; headers?: Record<string, string>; timeout?: number } = {},
): Promise<unknown> {
  const response = await CapacitorHttp.request(nativeRequestOptions(method, url, opts));
  return readJsonBody(response.data);
}
