import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createGuardian, inspectEngine, latencySummary, nightlyDue, percentile, selfTestEngine } from './guardian.mjs';
import { evaluateChecks, gzippedBytes, noteDeviceCount, partCap } from './guardianChecks.mjs';
import { pruneStaleDevices } from './push.mjs';

test('an empty board is restored and rebooked, a fresh board is left alone', async () => {
  const empty = inspectEngine({ updatedAt: null, feedAt: null, master: null, trends: [], tiers: [], books: {} });
  assert.equal(empty.ok, false);
  assert.ok(empty.actions.includes('restore'));
  assert.ok(empty.actions.includes('rerun'));

  let state = { updatedAt: null, feedAt: null, master: null, trends: [], tiers: [], books: {} };
  const calls = [];
  const guardian = createGuardian({
    dir: mkdtempSync(join(tmpdir(), 'betspapa-health-')),
    getState: () => state,
    restore: async () => {
      calls.push('restore');
      state = {
        updatedAt: new Date().toISOString(),
        feedAt: new Date().toISOString(),
        books: { sportybet: { parts: [{ code: 'KEEP1' }] } },
        master: { id: 'master', legs: [{ market: 'over25', odds: 1.4, kickoff: new Date(Date.now() + 3_600_000).toISOString() }], books: { sportybet: { parts: [{ code: 'KEEP1' }] } } },
        trends: [],
        tiers: [],
      };
      return true;
    },
    runCycle: async () => {
      calls.push('rerun');
      return state;
    },
    fcm: () => true,
    now: () => new Date('2026-11-13T02:00:00.000Z'),
  });
  await guardian.check();
  assert.deepEqual(calls, ['restore', 'rerun']);
  const again = await guardian.check();
  assert.equal(again.ok, true);
  assert.deepEqual(calls, ['restore', 'rerun']);
});

test('a cycle that is still booking is not an empty or stale board', () => {
  const now = Date.now();
  const open = {
    updatedAt: new Date(now - 40 * 60 * 1000).toISOString(),
    feedAt: new Date(now).toISOString(),
    books: {},
    master: { id: 'master', legs: [{ market: 'over15', odds: 1.25, kickoff: new Date(now + 3_600_000).toISOString() }], books: {} },
    trends: [],
    tiers: [],
  };
  const working = inspectEngine(open, now, { booking: true });
  assert.equal(working.ok, true);
  assert.equal(working.issues.some((issue) => issue.code === 'empty-board' || issue.code === 'stale-cycle'), false);
  const idle = inspectEngine(open, now, { booking: false });
  assert.equal(idle.ok, false);
  assert.ok(idle.issues.some((issue) => issue.code === 'empty-board'));
  assert.ok(idle.issues.some((issue) => issue.code === 'stale-cycle'));
});

test('latency percentiles flag a slow endpoint only after enough samples', () => {
  assert.equal(percentile([10, 20, 30, 100], 50), 20);
  const rows = latencySummary([
    ...Array.from({ length: 5 }, () => ({ path: '/api/engine', ms: 40, bytes: 1000 })),
    { path: '/api/live', ms: 800, bytes: 2000 },
  ]);
  assert.equal(rows.find((row) => row.path === '/api/engine').slow, false);
  assert.equal(rows.find((row) => row.path === '/api/live').slow, false);
  const slow = latencySummary(Array.from({ length: 5 }, () => ({ path: '/api/live', ms: 900, bytes: 50 })));
  assert.equal(slow[0].slow, true);
  assert.equal(slow[0].p95, 900);
});

test('nightly maintenance runs after 04:00 Accra and writes a report', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'betspapa-health-'));
  let cycles = 0;
  let devices = 0;
  const guardian = createGuardian({
    dir,
    getState: () => ({
      updatedAt: new Date().toISOString(),
      feedAt: new Date().toISOString(),
      books: { sportybet: { parts: [{ code: 'KEEP1' }] } },
      master: { id: 'master', legs: [], books: { sportybet: { parts: [{ code: 'KEEP1' }] } } },
      trends: [],
      tiers: [],
    }),
    runCycle: async () => {
      cycles += 1;
    },
    pruneDevices: async () => {
      devices += 2;
      return 2;
    },
    prunePromos: async () => 1,
    probe: async () => [{ path: '/api/engine', ms: 12, ok: true }],
    fcm: () => false,
  });
  const morning = new Date('2026-11-13T04:05:00.000Z');
  assert.equal(nightlyDue(null, morning), true);
  assert.equal(nightlyDue('2026-11-13', morning), false);
  const report = await guardian.nightly();
  assert.equal(cycles, 1);
  assert.equal(devices, 2);
  assert.equal(report.tests.ok, true);
  assert.equal(report.endpoints[0].ok, true);
  assert.equal(selfTestEngine().ok, true);
});

