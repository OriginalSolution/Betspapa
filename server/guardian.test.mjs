import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createGuardian, inspectEngine, latencySummary, nightlyDue, percentile, selfTestEngine } from './guardian.mjs';

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
        master: { id: 'master', legs: [{ odds: 1.4, kickoff: new Date(Date.now() + 3_600_000).toISOString() }], books: { sportybet: { parts: [{ code: 'KEEP1' }] } } },
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
