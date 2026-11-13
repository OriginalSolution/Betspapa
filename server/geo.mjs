/**
 * Country for a device registration. The address is used only to ask a
 * country-only lookup, then dropped. It is never returned or written down.
 */
import { createHash } from 'node:crypto';

const UNKNOWN = new Set(['XX', 'T1', 'A1', 'A2', 'ZZ']);
const HEADER_NAMES = ['cf-ipcountry', 'x-vercel-ip-country', 'cloudfront-viewer-country', 'x-appengine-country', 'x-country-code', 'x-geo-country'];
const OK_TTL = 6 * 60 * 60 * 1000;
const MISS_TTL = 5 * 60 * 1000;
const cache = new Map();

export function cleanCountry(value) {
  const code = String(value || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code) || UNKNOWN.has(code)) return '';
  return code;
}

export function countryFromHeaders(headers = {}) {
  for (const name of HEADER_NAMES) {
    const code = cleanCountry(headers[name]);
    if (code) return code;
  }
  return '';
}

export function isPublicIp(value) {
  const raw = String(value || '').trim().replace(/^::ffff:/i, '').toLowerCase();
  if (!raw || raw === '::1' || raw === 'localhost') return false;
  if (raw.includes(':')) {
    if (raw.startsWith('fc') || raw.startsWith('fd') || raw.startsWith('fe80')) return false;
    return true;
  }
  const parts = raw.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  return true;
}

/** Prefer the client address a proxy appended, never a stored copy. */
export function clientAddress(req) {
  const headers = req?.headers || {};
  const forwarded = headers['x-forwarded-for'];
  if (forwarded) {
    const parts = String(forwarded).split(',').map((part) => part.trim()).filter(Boolean);
    const pub = parts.find((part) => isPublicIp(part));
    if (pub) return pub.replace(/^::ffff:/i, '');
    if (parts[0]) return parts[0].replace(/^::ffff:/i, '');
  }
  const real = headers['x-real-ip'];
  if (real) return String(real).trim().replace(/^::ffff:/i, '');
  return String(req?.socket?.remoteAddress || '').replace(/^::ffff:/i, '');
}

function cacheKey(ip) {
  return createHash('sha256').update(String(ip)).digest('hex');
}

function readCache(ip, now) {
  const hit = cache.get(cacheKey(ip));
  if (!hit || hit.expires <= now) return undefined;
  return hit.code;
}

function writeCache(ip, code, now, ttl) {
  cache.set(cacheKey(ip), { code: code || '', expires: now + ttl });
}

async function readCode(response) {
  const type = String(response.headers?.get?.('content-type') || '');
  if (type.includes('json')) {
    const body = await response.json();
    return cleanCountry(body?.countryCode || body?.country_code || body?.country);
  }
  const text = await response.text();
  return cleanCountry(text);
}

async function ask(url, fetchImpl) {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(1500), headers: { Accept: 'application/json, text/plain' } });
  if (!response.ok) return '';
  return readCode(response);
}

/** Country code only. A miss is cached briefly so a flapping lookup is not retried on every open. */
export async function lookupCountry(ip, fetchImpl = fetch, now = Date.now()) {
  if (!isPublicIp(ip)) return '';
  const cached = readCache(ip, now);
  if (cached !== undefined) return cached;
  const encoded = encodeURIComponent(String(ip).replace(/^::ffff:/i, ''));
  const urls = [
    `https://ipapi.co/${encoded}/country/`,
    `http://ip-api.com/json/${encoded}?fields=countryCode`,
  ];
  for (const url of urls) {
    try {
      const code = await ask(url, fetchImpl);
      if (code) {
        writeCache(ip, code, now, OK_TTL);
        return code;
      }
    } catch {
      /* the next source, then give up */
    }
  }
  writeCache(ip, '', now, MISS_TTL);
  return '';
}

export async function countryForRequest(req, deps = {}) {
  const fromHeader = countryFromHeaders(req?.headers || {});
  if (fromHeader) return fromHeader;
  const ip = clientAddress(req);
  if (!isPublicIp(ip)) return '';
  try {
    return await lookupCountry(ip, deps.fetchImpl || fetch, deps.now);
  } catch {
    return '';
  }
}

export function forgetCountry(ip) {
  cache.delete(cacheKey(ip));
}
