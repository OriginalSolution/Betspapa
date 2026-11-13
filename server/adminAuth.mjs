/**
 * One shared operator login. The session cookie is an HMAC of its expiry.
 * Its key is derived from ADMIN_PASSWORD_HASH when that is set, otherwise from ADMIN_PASSWORD.
 * Failures are counted in memory only.
 */
import { createHash, createHmac, scryptSync, timingSafeEqual } from 'node:crypto';
import { clientAddress } from './geo.mjs';

export const COOKIE = 'betspapa_admin';
export const SESSION_SECONDS = 12 * 60 * 60;
export const REMEMBER_SECONDS = 30 * 24 * 60 * 60;
export const FAILURE_LIMIT = 5;
export const FAILURE_WINDOW_MS = 10 * 60 * 1000;

const keys = new Map();
const failures = new Map();

export function adminPassword(env = process.env) {
  return String(env.ADMIN_PASSWORD ?? '').trim();
}

export function adminEmail(env = process.env) {
  return String(env.ADMIN_EMAIL ?? '').trim().toLowerCase();
}

export function adminPasswordHash(env = process.env) {
  return String(env.ADMIN_PASSWORD_HASH ?? '').trim();
}

/** Hash wins when it is set, even if a plaintext password is also present. */
export function sessionMaterial(env = process.env) {
  return adminPasswordHash(env) || adminPassword(env);
}

export function emailsMatch(input, expected) {
  const right = String(expected ?? '').trim().toLowerCase();
  if (!right) return false;
  return passwordsMatch(String(input ?? '').trim().toLowerCase(), right);
}

/**
 * `scrypt$<saltHex>$<hashHex>`. The salt passed to scryptSync is the hex
 * string itself, not the decoded bytes. The digest is 64 bytes, written as hex.
 */
export function passwordMatchesHash(input, stored) {
  const parts = String(stored ?? '').split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = parts[1];
  const hashHex = parts[2];
  if (!salt || !/^[0-9a-fA-F]+$/.test(salt) || !/^[0-9a-fA-F]+$/.test(hashHex) || hashHex.length % 2 !== 0) return false;
  let actual;
  try {
    actual = scryptSync(String(input ?? ''), salt, 64);
  } catch {
    return false;
  }
  const expected = Buffer.from(hashHex, 'hex');
  if (actual.length !== expected.length) {
    timingSafeEqual(actual, actual);
    return false;
  }
  return timingSafeEqual(actual, expected);
}

export function passwordAccepted(input, env = process.env) {
  const hash = adminPasswordHash(env);
  if (hash) return passwordMatchesHash(input, hash);
  return passwordsMatch(input, adminPassword(env));
}

export function passwordsMatch(input, expected) {
  const left = createHash('sha256').update(String(input ?? ''), 'utf8').digest();
  const right = createHash('sha256').update(String(expected ?? ''), 'utf8').digest();
  return timingSafeEqual(left, right);
}

function signingKey(password) {
  let key = keys.get(password);
  if (!key) {
    key = createHash('sha256').update(`betspapa-admin-v1\0${password}`).digest();
    keys.set(password, key);
  }
  return key;
}

export function signSession(password, now = Date.now(), maxAgeSeconds = SESSION_SECONDS) {
  const payload = Buffer.from(JSON.stringify({ exp: now + maxAgeSeconds * 1000 })).toString('base64url');
  const sig = createHmac('sha256', signingKey(password)).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySession(token, password, now = Date.now()) {
  if (!password || typeof token !== 'string') return false;
  const splitAt = token.lastIndexOf('.');
  if (splitAt <= 0) return false;
  const payload = token.slice(0, splitAt);
  const sig = token.slice(splitAt + 1);
  const expected = createHmac('sha256', signingKey(password)).update(payload).digest();
  let actual;
  try {
    actual = Buffer.from(sig, 'base64url');
  } catch {
    return false;
  }
  if (actual.length !== expected.length) {
    timingSafeEqual(expected, expected);
    return false;
  }
  if (!timingSafeEqual(actual, expected)) return false;
  try {
    const body = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof body.exp === 'number' && body.exp > now;
  } catch {
    return false;
  }
}

export function readCookie(req, name = COOKIE) {
  const header = req?.headers?.cookie || '';
  for (const part of String(header).split(';')) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    if (trimmed.slice(0, eq) !== name) continue;
    try {
      return decodeURIComponent(trimmed.slice(eq + 1));
    } catch {
      return '';
    }
  }
  return '';
}

export function hasSession(req, env = process.env, now = Date.now()) {
  const secret = sessionMaterial(env);
  if (!secret) return false;
  return verifySession(readCookie(req), secret, now);
}

export function requestIsSecure(req, env = process.env) {
  const forwarded = String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  if (forwarded === 'https') return true;
  if (String(env.NODE_ENV || '') === 'production') return true;
  if (env.RENDER) return true;
  return false;
}

export function cookieHeader(token, { secure = false, maxAge = SESSION_SECONDS, sameSite = 'Strict' } = {}) {
  const site = sameSite === 'Lax' ? 'Lax' : 'Strict';
  const parts = [`${COOKIE}=${encodeURIComponent(token)}`, 'HttpOnly', `SameSite=${site}`, 'Path=/', `Max-Age=${maxAge}`];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function sessionCookie(password, secure, now = Date.now(), options = {}) {
  const maxAge = options.maxAge ?? SESSION_SECONDS;
  const sameSite = options.sameSite || 'Strict';
  return cookieHeader(signSession(password, now, maxAge), { secure, maxAge, sameSite });
}

export function clearCookie(secure) {
  return cookieHeader('', { secure, maxAge: 0 });
}

function bucket(ip, now) {
  const row = failures.get(ip);
  if (!row || row.resetAt <= now) return null;
  return row;
}

export function tooManyFailures(ip, now = Date.now()) {
  const row = bucket(ip, now);
  return Boolean(row && row.count >= FAILURE_LIMIT);
}

export function noteFailure(ip, now = Date.now()) {
  const row = bucket(ip, now);
  if (!row) failures.set(ip, { count: 1, resetAt: now + FAILURE_WINDOW_MS });
  else row.count += 1;
}

export function clearFailures(ip) {
  if (ip) failures.delete(ip);
}

export function retryAfterSeconds(ip, now = Date.now()) {
  const row = bucket(ip, now);
  if (!row) return 1;
  return Math.max(1, Math.ceil((row.resetAt - now) / 1000));
}

export function resetThrottle() {
  failures.clear();
}

export function failureAddress(req) {
  return clientAddress(req) || 'unknown';
}
