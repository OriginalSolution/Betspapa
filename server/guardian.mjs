/**
 * Papa Guardian. It watches the booked board from inside the server and
 * repairs what it can without another process or a paid service.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { boardHasCodes } from './engine.mjs';
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
  let timer = null;
  let running = false;
  const dir = options.dir || join(process.cwd(), 'data', 'engine', 'health');
  const intervalMs = options.intervalMs ?? 3 * 60 * 1000;
  const nowFn = options.now || (() => new Date());

  function logIncident(incident) {
    incidents.unshift({ at: new Date().toISOString(), ...incident });
    if (incidents.length > 40) incidents.length = 40;
  }

  function note(path, ms, bytes) {
    samples.push({ path: String(path || '/'), ms: Number(ms) || 0, bytes: Number(bytes) || 0, at: Date.now() });
    if (samples.length > 400) samples.splice(0, samples.length - 400);
  }

  async function repair(verdict) {
    const fixes = [];
    const state = options.getState ? options.getState() : null;
    if (verdict.actions.includes('restore') && options.restore && !boardHasCodes(state)) {
      const restored = await options.restore();
      if (restored) fixes.push('Restored the last booked board.');
    }
    const since = lastCycleAt ? Date.now() - lastCycleAt : Infinity;
    const repairNeeded = Boolean(options.needsRepair?.());
    const booking = Boolean(options.booking?.());
    const urgent = !boardHasCodes(options.getState ? options.getState() : null) || repairNeeded;
    if (!booking && (verdict.actions.includes('rerun') || repairNeeded) && options.runCycle && (urgent || since > 10 * 60 * 1000)) {
      await options.runCycle();
      lastCycleAt = Date.now();
      fixes.push('Ran a booking cycle.');
    }
    return fixes;
  }

  async function check() {
    if (running) return status();
    running = true;
    try {
      const state = options.getState ? options.getState() : null;
      const booking = Boolean(options.booking?.());
      const verdict = inspectEngine(state, nowFn().getTime(), { booking });
      lastCheckAt = nowFn().toISOString();
      let fixes = [];
      if (!verdict.ok) {
        try {
          fixes = await repair(verdict);
        } catch (error) {
          logIncident({ code: 'repair-failed', level: 'attention', message: error instanceof Error ? error.message : 'Repair failed.', fixed: false });
        }
        const after = options.getState ? options.getState() : state;
        const still = inspectEngine(after, Date.now(), { booking: Boolean(options.booking?.()) });
        for (const issue of verdict.issues.filter((item) => item.level !== 'info')) {
          logIncident({ ...issue, fixed: !still.issues.some((item) => item.code === issue.code), fix: fixes.join(' ') });
        }
      }
      if (options.fcm && !options.fcm()) {
        logIncident({ code: 'fcm-off', level: 'info', message: 'FCM is not configured on this process.', fixed: false });
      }
      const slow = latencySummary(samples).filter((row) => row.slow && row.path !== '/api/engine');
      const live = new Set(verdict.issues.filter((issue) => issue.level === 'attention' || issue.level === 'warn').map((issue) => issue.code));
      for (const row of slow) {
        live.add('slow-endpoint');
        logIncident({ code: 'slow-endpoint', level: 'attention', message: `${row.path} p95 is ${row.p95}ms.`, fixed: false });
      }
      for (const item of incidents) {
        if (!live.has(item.code)) item.fixed = true;
      }
      if (nightlyDue(lastNightly, nowFn())) await nightly();
      return status();
    } finally {
      running = false;
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
    const state = options.getState ? options.getState() : null;
    const verdict = inspectEngine(state || {}, Date.now(), { booking: Boolean(options.booking?.()) });
    const attention = incidents.filter((item) => item.level === 'attention' && !item.fixed);
    return {
      name: 'Papa Guardian',
      ok: verdict.ok,
      needsAttention: !verdict.ok,
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
