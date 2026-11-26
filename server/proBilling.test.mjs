import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { playJwt, readEntitlements, readSubscription, rememberEntitlement, serviceAccountFrom, SERVICE_ACCOUNT_ENV, verifyPlayPurchase, writeEntitlements } from './proBilling.mjs';

function account() {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    client_email: 'play@test.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };
}

test('a missing or unusable service account is not configured and the key is not echoed', () => {
  assert.equal(serviceAccountFrom({}), null);
  assert.equal(serviceAccountFrom({ [SERVICE_ACCOUNT_ENV]: '{not json' }), null);
  assert.equal(serviceAccountFrom({ [SERVICE_ACCOUNT_ENV]: JSON.stringify({ client_email: 'a@b.c' }) }), null);
  const parsed = serviceAccountFrom({ [SERVICE_ACCOUNT_ENV]: JSON.stringify(account()) });
  assert.equal(parsed.client_email, 'play@test.iam.gserviceaccount.com');
  assert.equal(JSON.stringify(parsed).includes('BEGIN'), true);
});

test('an active matching subscription is entitled and an old one is not', () => {
  const live = readSubscription({
    subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
    lineItems: [{ productId: 'betspapa_pro_monthly', expiryTime: '2026-12-26T00:00:00.000Z' }],
  }, 'betspapa_pro_monthly', Date.parse('2026-11-26T00:00:00.000Z'));
  assert.equal(live.entitled, true);
  const expired = readSubscription({
    subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED',
    lineItems: [{ productId: 'betspapa_pro_weekly', expiryTime: '2026-11-01T00:00:00.000Z' }],
  }, 'betspapa_pro_weekly', Date.parse('2026-11-26T00:00:00.000Z'));
  assert.equal(expired.entitled, false);
  assert.equal(readSubscription({ subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', lineItems: [{ productId: 'other', expiryTime: '2027-01-01T00:00:00.000Z' }] }, 'betspapa_pro_yearly', Date.parse('2026-11-26T00:00:00.000Z')).entitled, false);
});

test('verify stores an entitlement and keeps a backup of the previous file', async () => {
  const key = account();
  const env = { [SERVICE_ACCOUNT_ENV]: JSON.stringify(key) };
  const fetchImpl = async (url) => {
    if (String(url).includes('oauth2.googleapis.com')) return { ok: true, json: async () => ({ access_token: 'ya29.test' }) };
    return {
      ok: true,
      json: async () => ({
        subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
        lineItems: [{ productId: 'betspapa_pro_yearly', expiryTime: '2027-11-26T00:00:00.000Z' }],
      }),
    };
  };
  const missing = await verifyPlayPurchase({ productId: 'betspapa_pro_yearly', purchaseToken: 'token-12345678', env: {}, fetchImpl });
  assert.equal(missing.status, 503);
  assert.equal(JSON.stringify(missing).includes('PRIVATE'), false);
  const result = await verifyPlayPurchase({ productId: 'betspapa_pro_yearly', purchaseToken: 'token-12345678', env, fetchImpl, nowMs: Date.parse('2026-11-26T00:00:00.000Z') });
  assert.equal(result.status, 200);
  assert.equal(result.body.entitled, true);
  const dir = mkdtempSync(join(tmpdir(), 'pro-'));
  const file = join(dir, 'pro-entitlements.json');
  writeEntitlements(file, { version: 1, items: { old: { productId: 'betspapa_pro_weekly', expiryMs: 1, state: 'x', token: 't', updatedAt: '' } } });
  const book = rememberEntitlement(readEntitlements(file), result.store);
  writeEntitlements(file, book);
  const bak = JSON.parse(readFileSync(`${file}.bak`, 'utf8'));
  assert.equal(bak.items.old.productId, 'betspapa_pro_weekly');
  writeFileSync(file, '{');
  const restored = readEntitlements(file);
  assert.equal(restored.items.old.productId, 'betspapa_pro_weekly');
  assert.equal(playJwt(key).split('.').length, 3);
});
