import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createGuardian } from './guardian.mjs';
import {
  attentionStreak,
  catalogueShape,
  collapsedLegs,
  compactDataDir,
  cycleHung,
  diskPressure,
  dispatchAttention,
  invalidDeskReports,
  memoryHot,
  readIncidents,
  responseShape,
  selfTestDue,
  shapeSample,
} from './guardianOps.mjs';
import { appendIncident } from './guardianOps.mjs';
import {
  instructions,
  limitMonitorProposal,
  monitorPatchAllowed,
  nextSpend,
  overCap,
  pathAllowed,
  main,
  parseProposal,
  spendCost,
  writeIncident,
} from '../scripts/ai-fixer.mjs';

test('a cycle is hung only after twice its interval', () => {
  const start = 1_000;
  assert.equal(cycleHung(start, start + 10_000, 15 * 60 * 1000), false);
  assert.equal(cycleHung(start, start + 30 * 60 * 1000, 15 * 60 * 1000), false);
  assert.equal(cycleHung(start, start + 30 * 60 * 1000 + 1, 15 * 60 * 1000), true);
  assert.equal(cycleHung(null, start, 1000), false);
});

test('a board that shrinks below 30% of its open legs is kept', () => {
  const now = Date.parse('2026-11-15T12:00:00.000Z');
  const kick = '2026-11-15T18:00:00.000Z';
  const previous = { legs: Array.from({ length: 10 }, (_, index) => ({ eventId: String(index), kickoff: kick })) };
  const thin = { legs: [{ eventId: '1', kickoff: kick }, { eventId: '2', kickoff: kick }] };
  assert.equal(collapsedLegs(previous, thin, now), true);
  assert.equal(collapsedLegs(previous, { legs: previous.legs.slice(0, 4) }, now), false);
  assert.equal(collapsedLegs(previous, { legs: [] }, now), false);
});

test('disk and memory pressure use the stated thresholds', () => {
  assert.equal(diskPressure({ total: 100, free: 30 }).full, false);
  assert.equal(diskPressure({ total: 100, free: 10 }).full, true);
  assert.equal(memoryHot(80, 100), false);
  assert.equal(memoryHot(90, 100), true);
  assert.equal(memoryHot(90, 0), false);
});

test('schema changes are detected and the sample is short', () => {
  assert.equal(catalogueShape({ data: { tournaments: [] } }), true);
  assert.equal(catalogueShape({ data: { events: [] } }), false);
  assert.equal(responseShape({ bizCode: 10000 }).ok, true);
  assert.equal(responseShape('<html>').ok, false);
  assert.ok(shapeSample('<html>moved').includes('html'));
  assert.ok(shapeSample('x'.repeat(500)).length < 420);
});

test('attention fires on the third cycle and a missing token does not dispatch', async () => {
  let streaks = {};
  const bad = [{ id: 'coverage', ok: false, level: 'attention' }];
  let fired = [];
  for (let i = 0; i < 3; i += 1) {
    const step = attentionStreak(streaks, bad);
    streaks = step.streaks;
    fired = step.fired;
  }
  assert.deepEqual(fired, ['coverage']);
  assert.equal(attentionStreak(streaks, [{ id: 'coverage', ok: true, level: 'ok' }]).streaks.coverage, 0);
  const sent = await dispatchAttention({ code: 'coverage' }, {}, async () => {
    throw new Error('should not be called');
  });
  assert.equal(sent.sent, false);
  assert.match(sent.reason, /GITHUB_DISPATCH_TOKEN/);
});

test('an invalid desk code is reported for a rebook', () => {
  const hits = invalidDeskReports({
    tiers: [{ id: 'tier:100', books: { betika: { error: 'Code expired', parts: [] }, sportybet: { parts: [{ code: 'ABC123' }] } } }],
  });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].desk, 'betika');
});

test('self-test is due at boot and after 04:00 GMT, once each', () => {
  const boot = selfTestDue({ bootDone: false, gmtDay: null }, new Date('2026-11-15T02:00:00.000Z'), true);
  assert.equal(boot.due, true);
  assert.equal(boot.gmtDue, false);
  const morning = selfTestDue({ bootDone: true, gmtDay: null }, new Date('2026-11-15T04:05:00.000Z'), false);
  assert.equal(morning.due, true);
  const again = selfTestDue({ bootDone: true, gmtDay: '2026-11-15' }, new Date('2026-11-15T05:00:00.000Z'), false);
  assert.equal(again.due, false);
});

test('compacting the data dir keeps the board and the device list', () => {
  const dir = mkdtempSync(join(tmpdir(), 'betspapa-disk-'));
  writeFileSync(join(dir, 'devices.json'), '[]');
  writeFileSync(join(dir, 'engine-state.json'), '{}');
  mkdirSync(join(dir, 'health'));
  const report = join(dir, 'health', '2020-01-01.json');
  writeFileSync(report, '{}');
  const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  utimesSync(report, old, old);
  const removed = compactDataDir(dir);
  assert.equal(removed.some((file) => file.endsWith('2020-01-01.json')), true);
  assert.equal(removed.some((file) => file.endsWith('devices.json')), false);
  assert.equal(removed.some((file) => file.endsWith('engine-state.json')), false);
});