const DESK_IDS = ['sportybet', 'footballcom', 'msport', 'betika', 'betpawa'];

function codedBooks(legs = 1) {
  return Object.fromEntries(DESK_IDS.map((desk) => [desk, { parts: [{ code: `CODE${desk.slice(0, 2).toUpperCase()}`, legs, matches: ['sr:match:1'] }] }]));
}

function healthyInput(now = Date.now()) {
  const leg = { eventId: 'sr:match:1', market: 'over15', odds: 1.25, kickoff: new Date(now + 3_600_000).toISOString(), sample: '8/10', opponentSample: '7/10' };
  const books = codedBooks(1);
  const slip = (id, extra = {}) => ({ id, label: extra.label || id, legs: [leg], books, ...extra });
  return {
    mode: 'live',
    now,
    booking: false,
    persistent: true,
    devices: 4,
    previousDevices: 4,
    restarted: false,
    feedOk: true,
    feedError: null,
    sentOk: 3,
    sentError: 1,
    pruned: 0,
    payloadBytes: 2048,
    state: {
      books,
      master: slip('master', { label: 'Master' }),
      trends: [slip('80:over15', { market: 'over15', label: '80%+ Over 1.5' })],
      tiers: [
        slip('tier:100', { tier: '100', label: '100% all picks' }),
        slip('tier:90', { tier: '90', label: '90%+ all picks' }),
        slip('tier:80', { tier: '80', label: '80%+ all picks' }),
        slip('tier:100:over15', { tier: '100', market: 'over15', label: '100% Over 1.5' }),
      ],
    },
  };
}

test('mode must be live and a demo or simulated mode asks to switch', () => {
  const live = evaluateChecks(healthyInput());
  assert.equal(live.ok, true);
  assert.equal(live.checks.find((row) => row.id === 'mode').message, 'Mode is live.');
  for (const mode of ['demo', 'simulated', 'simulation']) {
    const verdict = evaluateChecks({ ...healthyInput(), mode });
    const row = verdict.checks.find((item) => item.id === 'mode');
    assert.equal(row.ok, false);
    assert.equal(row.level, 'attention');
    assert.match(row.message, /Switching to live/);
    assert.ok(verdict.actions.includes('switch-live'));
  }
});

test('coverage waits until the booking cycle finishes', () => {
  const now = Date.now();
  const input = healthyInput(now);
  delete input.state.tiers[0].books.sportybet;
  const idle = evaluateChecks(input);
  assert.equal(idle.checks.find((row) => row.id === 'coverage').ok, false);
  assert.ok(idle.actions.includes('rebook'));
  const booking = evaluateChecks({ ...input, booking: true });
  const coverage = booking.checks.find((row) => row.id === 'coverage');
  assert.equal(coverage.ok, true);
  assert.match(coverage.message, /still running/);
  assert.equal(booking.actions.includes('rebook'), false);
});

test('a missing snapshot token is healthy when the booked board is on disk', () => {
  const onDisk = evaluateChecks({ ...healthyInput(), snapshot: 'no-token', boardStored: true, persistent: true });
  const persist = onDisk.checks.find((row) => row.id === 'persist');
  assert.equal(persist.ok, true);
  assert.match(persist.message, /booked board is on disk/);
  const lost = evaluateChecks({ ...healthyInput(), snapshot: 'no-token', persistent: false });
  assert.equal(lost.checks.find((row) => row.id === 'persist').ok, false);
  assert.match(lost.checks.find((row) => row.id === 'persist').message, /No snapshot token/);
  const failed = evaluateChecks({ ...healthyInput(), boardStored: false, diskError: 'disk full' });
  assert.match(failed.checks.find((row) => row.id === 'persist').message, /data disk/);
  assert.match(failed.checks.find((row) => row.id === 'persist').message, /disk full/);
});

