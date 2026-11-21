/**
 * Papa Guardian. It watches the booked board from inside the server and
 * repairs what it can without another process or a paid service.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { appEngineState, boardHasCodes } from './engine.mjs';
import { directoryPersistent, evaluateChecks, gzippedBytes, noteDeviceCount } from './guardianChecks.mjs';
import { appendIncident, attentionStreak, compactDataDir, diskPressure, dispatchAttention, invalidDeskReports, memoryHot, noteSelfTest, readDiskUsage, readMemoryLimit, selfTestDue } from './guardianOps.mjs';
import { priceInRange, rangeReason } from './oddsRange.mjs';

const DESKS = ['sportybet', 'footballcom', 'msport', 'betika', 'betpawa'];
const ZONE = 'Africa/Accra';

export function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

export function accraStamp(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || '';
  return { day: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')), minute: Number(get('minute')) };
}

/** True once 04:00 Accra has passed and today's report is not written yet. */
export function nightlyDue(lastDay, now = new Date()) {
  const stamp = accraStamp(now);
  return stamp.hour >= 4 && lastDay !== stamp.day;
}

function slipList(state) {
  return [state?.master, ...(state?.trends || []), ...(state?.tiers || [])].filter(Boolean);
}

/** What is wrong with the public board, and which repairs are safe to try. */
function hasOpenLegs(state, now) {
  return slipList(state).some((slip) =>
    (slip.legs || []).some((leg) => {
      const kick = Date.parse(leg.kickoff || '');
      return Number.isFinite(kick) && kick >= now;
    }),
  );
}

export function inspectEngine(state, now = Date.now(), { maxAgeMs = 20 * 60 * 1000, feedMaxMs = 30 * 60 * 1000, booking = false } = {}) {
  const issues = [];
  const actions = new Set();
  const fedAt = Date.parse(state?.feedAt || '');
  const feedFresh = Number.isFinite(fedAt) && now - fedAt < 10 * 60 * 1000;
  const working = Boolean(booking) && (hasOpenLegs(state, now) || feedFresh);
  if (!state || !boardHasCodes(state)) {
    if (!working) {
      issues.push({ code: 'empty-board', level: 'attention', message: 'The booked board has no codes.' });
      actions.add('restore');
      actions.add('rerun');
    }
  }
  const updated = Date.parse(state?.updatedAt || '');
  if (!booking && state?.updatedAt && Number.isFinite(updated) && now - updated > maxAgeMs) {
    issues.push({ code: 'stale-cycle', level: 'warn', message: 'The last booking cycle is older than 20 minutes.' });
    actions.add('rerun');
  }
  const fed = Date.parse(state?.feedAt || '');
  if (!booking && (!state?.feedAt || !Number.isFinite(fed) || now - fed > feedMaxMs)) {
    issues.push({ code: 'stale-feed', level: 'warn', message: 'The fixture feed is missing or older than 30 minutes.' });
    actions.add('rerun');
  }
  for (const slip of slipList(state)) {
    for (const leg of slip.legs || []) {
      if (leg.market && !priceInRange(leg.market, leg.odds, leg)) {
        issues.push({ code: 'out-of-range', level: 'attention', message: `${slip.id || 'slip'} ${rangeReason(leg.market, leg.odds)}` });
        actions.add('rerun');
      } else if (!leg.market && Number(leg.odds) > 0 && Number(leg.odds) < 1.18) {
        issues.push({ code: 'out-of-range', level: 'attention', message: `${slip.id || 'slip'} still lists a price under 1.18.` });
        actions.add('rerun');
      }
      const kick = Date.parse(leg.kickoff || '');
      if (Number.isFinite(kick) && kick < now) {
        issues.push({ code: 'started-leg', level: 'warn', message: `${slip.id || 'slip'} still lists a match that has kicked off.` });
        actions.add('rerun');
      }
    }
    if ((slip.legs || []).length) {
      for (const desk of DESKS) {
        const book = slip.books?.[desk];
        const coded = (book?.parts || []).some((part) => part?.code);
        if (!coded) {
          issues.push({ code: 'missing-code', level: 'info', message: `${slip.label || slip.id || 'slip'} has no ${desk} code.` });
        }
      }
    }
  }
  const attention = issues.some((issue) => issue.level === 'attention' || issue.level === 'warn');
  return { ok: !attention, issues, actions: [...actions] };
}

