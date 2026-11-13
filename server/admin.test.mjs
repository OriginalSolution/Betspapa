import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  adminPassword,
  clearFailures,
  cookieHeader,
  noteFailure,
  passwordsMatch,
  requestIsSecure,
  SESSION_SECONDS,
  signSession,
  tooManyFailures,
  verifySession,
} from './adminAuth.mjs';
import { buildOverview, deskRows, deviceSnapshot, summarizeReleases } from './adminData.mjs';
import { consoleHtml, loginHtml } from './adminPage.mjs';
import { createEngine, INTERVAL_MS } from './engine.mjs';
import { countryForRequest, forgetCountry, isPublicIp, lookupCountry } from './geo.mjs';
import { createAlertLog, createDeviceBook } from './push.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN = 'device-token-for-admin-test-0001';
const PASSWORD = 'correct-horse';

test('password compare is exact and the session cookie expires', () => {
  assert.equal(passwordsMatch(PASSWORD, PASSWORD), true);
  assert.equal(passwordsMatch('correct-hors', PASSWORD), false);
  assert.equal(passwordsMatch(`${PASSWORD} `, PASSWORD), false);
  assert.equal(adminPassword({ ADMIN_PASSWORD: '  secret  ' }), 'secret');
  assert.equal(adminPassword({}), '');
  const now = Date.now();
  const token = signSession(PASSWORD, now);
  assert.equal(verifySession(token, PASSWORD, now + 1000), true);
  assert.equal(verifySession(token, 'other-password', now + 1000), false);
  assert.equal(verifySession(`${token.slice(0, -1)}x`, PASSWORD, now + 1000), false);
  assert.equal(verifySession(signSession(PASSWORD, now - 13 * 60 * 60 * 1000), PASSWORD, now), false);
  const secure = cookieHeader(token, { secure: true });
  assert.match(secure, /HttpOnly/);
  assert.match(secure, /SameSite=Strict/);
  assert.match(secure, new RegExp(`Max-Age=${SESSION_SECONDS}`));
  assert.match(secure, /Secure/);
  assert.equal(requestIsSecure({ headers: {} }, {}), false);
  assert.equal(requestIsSecure({ headers: { 'x-forwarded-proto': 'https' } }, {}), true);
  assert.equal(requestIsSecure({ headers: {} }, { NODE_ENV: 'production' }), true);
});

test('five failures in ten minutes block the next attempt for that address only', () => {
  const ip = '198.51.100.77';
  clearFailures(ip);
  for (let i = 0; i < 5; i += 1) {
    assert.equal(tooManyFailures(ip), false);
    noteFailure(ip);
  }
  assert.equal(tooManyFailures(ip), true);
  assert.equal(tooManyFailures('198.51.100.78'), false);
  clearFailures(ip);
  assert.equal(tooManyFailures(ip), false);
});

test('country comes from the edge header or a country-only lookup, and a private address is not looked up', async () => {
  let calls = 0;
  const header = await countryForRequest(
    { headers: { 'cf-ipcountry': 'gh' }, socket: { remoteAddress: '203.0.113.9' } },
    { fetchImpl: () => { calls += 1; throw new Error('lookup'); } },
  );
  assert.equal(header, 'GH');
  assert.equal(calls, 0);
  const local = await countryForRequest(
    { headers: {}, socket: { remoteAddress: '127.0.0.1' } },
    { fetchImpl: () => { throw new Error('lookup'); } },
  );
  assert.equal(local, '');
  assert.equal(isPublicIp('10.1.1.1'), false);
  assert.equal(isPublicIp('203.0.113.8'), true);

  forgetCountry('203.0.113.8');
  const fetchImpl = async (url) => {
    calls += 1;
    if (String(url).includes('ipapi.co')) {
      return { ok: false, headers: { get: () => 'text/plain' }, text: async () => 'rate limit 203.0.113.8', json: async () => ({}) };
    }
    return {
      ok: true,
      headers: { get: () => 'application/json' },
      text: async () => '',
      json: async () => ({ countryCode: 'gh', query: '203.0.113.8' }),
    };
  };
  assert.equal(await lookupCountry('203.0.113.8', fetchImpl), 'GH');
  const after = calls;
  assert.equal(await lookupCountry('203.0.113.8', fetchImpl), 'GH');
  assert.equal(calls, after);
});