test('an empty board is attention unless a cycle is still booking', () => {
  const empty = evaluateChecks({ ...healthyInput(), state: { master: null, trends: [], tiers: [], books: {} } });
  assert.equal(empty.checks.find((row) => row.id === 'board').ok, false);
  assert.ok(empty.actions.includes('restore'));
  assert.ok(empty.actions.includes('rebook'));
  const booking = evaluateChecks({ ...healthyInput(), booking: true, state: { master: null, trends: [], tiers: [], books: {} } });
  assert.equal(booking.checks.find((row) => row.id === 'board').ok, true);
});

test('odds violators are dropped and a 1.60 exception needs 10/10 on both sides', () => {
  const now = Date.now();
  const future = new Date(now + 3_600_000).toISOString();
  const base = healthyInput(now);
  const violation = evaluateChecks({
    ...base,
    raw: {
      tiers: [{ id: 'tier:100', label: '100% all picks', legs: [{ eventId: 'sr:match:9', market: 'over15', odds: 1.55, kickoff: future, sample: '10/10', opponentSample: '8/10' }] }],
    },
  });
  const odds = violation.checks.find((row) => row.id === 'odds');
  assert.equal(odds.ok, false);
  assert.match(odds.message, /1\.55/);
  assert.ok(violation.actions.includes('rebook'));
  const allowed = evaluateChecks({
    ...base,
    raw: {
      tiers: [{ id: 'tier:100', label: '100% all picks', legs: [{ eventId: 'sr:match:9', market: 'over15', odds: 1.6, kickoff: future, sample: '10/10', opponentSample: '10/10' }] }],
    },
  });
  assert.equal(allowed.checks.find((row) => row.id === 'odds').ok, true);
  const followed = evaluateChecks({
    ...base,
    raw: { extraLegs: [{ surface: 'follow', market: 'dc-12', odds: 1.4, kickoff: future, sample: '10/10', opponentSample: '8/10' }] },
  });
  assert.equal(followed.checks.find((row) => row.id === 'odds').ok, false);
  assert.match(followed.checks.find((row) => row.id === 'odds').message, /follow/);
});

test('kicked-off legs ask for a rebook', () => {
  const now = Date.now();
  const verdict = evaluateChecks({
    ...healthyInput(now),
    raw: {
      trends: [{ id: '80:over15', label: '80%+ Over 1.5', legs: [{ eventId: 'sr:match:3', market: 'over15', odds: 1.25, kickoff: new Date(now - 60_000).toISOString() }] }],
    },
  });
  const row = verdict.checks.find((item) => item.id === 'kickoff');
  assert.equal(row.ok, false);
  assert.match(row.message, /kicked-off/);
  assert.ok(verdict.actions.includes('rebook'));
});

test('tiers and markets need a code on every desk, in parts the desk can hold', () => {
  assert.equal(partCap('sportybet'), 50);
  assert.equal(partCap('betika'), 20);
  const now = Date.now();
  const input = healthyInput(now);
  const missing = structuredClone(input);
  delete missing.state.tiers[0].books.betpawa;
  const gap = evaluateChecks(missing);
  const coverage = gap.checks.find((row) => row.id === 'coverage');
  assert.equal(coverage.ok, false);
  assert.match(coverage.message, /betPawa/);
  assert.ok(gap.actions.includes('rebook'));
  const bulky = structuredClone(input);
  bulky.state.tiers[1].books.sportybet.parts[0].legs = 51;
  bulky.state.tiers[1].books.sportybet.parts[0].matches = [];
  const over = evaluateChecks(bulky);
  assert.equal(over.checks.find((row) => row.id === 'coverage').ok, false);
  assert.match(over.checks.find((row) => row.id === 'coverage').message, /51/);
  const quiet = evaluateChecks({ ...input, state: { ...input.state, tiers: [], trends: [] } });
  assert.equal(quiet.checks.find((row) => row.id === 'coverage').ok, true);
  assert.match(quiet.checks.find((row) => row.id === 'coverage').message, /no open legs/);
});