export function latencySummary(samples) {
  const byPath = {};
  for (const row of samples) {
    const bucket = byPath[row.path] || (byPath[row.path] = { path: row.path, count: 0, bytes: [], ms: [] });
    bucket.count += 1;
    bucket.ms.push(row.ms);
    bucket.bytes.push(row.bytes);
  }
  return Object.values(byPath).map((bucket) => ({
    path: bucket.path,
    count: bucket.count,
    p50: percentile(bucket.ms, 50),
    p95: percentile(bucket.ms, 95),
    bytesP95: percentile(bucket.bytes, 95),
    slow: (percentile(bucket.ms, 95) || 0) > 500 && bucket.count >= 5,
  }));
}

export function selfTestEngine() {
  const checks = [];
  const empty = inspectEngine({ updatedAt: null, feedAt: null, master: null, trends: [], tiers: [] }, Date.now());
  checks.push({ name: 'empty board asks for a restore', ok: empty.actions.includes('restore') && empty.actions.includes('rerun') });
  const fresh = inspectEngine({
    updatedAt: new Date().toISOString(),
    feedAt: new Date().toISOString(),
    master: { id: 'master', legs: [{ market: 'over25', odds: 1.4, kickoff: new Date(Date.now() + 3600_000).toISOString() }], books: { sportybet: { parts: [{ code: 'ABCD12' }] } } },
    trends: [],
    tiers: [],
    books: { sportybet: { parts: [{ code: 'ABCD12' }] } },
  });
  checks.push({ name: 'a fresh coded board is healthy', ok: fresh.ok });
  const wide = inspectEngine({
    updatedAt: new Date().toISOString(),
    feedAt: new Date().toISOString(),
    master: { id: 'master', legs: [{ market: 'over15', odds: 1.55, kickoff: new Date(Date.now() + 3600_000).toISOString() }], books: {} },
    trends: [],
    tiers: [],
  });
  checks.push({ name: 'an out-of-range leg fails the check', ok: !wide.ok && wide.issues.some((issue) => issue.code === 'out-of-range') });
  checks.push({ name: 'percentiles are ordered', ok: percentile([10, 20, 30, 40], 95) >= percentile([10, 20, 30, 40], 50) });
  return { ok: checks.every((check) => check.ok), checks };
}

