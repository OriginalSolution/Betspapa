import assert from 'node:assert/strict';
import { gunzipSync, brotliDecompressSync } from 'node:zlib';
import { request as httpRequest } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { encodePayload, publicCacheControl, resetLimits, staticCacheControl, takeRequest } from './bandwidth.mjs';

function ask(port, { path = '/', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const client = httpRequest({ hostname: '127.0.0.1', port, path, headers }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        const encoding = res.headers['content-encoding'];
        const body = encoding === 'gzip' ? gunzipSync(raw) : encoding === 'br' ? brotliDecompressSync(raw) : raw;
        resolve({
          status: res.statusCode,
          headers: res.headers,
          raw: raw.length,
          body: body.toString('utf8'),
        });
      });
    });
    client.on('error', reject);
    client.end();
  });
}

test('public reads name a short cache and crests stay immutable', () => {
  assert.equal(publicCacheControl('/api/live', 200), 'public, max-age=15');
  assert.equal(publicCacheControl('/api/engine', 200), 'public, max-age=30');
  assert.equal(publicCacheControl('/api/fixtures', 200), 'public, max-age=60');
  assert.equal(publicCacheControl('/api/matches', 409), 'public, max-age=300');
  assert.equal(staticCacheControl('/crests/arsenal.png'), 'public, max-age=31536000, immutable');
});

test('json responses shrink with gzip and brotli', () => {
  const payload = Buffer.from(JSON.stringify({ events: Array.from({ length: 40 }, (_, index) => ({ id: index, name: 'Hearts of Oak versus Asante Kotoko' })) }));
  const gzip = encodePayload(payload, 'gzip');
  const br = encodePayload(payload, 'br, gzip');
  assert.equal(gzip.encoding, 'gzip');
  assert.equal(br.encoding, 'br');
  assert.ok(gzip.body.length < payload.length / 2);
  assert.ok(br.body.length < payload.length / 2);
});

test('match floods are limited and health is not', () => {
  resetLimits();
  const now = 1_000_000;
  for (let i = 0; i < 12; i += 1) assert.equal(takeRequest('203.0.113.9', '/api/matches', now).limited, false);
  const blocked = takeRequest('203.0.113.9', '/api/matches', now + 1000);
  assert.equal(blocked.limited, true);
  assert.equal(blocked.retryAfter, 300);
  assert.equal(takeRequest('203.0.113.9', '/api/health', now).limited, false);
});

test('a missing football key answers 409 with Retry-After, and a repeat is empty', async () => {
  resetLimits();
  const dir = mkdtempSync(join(tmpdir(), 'betspapa-band-'));
  process.env.ENGINE_DATA_DIR = dir;
  process.env.ADMIN_PASSWORD = 'bandwidth-test';
  process.env.ADMIN_EMAIL = 'owner@betspapa.test';
  delete process.env.FOOTBALL_DATA_API_KEY;
  const { createBetspapaServer } = await import('./index.mjs');
  const server = createBetspapaServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    const denied = await ask(port, { path: '/api/matches?from=2026-11-17T00:00:00.000Z&to=2026-11-17T23:59:59.000Z', headers: { 'x-forwarded-for': '203.0.113.50' } });
    assert.equal(denied.status, 409);
    assert.equal(denied.headers['retry-after'], '300');
    assert.ok(denied.body.length < 80);
    assert.match(denied.body, /Not live/);
    assert.match(denied.headers['cache-control'], /max-age=300/);
    const again = await ask(port, {
      path: '/api/matches?from=2026-11-17T00:00:00.000Z&to=2026-11-17T23:59:59.000Z',
      headers: { 'x-forwarded-for': '203.0.113.50', 'if-none-match': denied.headers.etag },
    });
    assert.equal(again.status, 304);
    assert.equal(again.raw, 0);
    const health = await ask(port, { path: '/api/health', headers: { 'x-forwarded-for': '203.0.113.50' } });
    assert.equal(health.status, 200);
    assert.equal(JSON.parse(health.body).ok, true);
    assert.match(health.headers['cache-control'], /max-age=15/);
    const live = await ask(port, {
      path: '/api/engine',
      headers: { 'x-forwarded-for': '203.0.113.51', 'accept-encoding': 'br, gzip' },
    });
    assert.equal(live.status, 200);
    if (live.body.length >= 800) assert.equal(live.headers['content-encoding'], 'br');
    assert.match(live.headers['cache-control'], /max-age=30/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