test('a device stores country, version, and seen times, and never the address', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'betspapa-devices-'));
  const book = createDeviceBook(dir);
  const token = 'fcm-token-SECRET-VALUE-123456';
  const first = book.register(
    { token, appVersion: '0.4.3', ip: '203.0.113.8', address: '203.0.113.8', follows: { matches: [], teams: [] } },
    { country: 'gh', ip: '203.0.113.8' },
  );
  assert.equal(first.ok, true);
  assert.equal(first.token, undefined);
  await new Promise((resolve) => setTimeout(resolve, 20));
  book.register({ token, appVersion: '0.4.3', follows: {} }, { country: '' });
  const saved = JSON.parse(readFileSync(join(dir, 'devices.json'), 'utf8'));
  assert.equal(saved.length, 1);
  assert.equal(saved[0].country, 'GH');
  assert.equal(saved[0].appVersion, '0.4.3');
  assert.equal(saved[0].firstSeenAt < saved[0].lastSeenAt, true);
  assert.equal(Object.hasOwn(saved[0], 'ip'), false);
  assert.equal(Object.hasOwn(saved[0], 'address'), false);
  assert.equal(JSON.stringify(saved).includes('203.0.113.8'), false);
  const snapshot = deviceSnapshot(saved, Date.now());
  assert.equal(snapshot.ghana, 1);
  assert.equal(snapshot.activeNow, 1);
  assert.equal(snapshot.latestTail, '123456');
  assert.equal(JSON.stringify(snapshot).includes('SECRET'), false);

  const unknown = deviceSnapshot([{ token: 'fcm-token-without-country-0001', updatedAt: '2020-01-01T00:00:00.000Z' }], Date.now());
  assert.equal(unknown.countries[0].code, 'Unknown');
  assert.equal(unknown.activeNow, 0);
});

test('release downloads are summed from APK assets, oldest to newest', () => {
  const summary = summarizeReleases([
    { tag_name: 'v0.4.3', published_at: '2026-11-10T00:00:00.000Z', assets: [{ name: 'Betspapa.apk', download_count: 6 }, { name: 'notes.zip', download_count: 99 }] },
    { tag_name: 'v0.4.2', published_at: '2026-11-01T00:00:00.000Z', assets: [{ name: 'app.APK', download_count: 4 }] },
    { tag_name: 'source', assets: [{ name: 'src.zip', download_count: 50 }] },
  ]);
  assert.equal(summary.total, 10);
  assert.deepEqual(summary.releases.map((row) => row.version), ['v0.4.2', 'v0.4.3']);
  assert.equal(summary.releases[0].downloads, 4);
});

test('master codes are real desk codes, with partial and missing desks left blank', () => {
  const rows = deskRows({
    sportybet: { parts: [{ code: 'AB12CD', link: 'https://www.sportybet.com/gh/?shareCode=AB12CD', legs: 2 }], dropped: [] },
    footballcom: { parts: [{ code: 'not a code', link: 'https://www.football.com/gh/?shareCode=bad', legs: 1 }], dropped: [] },
    msport: { parts: [{ code: 'MS1234', link: 'https://www.msport.com/gh/?shareCode=MS1234', legs: 1 }], dropped: [{ reason: 'short' }] },
  }, 2);
  assert.equal(rows.find((row) => row.id === 'sportybet').status, 'Ready');
  assert.equal(rows.find((row) => row.id === 'sportybet').code, 'AB12CD');
  assert.equal(rows.find((row) => row.id === 'footballcom').status, 'Missing');
  assert.equal(rows.find((row) => row.id === 'footballcom').code, null);
  assert.equal(rows.find((row) => row.id === 'msport').status, 'Partial');
  assert.equal(rows.find((row) => row.id === 'betika').code, null);
  assert.equal(JSON.stringify(rows).includes('not a code'), false);
});

