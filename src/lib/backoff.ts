/** Wait after 409, 429, and 5xx. Honor Retry-After. Otherwise back off with jitter. */

export function retryAfterSeconds(header: string | null | undefined): number | null {
  const text = String(header || '').trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) return Number(text);
  const at = Date.parse(text);
  if (!Number.isFinite(at)) return null;
  return Math.max(0, Math.ceil((at - Date.now()) / 1000));
}

export function backoffMs(attempt: number, retryAfterHeader?: string | null, random = Math.random()): number {
  const listed = retryAfterSeconds(retryAfterHeader);
  if (listed != null) return listed * 1000;
  const step = Math.min(8, Math.max(0, attempt));
  const base = Math.min(60_000, 1000 * 2 ** step);
  const jitter = Math.floor(random * base * 0.3);
  return base + jitter;
}

export function headerValue(headers: { get?: (name: string) => string | null } | Record<string, string> | undefined, name: string): string {
  if (!headers) return '';
  if (typeof headers.get === 'function') return headers.get(name) || headers.get(name.toLowerCase()) || '';
  const found = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return found ? String(found[1] || '') : '';
}

export class FeedPause extends Error {
  retryAt: number;

  constructor(status: number, retryAfterHeader?: string | null) {
    super(`Feed returned ${status}`);
    this.retryAt = Date.now() + backoffMs(status === 409 || status === 429 ? 4 : 0, retryAfterHeader);
  }
}

export function shouldPoll(visible: boolean, mode: string): boolean {
  if (!visible) return false;
  return mode !== 'demo';
}

export function shouldPollLive(visible: boolean, statuses: string[]): boolean {
  if (!visible) return false;
  return statuses.some((status) => status === 'live' || status === 'halftime');
}