test('a desk that does not sell the market is not a missing code', () => {
  const now = Date.now();
  const future = new Date(now + 3_600_000).toISOString();
  const leg = { eventId: 'sr:match:90', market: 'sh-over05', odds: 1.2, kickoff: future };
  const books = codedBooks(1);
  books.betika = {
    parts: [],
    error: 'No open selections on this bookmaker.',
    dropped: [{ eventId: 'sr:match:90', market: 'sh-over05', reason: 'Betika does not list second-half over 0.5.' }],
  };
  const input = healthyInput(now);
  input.state.trends = [{ id: '80:sh-over05', label: '80%+ Second-half over 0.5', market: 'sh-over05', legs: [leg], books }];
  const ok = evaluateChecks(input);
  assert.equal(ok.checks.find((row) => row.id === 'coverage').ok, true);
  books.betika.dropped = [{ eventId: 'sr:match:90', market: 'sh-over05', reason: 'Not open on Betika (closed, started or unlisted).' }];
  const closed = evaluateChecks(input);
  assert.equal(closed.checks.find((row) => row.id === 'coverage').ok, false);
  assert.match(closed.checks.find((row) => row.id === 'coverage').message, /Betika/);
});

test('a lost device list or a directory that is not persistent needs attention', () => {
  const kept = evaluateChecks({ ...healthyInput(), persistent: true, devices: 4, previousDevices: 4, restarted: true });
  assert.equal(kept.checks.find((row) => row.id === 'persist').ok, true);
  assert.match(kept.checks.find((row) => row.id === 'persist').message, /4 devices/);
  const lost = evaluateChecks({ ...healthyInput(), devices: 0, previousDevices: 6, restarted: true });
  assert.equal(lost.checks.find((row) => row.id === 'persist').ok, false);
  assert.match(lost.checks.find((row) => row.id === 'persist').message, /lost after a restart/);
  const disk = evaluateChecks({ ...healthyInput(), persistent: false });
  assert.match(disk.checks.find((row) => row.id === 'persist').message, /not a persistent disk/);
  const dir = mkdtempSync(join(tmpdir(), 'betspapa-census-'));
  assert.deepEqual(noteDeviceCount(dir, 0, { boot: true }), { lost: false, previous: 0, count: 0 });
  noteDeviceCount(dir, 5, { boot: false });
  const wiped = noteDeviceCount(dir, 0, { boot: true });
  assert.equal(wiped.lost, true);
  assert.equal(wiped.previous, 5);
  const saved = JSON.parse(readFileSync(join(dir, 'device-census.json'), 'utf8'));
  assert.equal(saved.count, 5);
});

test('push reports the live feed and FCM send counts, and the app payload warns over 400KB', () => {
  const healthy = evaluateChecks(healthyInput());
  const push = healthy.checks.find((row) => row.id === 'push');
  assert.equal(push.ok, true);
  assert.match(push.message, /success 3/);
  assert.match(push.message, /error 1/);
  const down = evaluateChecks({ ...healthyInput(), feedOk: false, feedError: 'In-play scores returned 503' });
  assert.equal(down.checks.find((row) => row.id === 'push').ok, false);
  assert.match(down.checks.find((row) => row.id === 'push').message, /503/);
  const waiting = evaluateChecks({ ...healthyInput(), feedOk: null });
  assert.equal(waiting.checks.find((row) => row.id === 'push').ok, true);
  const heavy = evaluateChecks({ ...healthyInput(), payloadBytes: 401 * 1024 });
  const payload = heavy.checks.find((row) => row.id === 'payload');
  assert.equal(payload.ok, false);
  assert.equal(payload.level, 'warn');
  assert.equal(heavy.ok, true);
  assert.equal(heavy.reason, null);
  assert.ok(gzippedBytes({ ok: true }) < 400 * 1024);
});