test('the operator snapshot counts devices and does not reveal a token', () => {
  const now = Date.parse('2026-11-13T15:00:00.000Z');
  const overview = buildOverview({
    state: {
      updatedAt: '2026-11-13T14:00:00.000Z',
      feedError: null,
      eventCount: 12,
      legCount: 2,
      master: { legCount: 2 },
      trends: [{ id: '80:home', label: '80%+ Home', legCount: 2 }],
      cycleNotes: ['3 lines were at 80%+ but had no price at or above 1.20 (Home 3).'],
      books: { sportybet: { parts: [{ code: 'AB12CD', link: 'https://www.sportybet.com/gh/?shareCode=AB12CD', legs: 2 }], dropped: [] } },
      fcm: true,
    },
    schedule: { intervalMs: INTERVAL_MS, nextRunAt: now + 11 * 60 * 1000, running: false },
    devices: [{ token: 'fcm-token-SECRET-VALUE-123456', country: 'GH', appVersion: '0.4.3', lastSeenAt: '2026-11-13T14:55:00.000Z', firstSeenAt: '2026-11-01T00:00:00.000Z' }],
    alerts: [{ type: 'goal', match: 'Hearts vs Kotoko', time: '2026-11-13T14:40:00.000Z' }],
    releases: { total: 10, releases: [{ version: 'v0.4.2', downloads: 4, publishedAt: '2026-11-01T00:00:00.000Z' }], error: null },
    crests: { cataloguePercent: 86.5, upcomingBothPercent: null, missingClubs: 98, live: false },
    now,
  });
  const printed = JSON.stringify(overview);
  assert.equal(printed.includes('SECRET'), false);
  assert.equal(printed.includes('fcm-token'), false);
  assert.equal(overview.installs.downloads, 10);
  assert.equal(overview.installs.ghana, 1);
  assert.equal(overview.installs.activeNow, 1);
  assert.equal(overview.push.latestTail, '123456');
  assert.equal(overview.status.engine, 'OPEN');
  assert.equal(overview.status.fcm, true);
  assert.equal(overview.status.feed, 12);
  assert.equal(overview.status.oddsFloor, 1.2);
  assert.equal(overview.status.cycleMinutes, 15);
  assert.equal(overview.trends.markets, 1);
  assert.equal(overview.trends.droppedUnderFloor, 3);
  assert.equal(overview.codes.find((row) => row.id === 'sportybet').code, 'AB12CD');
  assert.equal(overview.alerts[0].match, 'Hearts vs Kotoko');
});

test('push log keeps the match and drops anything that is not type, match, and time', () => {
  const dir = mkdtempSync(join(tmpdir(), 'betspapa-alerts-'));
  const log = createAlertLog(dir);
  log.record({ kind: 'goal', token: 'fcm-token-SECRET-VALUE-123456', match: { home: 'Hearts', away: 'Kotoko' } }, '2026-11-13T14:40:00.000Z');
  const saved = readFileSync(join(dir, 'push-log.json'), 'utf8');
  assert.equal(saved.includes('SECRET'), false);
  assert.deepEqual(log.list(), [{ type: 'goal', match: 'Hearts vs Kotoko', time: '2026-11-13T14:40:00.000Z' }]);
});

test('the next automatic cycle is armed for 20 seconds, then every 15 minutes', () => {
  const engine = createEngine({ dir: mkdtempSync(join(tmpdir(), 'betspapa-sched-')), log: () => {} });
  try {
    engine.start();
    const schedule = engine.getSchedule();
    assert.equal(schedule.intervalMs, 15 * 60 * 1000);
    assert.ok(schedule.nextRunAt > Date.now());
    assert.ok(schedule.nextRunAt < Date.now() + 25_000);
  } finally {
    engine.stop();
  }
});