export function createGuardian(options = {}) {
  const incidents = [];
  const samples = [];
  let lastCheckAt = null;
  let lastCycleAt = null;
  let lastNightly = null;
  let lastReport = null;
  let heldVerdict = null;
  let heldAt = 0;
  let heldWhile = '';
  let staleAfterBooking = false;
  const healthCacheMs = options.healthCacheMs ?? 15_000;
  let timer = null;
  let running = false;
  const dir = options.dir || join(process.cwd(), 'data', 'engine', 'health');
  const intervalMs = options.intervalMs ?? 3 * 60 * 1000;
  const nowFn = options.now || (() => new Date());

  function logIncident(incident) {
    const record = { at: new Date().toISOString(), fixed: false, ...incident };
    incidents.unshift(record);
    if (incidents.length > 40) incidents.length = 40;
    try {
      appendIncident(options.dataDir, record);
    } catch {
      /* a full disk is reported by the disk check */
    }
  }

  function note(path, ms, bytes) {
    samples.push({ path: String(path || '/'), ms: Number(ms) || 0, bytes: Number(bytes) || 0, at: Date.now() });
    if (samples.length > 400) samples.splice(0, samples.length - 400);
  }

  let sawBoot = false;
  let devicesLost = false;
  let previousDevices = 0;
  let streaks = {};
  let selfTestState = { bootDone: false, gmtDay: null };
  let memoryHigh = 0;

  function pause(ms) {
    if (!ms) return Promise.resolve();
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function deviceCount() {
    return options.deviceCount ? Number(options.deviceCount()) || 0 : 0;
  }

  function rememberDevices(boot) {
    const count = deviceCount();
    const dataDir = options.dataDir || null;
    if (dataDir) {
      const noted = noteDeviceCount(dataDir, count, { boot, now: nowFn() });
      if (noted.lost) devicesLost = true;
      if (noted.previous) previousDevices = noted.previous;
    }
    if (count > 0) {
      devicesLost = false;
      previousDevices = count;
    }
    return count;
  }

  function evaluate({ fresh = false } = {}) {
    const booking = Boolean(options.booking?.());
    const idleFresh = heldWhile === 'idle' && !staleAfterBooking && Date.now() - heldAt < healthCacheMs;
    if (!fresh && heldVerdict && (booking || idleFresh)) {
      if (booking) staleAfterBooking = true;
      return heldVerdict;
    }
    staleAfterBooking = false;
    const state = options.getState ? options.getState() : {};
    const raw = options.getRaw ? options.getRaw() : state;
    const push = options.push ? options.push() : { feedOk: null, sentOk: 0, sentError: 0, feedError: null };
    const dataDir = options.dataDir || null;
    const persistent = options.persistent ? Boolean(options.persistent()) : dataDir ? directoryPersistent(dataDir) : true;
    const stored = options.persistence ? options.persistence() : null;
    const verdict = evaluateChecks({
      mode: options.mode ? options.mode() : 'live',
      state,
      raw: { ...raw, extraLegs: options.extraLegs ? options.extraLegs() : raw?.extraLegs },
      now: nowFn(),
      booking,
      persistent,
      boardStored: stored ? stored.disk !== false : true,
      diskError: stored?.error && stored.disk === false ? stored.error : '',
      snapshot: stored?.snapshot || '',
      devices: deviceCount(),
      previousDevices,
      devicesLost,
      feedOk: push.feedOk,
      feedError: push.feedError,
      sentOk: push.sentOk,
      sentError: push.sentError,
      pruned: Number(push.pruned) || 0,
      payloadBytes: booking && heldVerdict ? 0 : (options.payloadBytes ? options.payloadBytes() : gzippedBytes(appEngineState(state))),
    });
    if (options.needsRepair?.() && !verdict.actions.includes('rebook')) verdict.actions.push('rebook');
    heldVerdict = verdict;
    heldAt = Date.now();
    heldWhile = booking ? 'booking' : 'idle';
    return verdict;
  }

  async function heal(verdict) {
    const fixes = [];
    if (verdict.actions.includes('switch-live') && options.forceLive?.()) fixes.push('Switched to live.');
    const state = options.getState ? options.getState() : null;
    if (verdict.actions.includes('restore') && options.restore && !boardHasCodes(state)) {
      const restored = await options.restore();
      if (restored) fixes.push('Restored the last booked board.');
    }
    if (options.pruneDevices) {
      const removed = Number(await options.pruneDevices()) || 0;
      if (removed) fixes.push(`Removed ${removed} stale tokens.`);
    }
    return fixes;
  }

  async function rebook() {
    if (options.booking?.() || !options.runCycle) return [];
    const fixes = [];
    const delays = Array.isArray(options.backoffMs) ? options.backoffMs : [2000, 8000, 20000];
    const attempts = Math.max(1, delays.length);
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (attempt > 0) await pause(delays[attempt - 1] || delays[delays.length - 1]);
      if (options.booking?.()) break;
      await options.runCycle();
      lastCycleAt = Date.now();
      fixes.push(attempt === 0 ? 'Ran a booking cycle.' : `Rebooked after a wait (${attempt + 1}).`);
      const again = evaluate({ fresh: true });
      if (again.ok || !again.actions.includes('rebook')) break;
    }
    return fixes;
  }

  async function check() {
    if (running) return status();
    if (options.booking?.()) {
      if (options.restartHung?.()) {
        logIncident({ code: 'hung-cycle', level: 'attention', message: 'Restarted a booking cycle that ran longer than two intervals.', fixed: true });
      }
      return status();
    }
    running = true;
    try {
      const boot = !sawBoot;
      sawBoot = true;
      let repairFailed = false;
      rememberDevices(boot);
      if (options.restartHung?.()) {
        logIncident({ code: 'hung-cycle', level: 'attention', message: 'Restarted a booking cycle that ran longer than two intervals.', fixed: true });
      }
      const disk = options.disk ? options.disk() : options.dataDir ? diskPressure(readDiskUsage(options.dataDir)) : { full: false, used: 0 };
      if (disk.full && options.dataDir) {
        const removed = compactDataDir(options.dataDir, nowFn());
        logIncident({ code: 'disk', level: 'attention', message: `Data disk is ${Math.round((disk.used || 0) * 100)}% full. Compacted ${removed.length} old files.`, fixed: removed.length > 0 });
      }
      const invalid = invalidDeskReports(options.getRaw ? options.getRaw() : options.getState?.());
      let verdict = evaluate({ fresh: true });
      if (invalid.length && !verdict.actions.includes('rebook')) verdict.actions.push('rebook');
      lastCheckAt = nowFn().toISOString();
      let fixes = [];
      if (!verdict.ok || verdict.actions.includes('rebook') || verdict.actions.includes('switch-live')) {
        try {
          fixes = await heal(verdict);
          if (verdict.actions.includes('rebook') || verdict.actions.includes('rerun') || options.needsRepair?.()) {
            fixes.push(...await rebook());
          }
        } catch (error) {
          repairFailed = true;
          logIncident({ code: 'repair-failed', level: 'attention', message: error instanceof Error ? error.message : 'Repair failed.', fixed: false });
        }
        verdict = evaluate({ fresh: true });
        for (const row of verdict.checks.filter((item) => !item.ok && item.level === 'attention')) {
          logIncident({ code: row.id, level: row.level, message: row.message, fixed: false, fix: fixes.join(' ') });
        }
      }
      if (options.fcm && !options.fcm()) {
        logIncident({ code: 'fcm-off', level: 'info', message: 'FCM is not configured on this process.', fixed: false });
      }
      const slow = latencySummary(samples).filter((row) => row.slow && row.path !== '/api/engine');
      const live = new Set(verdict.checks.filter((row) => !row.ok && row.level === 'attention').map((row) => row.id));
      for (const row of slow) {
        live.add('slow-endpoint');
        logIncident({ code: 'slow-endpoint', level: 'attention', message: `${row.path} p95 is ${row.p95}ms.`, fixed: false });
      }
      for (const item of incidents) {
        if (!live.has(item.code)) item.fixed = true;
      }
      if (nightlyDue(lastNightly, nowFn())) await nightly();
      await maybeSelfTest(boot);
      const streak = attentionStreak(streaks, verdict.checks);
      streaks = streak.streaks;
      if (repairFailed || streak.fired.length) {
        const incident = {
          at: new Date().toISOString(),
          code: repairFailed ? 'repair-failed' : streak.fired[0],
          message: repairFailed ? 'Self-repair failed.' : verdict.reason || 'A check stayed in attention.',
          action: fixes.join(' '),
          fixed: false,
          checks: streak.fired,
        };
        logIncident({ code: 'ai-fixer', level: 'attention', message: incident.message, fixed: false });
        const sent = await dispatchAttention(incident, options.env || process.env, options.fetchImpl || fetch);
        if (!sent.sent) logIncident({ code: 'ai-fixer', level: 'info', message: sent.reason || 'Attention was logged for the fixer.', fixed: false });
      }
      const rss = options.rss ? options.rss() : process.memoryUsage().rss;
      const limit = options.memoryLimit ? options.memoryLimit() : readMemoryLimit();
      memoryHigh = memoryHot(rss, limit) ? memoryHigh + 1 : 0;
      if (memoryHigh >= 3) {
        logIncident({ code: 'memory', level: 'attention', message: 'Memory stayed over 85%. Exiting so the host can restart the process.', fixed: false });
        (options.exit || ((code) => process.exit(code)))(0);
      }
      return status();
    } finally {
      running = false;
    }
  }

  async function maybeSelfTest(boot) {
    if (!options.selfTest) return;
    const clock = nowFn();
    const due = selfTestDue(selfTestState, clock, boot);
    if (!due.due) return;
    selfTestState = noteSelfTest(selfTestState, { ...due, hour: clock.getUTCHours() });
    try {
      const result = await options.selfTest();
      logIncident({ code: 'self-test', level: result?.ok ? 'info' : 'attention', message: result?.message || 'Self-test finished.', fixed: Boolean(result?.ok) });
    } catch (error) {
      logIncident({ code: 'self-test', level: 'attention', message: error instanceof Error ? error.message : 'Self-test failed.', fixed: false });
    }
  }

  async function nightly() {
    const stamp = accraStamp(nowFn());
    const fixes = [];
    if (options.runCycle) {
      await options.runCycle();
      lastCycleAt = Date.now();
      fixes.push('Settled and rebooked on the nightly cycle.');
    }
    let prunedDevices = 0;
    if (options.pruneDevices) prunedDevices = await options.pruneDevices();
    if (prunedDevices) fixes.push(`Removed ${prunedDevices} devices with an unusable token.`);
    let prunedPromos = 0;
    if (options.prunePromos) prunedPromos = await options.prunePromos();
    if (prunedPromos) fixes.push(`Removed ${prunedPromos} old promos.`);
    if (options.crests) {
      try {
        await options.crests();
        fixes.push('Checked crest coverage.');
      } catch (error) {
        logIncident({ code: 'crests', level: 'attention', message: error instanceof Error ? error.message : 'Crest check failed.', fixed: false });
      }
    }
    const tests = selfTestEngine();
    const endpoints = options.probe ? await options.probe() : [];
    const slowProbe = endpoints.filter((row) => row.ms > 500 || !row.ok);
    const report = {
      day: stamp.day,
      at: new Date().toISOString(),
      fixes,
      tests,
      endpoints,
      latency: latencySummary(samples),
      needsAttention: !tests.ok || slowProbe.length > 0 || incidents.some((item) => item.level === 'attention' && !item.fixed),
    };
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${stamp.day}.json`), JSON.stringify(report, null, 2));
    } catch (error) {
      logIncident({ code: 'report', level: 'attention', message: error instanceof Error ? error.message : 'Could not write the health report.', fixed: false });
    }
    lastNightly = stamp.day;
    lastReport = report;
    if (report.needsAttention) {
      logIncident({ code: 'nightly', level: 'attention', message: `Nightly report ${stamp.day} needs attention.`, fixed: false });
    }
    return report;
  }

  function status() {
    const booking = Boolean(options.booking?.());
    const state = booking ? null : (options.getState ? options.getState() : null);
    const verdict = evaluate();
    return {
      name: 'Papa Guardian',
      ok: verdict.ok,
      needsAttention: !verdict.ok,
      reason: verdict.reason,
      checks: verdict.checks,
      devices: deviceCount(),
      lastCheckAt,
      lastCycleAt: lastCycleAt ? new Date(lastCycleAt).toISOString() : state?.updatedAt || null,
      lastNightly,
      lastReport,
      verdict,
      incidents: incidents.slice(0, 20),
      latency: latencySummary(samples),
      mail: false,
    };
  }

  return {
    note,
    check,
    nightly,
    status,
    start() {
      if (timer) return;
      void check();
      timer = setInterval(() => void check(), intervalMs);
      timer.unref?.();
    },
    stop() {
      clearInterval(timer);
      timer = null;
    },
  };
}

let active = null;

export function attachGuardian(guardian) {
  active = guardian;
}

export function noteRequest(path, ms, bytes) {
  active?.note(path, ms, bytes);
}

export function guardianStatus() {
  return active?.status() || {
    name: 'Papa Guardian',
    ok: true,
    needsAttention: false,
    incidents: [],
    latency: [],
    verdict: { ok: true, issues: [], actions: [] },
    mail: false,
  };
}
