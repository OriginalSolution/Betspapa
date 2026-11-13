import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

function ask(port, { method = 'GET', path = '/' } = {}) {
  return new Promise((resolve, reject) => {
    const client = httpRequest({ hostname: '127.0.0.1', port, method, path }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        location: res.headers.location,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    client.on('error', reject);
    client.end();
  });
}

test('a server without the built UI sends pages to betspapa.com and leaves API, admin, and assets alone', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'betspapa-site-'));
  process.env.ENGINE_DATA_DIR = dir;
  process.env.ADMIN_PASSWORD = 'site-test-password';
  process.env.ADMIN_EMAIL = 'owner@betspapa.test';
  const { createBetspapaServer } = await import('./index.mjs');
  const server = createBetspapaServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    const root = await ask(port, { path: '/' });
    const page = await ask(port, { path: '/today' });
    const asset = await ask(port, { path: '/bookies/sportybet.png' });
    const missing = await ask(port, { path: '/crests/does-not-exist.png' });
    const health = await ask(port, { path: '/api/health' });
    const admin = await ask(port, { path: '/admin' });
    const locked = await ask(port, { method: 'POST', path: '/api/admin/overview' });
    if (!existsSync(join(process.cwd(), 'dist'))) {
      assert.equal(root.status, 302);
      assert.equal(root.location, 'https://betspapa.com');
      assert.equal(root.body, '');
      assert.equal(page.status, 302);
      assert.equal(page.location, 'https://betspapa.com');
    }
    assert.equal(asset.status, 200);
    assert.equal(asset.location, undefined);
    assert.equal(missing.status, 404);
    assert.notEqual(missing.location, 'https://betspapa.com');
    assert.equal(health.status, 200);
    assert.equal(JSON.parse(health.body).ok, true);
    assert.notEqual(admin.location, 'https://betspapa.com');
    assert.equal(admin.status, 200);
    assert.match(admin.body, /name="email"/);
    assert.match(admin.body, /name="password"/);
    assert.equal(locked.status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