test('the operator page is local and the installed app does not call the test push', () => {
  const page = consoleHtml();
  const login = loginHtml('Wrong password.');
  assert.match(page, /noindex/);
  assert.match(page, /Command centre/);
  assert.match(page, /Betspapa operations - Africa\/Accra/);
  assert.equal(/cdn\.|googleapis|jsdelivr|unpkg|chart\.js/i.test(page), false);
  assert.match(login, /Wrong password\./);
  assert.match(login, /name="password"/);
  const hits = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === 'build' || name === 'dist') continue;
      const file = join(dir, name);
      if (statSync(file).isDirectory()) {
        walk(file);
        continue;
      }
      if (!/\.(ts|tsx|kt|java)$/.test(name)) continue;
      const text = readFileSync(file, 'utf8');
      if (text.includes('/api/devices/test')) hits.push(file);
    }
  };
  walk(join(root, 'src'));
  walk(join(root, 'android', 'app', 'src'));
  assert.deepEqual(hits, []);
});

function ask(port, { method = 'GET', path = '/', headers = {}, body = '' } = {}) {
  return new Promise((resolve, reject) => {
    const client = httpRequest({ hostname: '127.0.0.1', port, method, path, headers }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    client.on('error', reject);
    client.end(body);
  });
}

test('admin routes require the session, throttle failures, and store a device without its address', { timeout: 60_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'betspapa-admin-'));
  const previous = {
    data: process.env.ENGINE_DATA_DIR,
    password: process.env.ADMIN_PASSWORD,
    token: process.env.ENGINE_RUN_TOKEN,
    nodeEnv: process.env.NODE_ENV,
    render: process.env.RENDER,
  };
  process.env.ENGINE_DATA_DIR = dir;
  process.env.ENGINE_RUN_TOKEN = 'engine-token-test';
  delete process.env.ADMIN_PASSWORD;
  delete process.env.NODE_ENV;
  delete process.env.RENDER;
  const { createBetspapaServer } = await import('./index.mjs');
  const server = createBetspapaServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const httpAsk = (options) => ask(port, options);
  try {
    const closed = await httpAsk({ path: '/admin' });
    assert.equal(closed.status, 503);
    assert.match(String(closed.headers['x-robots-tag']), /noindex/);
    process.env.ADMIN_PASSWORD = PASSWORD;

    const loginPage = await httpAsk({ path: '/admin' });
    assert.equal(loginPage.status, 200);
    assert.match(loginPage.body, /<meta name="robots" content="noindex">/);
    assert.match(loginPage.body, /Command centre/);
    assert.equal(loginPage.body.includes('Run cycle now'), false);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const wrong = await httpAsk({
        method: 'POST',
        path: '/admin/login',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'password=nope',
      });
      assert.equal(wrong.status, 401);
      assert.match(wrong.body, /Wrong password/);
      assert.equal(wrong.headers['set-cookie'], undefined);
    }
    const blocked = await httpAsk({
      method: 'POST',
      path: '/admin/login',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `password=${encodeURIComponent(PASSWORD)}`,
    });
    assert.equal(blocked.status, 429);
    const other = await httpAsk({
      method: 'POST',
      path: '/admin/login',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': '203.0.113.40' },
      body: 'password=nope',
    });
    assert.equal(other.status, 401);

    clearFailures('127.0.0.1');
    clearFailures('::1');
    clearFailures('::ffff:127.0.0.1');
    const signed = await httpAsk({
      method: 'POST',
      path: '/admin/login',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `password=${encodeURIComponent(PASSWORD)}`,
    });
    assert.equal(signed.status, 303);
    const cookieLine = String(signed.headers['set-cookie']);
    assert.match(cookieLine, /HttpOnly/);
    assert.match(cookieLine, /SameSite=Strict/);
    assert.match(cookieLine, /Max-Age=43200/);
    assert.equal(cookieLine.includes('Secure'), false);
    const cookie = cookieLine.split(';')[0];

    const locked = await httpAsk({ path: '/api/admin/overview' });
    assert.equal(locked.status, 401);
    assert.match(locked.body, /Admin session required/);
    const cycleLocked = await httpAsk({ method: 'POST', path: '/api/admin/cycle' });
    assert.equal(cycleLocked.status, 401);
    const pushLocked = await httpAsk({ method: 'POST', path: '/api/devices/test', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(pushLocked.status, 401);

    const home = await httpAsk({ path: '/admin', headers: { cookie } });
    assert.equal(home.status, 200);
    assert.match(home.body, /Run cycle now/);
    assert.match(home.body, /Send test goal/);
    const overview = await httpAsk({ path: '/api/admin/overview', headers: { cookie } });
    assert.equal(overview.status, 200);
    const enginePush = await httpAsk({
      method: 'POST',
      path: '/api/devices/test',
      headers: { 'content-type': 'application/json', authorization: 'Bearer engine-token-test' },
      body: JSON.stringify({ kind: 'goal', latest: true }),
    });
    assert.equal(enginePush.status, 503);

    const registered = await httpAsk({
      method: 'POST',
      path: '/api/devices',
      headers: { 'content-type': 'application/json', 'cf-ipcountry': 'gh' },
      body: JSON.stringify({ token: TOKEN, appVersion: '0.4.3', ip: '203.0.113.50', address: '203.0.113.50', follows: { matches: [], teams: [] } }),
    });
    assert.equal(registered.status, 200);
    assert.equal(registered.body.includes(TOKEN), false);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await httpAsk({
      method: 'POST',
      path: '/api/devices',
      headers: { 'content-type': 'application/json', 'cf-ipcountry': 'gh' },
      body: JSON.stringify({ token: TOKEN, appVersion: '0.4.3', follows: {} }),
    });
    const saved = JSON.parse(readFileSync(join(dir, 'devices.json'), 'utf8'));
    assert.equal(saved[0].country, 'GH');
    assert.equal(saved[0].appVersion, '0.4.3');
    assert.equal(saved[0].firstSeenAt < saved[0].lastSeenAt, true);
    assert.equal(JSON.stringify(saved).includes('203.0.113.50'), false);
    assert.equal(JSON.stringify(saved).includes('127.0.0.1'), false);

    const open = JSON.parse((await httpAsk({ path: '/api/admin/overview', headers: { cookie } })).body);
    const printed = JSON.stringify(open);
    assert.equal(printed.includes(TOKEN), false);
    assert.equal(printed.includes('203.0.113.50'), false);
    assert.equal(open.installs.ghana, 1);
    assert.equal(open.installs.devices, 1);
    assert.equal(open.push.latestTail, TOKEN.slice(-6));
    assert.equal(open.status.oddsFloor, 1.2);

    const tested = await httpAsk({
      method: 'POST',
      path: '/api/admin/push-test',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'goal' }),
    });
    assert.notEqual(tested.status, 401);
    assert.equal(tested.body.includes(TOKEN), false);

    const secure = await httpAsk({
      method: 'POST',
      path: '/admin/login',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-proto': 'https' },
      body: `password=${encodeURIComponent(PASSWORD)}`,
    });
    assert.match(String(secure.headers['set-cookie']), /Secure/);

    const left = await httpAsk({ method: 'POST', path: '/admin/logout', headers: { cookie } });
    assert.equal(left.status, 303);
    assert.match(String(left.headers['set-cookie']), /Max-Age=0/);
    const after = await httpAsk({ path: '/api/admin/overview' });
    assert.equal(after.status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (previous.data == null) delete process.env.ENGINE_DATA_DIR;
    else process.env.ENGINE_DATA_DIR = previous.data;
    if (previous.password == null) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = previous.password;
    if (previous.token == null) delete process.env.ENGINE_RUN_TOKEN;
    else process.env.ENGINE_RUN_TOKEN = previous.token;
    if (previous.nodeEnv == null) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous.nodeEnv;
    if (previous.render == null) delete process.env.RENDER;
    else process.env.RENDER = previous.render;
  }
});