test('incidents append and read back in newest-first order', () => {
  const dir = mkdtempSync(join(tmpdir(), 'betspapa-incidents-'));
  appendIncident(dir, { code: 'odds', message: 'wide price', fixed: true });
  appendIncident(dir, { code: 'coverage', message: 'missing betPawa', fixed: false });
  const rows = readIncidents(dir);
  assert.equal(rows[0].code, 'coverage');
  assert.equal(rows[1].fixed, true);
});

test('the fixer blocks secrets and stops over $20', () => {
  assert.equal(pathAllowed('server/guardian.mjs'), true);
  assert.equal(pathAllowed('android/betspapa-release.keystore'), false);
  assert.equal(pathAllowed('.env'), false);
  assert.equal(pathAllowed('scripts/ai-fixer.mjs'), false);
  assert.equal(pathAllowed('../secrets/token'), false);
  const cost = spendCost({ prompt_tokens: 1_000_000, completion_tokens: 1_000_000 });
  assert.equal(cost.usd, 18);
  const month = nextSpend({ month: '2026-11', usd: 19 }, 2, new Date('2026-11-15T00:00:00.000Z'));
  assert.equal(overCap(month), true);
  const reset = nextSpend({ month: '2026-10', usd: 19 }, 1, new Date('2026-11-15T00:00:00.000Z'));
  assert.equal(reset.usd, 1);
  const proposal = parseProposal('{"summary":"narrow","files":[{"path":"server/oddsRange.mjs","content":"export {}"},{"path":".env","content":"no"}]}');
  assert.equal(proposal.files.length, 1);
  assert.equal(proposal.files[0].path, 'server/oddsRange.mjs');
});

test('three attention cycles ask for the fixer and a missing token only logs', async () => {
  const calls = [];
  const dataDir = mkdtempSync(join(tmpdir(), 'betspapa-data-'));
  const guardian = createGuardian({
    dir: mkdtempSync(join(tmpdir(), 'betspapa-health-')),
    dataDir,
    backoffMs: [0],
    env: { GITHUB_DISPATCH_TOKEN: 'test-token' },
    fetchImpl: async (url, options) => {
      calls.push(JSON.parse(options.body).event_type);
      return { ok: true, status: 204 };
    },
    getState: () => ({
      books: {},
      master: null,
      trends: [],
      tiers: [{ id: 'tier:100', label: '100% all picks', legs: [{ eventId: 'sr:match:1', market: 'over15', odds: 1.9, kickoff: new Date(Date.now() + 3600_000).toISOString() }], books: {} }],
    }),
    runCycle: async () => {},
    now: () => new Date('2026-11-15T02:00:00.000Z'),
    push: () => ({ feedOk: true, sentOk: 0, sentError: 0 }),
    persistent: () => true,
  });
  await guardian.check();
  await guardian.check();
  const third = await guardian.check();
  assert.equal(third.ok, false);
  assert.deepEqual(calls, ['guardian-attention']);
  assert.equal(readIncidents(dataDir).some((row) => row.code === 'odds'), true);
  const quiet = await dispatchAttention({ code: 'coverage' }, {});
  assert.equal(quiet.sent, false);
});

test('a monitor status mismatch can be patched, and a real condition cannot', () => {
  assert.equal(monitorPatchAllowed('**Problem:** answered 200 (expected 200)'), true);
  assert.equal(monitorPatchAllowed('answered 502 (expected 200)'), false);
  assert.equal(monitorPatchAllowed('answered 200 but body did not contain "guardian":"ok" (guardian is "attention")'), false);
  const limited = limitMonitorProposal({
    summary: 'name the failed condition',
    files: [
      { path: 'server/index.mjs', content: 'no' },
      { path: '.github/monitor/checks.json', content: '{}' },
      { path: '.github/monitor/monitor_lib.py', content: 'print(1)\n' },
    ],
  });
  assert.deepEqual(limited.files.map((file) => file.path), ['.github/monitor/monitor_lib.py']);
  assert.match(instructions({ source: 'monitor' }), /do not delete or relax/i);
  const file = join(mkdtempSync(join(tmpdir(), 'betspapa-incident-')), 'incident.json');
  const log = join(tmpdir(), `monitor-log-${Date.now()}.txt`);
  writeFileSync(log, 'answered 200 (expected 200)\n');
  writeIncident({
    EVENT_NAME: 'workflow_run',
    WORKFLOW_NAME: 'Monitor (self-healing)',
    RUN_ID: '43735587283',
    CI_LOG: log,
    INCIDENT_FILE: file,
  });
  const record = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(record.source, 'monitor');
  assert.equal(record.name, 'Monitor (self-healing)');
  assert.match(record.log, /answered 200 \(expected 200\)/);
});

test('a named monitor failure does not call the model', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'betspapa-fixer-'));
  const incident = join(dir, 'incident.json');
  writeFileSync(incident, JSON.stringify({
    source: 'monitor',
    log: 'answered 200 but body did not contain "guardian":"ok" (guardian is "attention")',
  }));
  const code = await main({
    XAI_API_KEY: 'test-key',
    INCIDENT_FILE: incident,
    SPEND_FILE: join(dir, 'spend.json'),
    APPLY: '0',
  }, async () => {
    throw new Error('should not call the model');
  });
  assert.equal(code, 0);
});
