/**
 * Keeps public reads small. Health and the admin console are never throttled.
 */
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

export const NOT_LIVE_RETRY_SECONDS = 300;
export const RATE_RETRY_SECONDS = 60;
const WINDOW_MS = 60_000;
const MATCH_LIMIT = 12;
const API_LIMIT = 90;

const windows = new Map();

export function clientIp(req) {
  const forwarded = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req?.socket?.remoteAddress || 'local';
}

export function publicCacheControl(pathname, status) {
  if (status === 409) return `public, max-age=${NOT_LIVE_RETRY_SECONDS}`;
  if (status >= 400) return 'private, no-store';
  if (pathname === '/api/health' || pathname === '/api/live') return 'public, max-age=15';
  if (pathname === '/api/engine' || pathname === '/api/guardian' || pathname === '/api/guardian/incidents') return 'public, max-age=30';
  if (pathname === '/api/fixtures' || pathname === '/api/sportybet/upcoming' || pathname === '/api/promos' || pathname === '/api/config') return 'public, max-age=60';
  if (pathname.startsWith('/api/matches')) return 'public, max-age=15';
  if (pathname.startsWith('/api/')) return 'public, max-age=30';
  return 'public, max-age=60';
}

/** Cloudflare turns a strong ETag into a weak one. Both forms mean the same bytes. */
export function etagMatches(header, etag) {
  if (!header || !etag) return false;
  const got = String(etag).replace(/^W\//, '');
  return String(header).split(',').some((part) => {
    const token = part.trim();
    return token === '*' || token.replace(/^W\//, '') === got;
  });
}

export function staticCacheControl(pathname) {
  if (pathname.startsWith('/crests/') || pathname.startsWith('/bookies/') || pathname.startsWith('/icons/') || pathname.startsWith('/assets/')) {
    return 'public, max-age=31536000, immutable';
  }
  return '';
}

/** Health, admin, and the monitor stay open. Match polls are the tight bucket. */
export function takeRequest(ip, pathname, now = Date.now()) {
  if (pathname === '/api/health' || pathname.startsWith('/api/health/') || pathname.startsWith('/admin') || pathname === '/api/guardian') {
    return { limited: false, retryAfter: 0 };
  }
  const key = `${ip}|${pathname.startsWith('/api/matches') ? 'matches' : 'api'}`;
  const limit = pathname.startsWith('/api/matches') ? MATCH_LIMIT : API_LIMIT;
  const row = windows.get(key) || { start: now, count: 0, blockedUntil: 0 };
  if (row.blockedUntil && now < row.blockedUntil) {
    return { limited: true, retryAfter: Math.max(1, Math.ceil((row.blockedUntil - now) / 1000)) };
  }
  if (now - row.start >= WINDOW_MS) {
    row.start = now;
    row.count = 0;
    row.blockedUntil = 0;
  }
  row.count += 1;
  windows.set(key, row);
  if (row.count <= limit) return { limited: false, retryAfter: 0 };
  const retryAfter = pathname.startsWith('/api/matches') ? NOT_LIVE_RETRY_SECONDS : RATE_RETRY_SECONDS;
  row.blockedUntil = now + retryAfter * 1000;
  return { limited: true, retryAfter };
}

export function resetLimits() {
  windows.clear();
}

export function encodePayload(payload, acceptEncoding) {
  const accept = String(acceptEncoding || '');
  if (payload.length < 800) return { body: payload, encoding: '' };
  if (/\bbr\b/.test(accept)) {
    return {
      body: brotliCompressSync(payload, { params: { [constants.BROTLI_PARAM_QUALITY]: 4 } }),
      encoding: 'br',
    };
  }
  if (/\bgzip\b/.test(accept)) return { body: gzipSync(payload), encoding: 'gzip' };
  return { body: payload, encoding: '' };
}