test('stale tokens are pruned and a demo mode is switched before another cycle', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'betspapa-devices-'));
  const devices = [
    { token: 'short', lastSeenAt: new Date().toISOString() },
    { token: 'fcm-token-value-that-is-long-enough', lastSeenAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString() },
    { token: 'fcm-token-value-that-is-still-fresh', lastSeenAt: new Date().toISOString() },
  ];
  const book = {
    list: () => devices,
    drop(token) {
      const index = devices.findIndex((item) => item.token === token);
      if (index >= 0) devices.splice(index, 1);
    },
  };
  assert.equal(pruneStaleDevices(book), 2);
  assert.deepEqual(devices.map((item) => item.token), ['fcm-token-value-that-is-still-fresh']);

  let mode = 'demo';
  let cycles = 0;
  const guardian = createGuardian({
    dir: mkdtempSync(join(tmpdir(), 'betspapa-health-')),
    backoffMs: [0, 0],
    mode: () => mode,
    forceLive: () => {
      mode = 'live';
      return true;
    },
    getState: () => ({
      updatedAt: new Date().toISOString(),
      books: codedBooks(),
      master: { id: 'master', label: 'Master', legs: [{ market: 'over25', odds: 1.4, kickoff: new Date(Date.now() + 3_600_000).toISOString() }], books: codedBooks() },
      trends: [],
      tiers: [],
    }),
    runCycle: async () => {
      cycles += 1;
    },
    push: () => ({ feedOk: true, sentOk: 1, sentError: 0 }),
    persistent: () => true,
    deviceCount: () => 2,
    now: () => new Date('2026-11-13T02:00:00.000Z'),
  });
  const status = await guardian.check();
  assert.equal(mode, 'live');
  assert.equal(status.ok, true);
  assert.equal(status.checks.length, 8);
  assert.equal(cycles, 0);
});

test('a running booking cycle does not recompute health or start another cycle', async () => {
  let booking = false;
  let cycles = 0;
  let reads = 0;
  const leg = { eventId: 'sr:match:1', market: 'over15', odds: 1.25, kickoff: new Date(Date.now() + 3_600_000).toISOString() };
  const books = codedBooks();
  delete books.msport;
  const guardian = createGuardian({
    dir: mkdtempSync(join(tmpdir(), 'betspapa-health-')),
    backoffMs: [0, 0],
    booking: () => booking,
    healthCacheMs: 60_000,
    getState: () => {
      reads += 1;
      return {
        books,
        master: { id: 'master', legs: [leg], books },
        trends: [],
        tiers: [
          { id: 'tier:100', tier: '100', label: '100% all picks', legs: [leg], books },
          { id: 'tier:90', tier: '90', label: '90%+ all picks', legs: [leg], books },
          { id: 'tier:80', tier: '80', label: '80%+ all picks', legs: [leg], books },
        ],
      };
    },
    runCycle: async () => {
      cycles += 1;
    },
    push: () => ({ feedOk: true, sentOk: 0, sentError: 0 }),
    persistent: () => true,
    now: () => new Date('2026-11-13T02:00:00.000Z'),
  });
  await guardian.check();
  const afterIdle = { cycles, reads };
  assert.ok(afterIdle.cycles >= 1);
  booking = true;
  const during = await guardian.check();
  assert.equal(cycles, afterIdle.cycles);
  assert.equal(reads, afterIdle.reads);
  assert.equal(during.checks.find((row) => row.id === 'coverage').ok, false);
  const again = await guardian.status();
  assert.equal(reads, afterIdle.reads);
  assert.equal(again.ok, during.ok);
});

test('missing desk codes are rebooked with backoff and then left alone', async () => {
  let fixed = false;
  const calls = [];
  const leg = { eventId: 'sr:match:1', market: 'over15', odds: 1.25, kickoff: new Date(Date.now() + 3_600_000).toISOString() };
  const guardian = createGuardian({
    dir: mkdtempSync(join(tmpdir(), 'betspapa-health-')),
    backoffMs: [0, 0],
    getState: () => {
      const books = codedBooks();
      if (!fixed) delete books.msport;
      return {
        books,
        master: { id: 'master', legs: [leg], books },
        trends: [],
        tiers: [
          { id: 'tier:100', tier: '100', label: '100% all picks', legs: [leg], books },
          { id: 'tier:90', tier: '90', label: '90%+ all picks', legs: [leg], books },
          { id: 'tier:80', tier: '80', label: '80%+ all picks', legs: [leg], books },
        ],
      };
    },
    runCycle: async () => {
      calls.push('rebook');
      fixed = true;
    },
    push: () => ({ feedOk: true, sentOk: 0, sentError: 0 }),
    persistent: () => true,
    now: () => new Date('2026-11-13T02:00:00.000Z'),
  });
  const status = await guardian.check();
  assert.deepEqual(calls, ['rebook']);
  assert.equal(status.checks.find((row) => row.id === 'coverage').ok, true);
  await guardian.check();
  assert.deepEqual(calls, ['rebook']);
});
