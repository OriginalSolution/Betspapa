/**
 * Google Play subscription checks. The service-account key stays in the
 * environment. This module never logs it and never returns it.
 */
import { createHash, createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { safeWriteFile } from './safeWrite.mjs';

export const PLAY_PRODUCTS = ['betspapa_pro_weekly', 'betspapa_pro_monthly', 'betspapa_pro_yearly'];
export const PACKAGE_NAME = 'com.betspapa.scores';
/** Render env. The value is the service-account JSON. Do not commit it. */
export const SERVICE_ACCOUNT_ENV = 'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON';
export const PACKAGE_ENV = 'GOOGLE_PLAY_PACKAGE_NAME';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const ACTIVE = new Set(['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD']);

export function emptyBook() {
  return { version: 1, items: {} };
}

export function tokenKey(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

export function readEntitlements(file) {
  const parse = (path) => {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || !parsed.items || typeof parsed.items !== 'object') return null;
    return parsed;
  };
  try {
    return parse(file) || emptyBook();
  } catch {
    try {
      return parse(`${file}.bak`) || emptyBook();
    } catch {
      return emptyBook();
    }
  }
}

export function writeEntitlements(file, book) {
  let previous = '';
  try {
    previous = readFileSync(file, 'utf8');
    JSON.parse(previous);
  } catch {
    previous = '';
  }
  if (previous) {
    try {
      safeWriteFile(`${file}.bak`, previous);
    } catch {
      /* a backup failure must not drop the new entitlement */
    }
  }
  safeWriteFile(file, JSON.stringify(book));
}

export function rememberEntitlement(book, { token, productId, expiryMs, state }) {
  const key = tokenKey(token);
  const next = { version: 1, items: { ...book.items } };
  next.items[key] = {
    productId,
    expiryMs,
    state,
    token,
    updatedAt: new Date().toISOString(),
  };
  return next;
}

function b64url(value) {
  return Buffer.from(value).toString('base64url');
}

export function serviceAccountFrom(env = process.env) {
  const raw = env[SERVICE_ACCOUNT_ENV];
  if (!raw || typeof raw !== 'string' || !raw.trim()) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed.client_email !== 'string' || typeof parsed.private_key !== 'string') return null;
  if (!parsed.private_key.includes('PRIVATE KEY')) return null;
  return { client_email: parsed.client_email, private_key: parsed.private_key };
}

export function playJwt(account, nowSec = Math.floor(Date.now() / 1000)) {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: account.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: nowSec,
    exp: nowSec + 3600,
  }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  signer.end();
  return `${header}.${claim}.${signer.sign(account.private_key).toString('base64url')}`;
}

async function accessToken(account, fetchImpl) {
  const assertion = playJwt(account);
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });
  const response = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) return '';
  const json = await response.json();
  return typeof json.access_token === 'string' ? json.access_token : '';
}

export function readSubscription(payload, productId, nowMs = Date.now()) {
  const state = String(payload?.subscriptionState || '');
  const items = Array.isArray(payload?.lineItems) ? payload.lineItems : [];
  const line = items.find((item) => item?.productId === productId) || null;
  if (!line) return { entitled: false, reason: 'product' };
  const expiryMs = Date.parse(line.expiryTime || '');
  if (!ACTIVE.has(state) || !Number.isFinite(expiryMs) || expiryMs <= nowMs) return { entitled: false, reason: 'inactive', expiryMs: Number.isFinite(expiryMs) ? expiryMs : 0, state };
  return { entitled: true, expiryMs, state };
}

export async function verifyPlayPurchase({ productId, purchaseToken, env = process.env, fetchImpl = fetch, nowMs = Date.now() }) {
  if (!PLAY_PRODUCTS.includes(productId)) return { status: 400, body: { entitled: false, error: 'Unknown product.' } };
  if (!purchaseToken || typeof purchaseToken !== 'string' || purchaseToken.length < 8 || purchaseToken.length > 2000) {
    return { status: 400, body: { entitled: false, error: 'Missing purchase token.' } };
  }
  const account = serviceAccountFrom(env);
  if (!account) return { status: 503, body: { entitled: false, error: 'Play billing is not configured.' } };
  const packageName = String(env[PACKAGE_ENV] || PACKAGE_NAME);
  const token = await accessToken(account, fetchImpl);
  if (!token) return { status: 502, body: { entitled: false, error: 'Play did not confirm this purchase.' } };
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;
  const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  if (!response.ok) return { status: 402, body: { entitled: false, error: 'Play did not confirm this purchase.' } };
  const decision = readSubscription(await response.json(), productId, nowMs);
  if (!decision.entitled) return { status: 402, body: { entitled: false, productId } };
  return { status: 200, body: { entitled: true, productId, expiryMs: decision.expiryMs }, store: { token: purchaseToken, productId, expiryMs: decision.expiryMs, state: decision.state } };
}
