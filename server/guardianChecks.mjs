/**
 * Papa Guardian's checks. Each one is a plain result the health route can show.
 * The watchdog repairs what it can and leaves the rest as attention.
 */
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { DESK_MAX } from './bookers.mjs';
import { boardHasCodes } from './engine.mjs';
import { legOpen, priceInRange, rangeReason } from './oddsRange.mjs';
import { PART_SIZE } from './slips.mjs';

export const CHECK_IDS = ['mode', 'board', 'odds', 'kickoff', 'coverage', 'persist', 'push', 'payload'];
export const APP_PAYLOAD_LIMIT = 400 * 1024;
export const DESKS = ['sportybet', 'footballcom', 'msport', 'betika', 'betpawa'];
const DESK_LABEL = {
  sportybet: 'SportyBet',
  footballcom: 'Football.com',
  msport: 'MSport',
  betika: 'Betika',
  betpawa: 'betPawa',
};

export function isLiveMode(mode) {
  const value = String(mode || '').trim().toLowerCase();
  return value !== 'demo' && value !== 'simulated' && value !== 'simulation';
}

export function partCap(desk) {
  return Math.min(PART_SIZE, DESK_MAX[desk] || PART_SIZE);
}

function slipList(state) {
  return [state?.master, ...(state?.trends || []), ...(state?.tiers || [])].filter(Boolean);
}

function slipName(slip) {
  return slip?.label || slip?.name || slip?.id || 'slip';
}

function openLegs(slip, now) {
  return (slip?.legs || []).filter((leg) => legOpen(leg, now));
}

function codedParts(slip, desk) {
  return (slip?.books?.[desk]?.parts || []).filter((part) => part?.code);
}

function partLegs(part) {
  if (Array.isArray(part?.matches) && part.matches.length) return part.matches.length;
  const count = Number(part?.legs);
  return Number.isFinite(count) ? count : 0;
}

function headline(state, tier) {
  return (state?.tiers || []).find((slip) => slip?.id === `tier:${tier}` || (slip?.tier === tier && !slip?.market)) || null;
}

function marketSlips(state) {
  return [...(state?.tiers || []).filter((slip) => slip?.market), ...(state?.trends || [])];
}

function compact(issues, okText) {
  if (!issues.length) return okText;
  const head = issues.slice(0, 2).join(' ');
  return issues.length > 2 ? `${head} ${issues.length - 2} more.` : head;
}

function check(id, ok, level, message, actions = []) {
  return { id, ok, level: ok ? 'ok' : level, message, actions: ok ? [] : actions };
}

/** True when the directory sits on a mount other than the root filesystem. */
export function directoryPersistent(dir) {
  try {
    if (!dir || !existsSync(dir)) return false;
    let current = realpathSync(dir);
    const root = realpathSync('/');
    while (current && current !== root) {
      const parent = dirname(current);
      if (parent === current) return false;
      if (statSync(current).dev !== statSync(parent).dev) return true;
      current = parent;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Remember a non-zero device count beside devices.json.
 * A restart that finds 0 devices after a higher count is a lost list.
 * A lost list does not overwrite the remembered count.
 */
export function noteDeviceCount(dir, count, { boot = false, now = new Date() } = {}) {
  const safe = Math.max(0, Number(count) || 0);
  const file = dir ? join(dir, 'device-census.json') : '';
  let previous = 0;
  if (file) {
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8'));
      const stored = Number(parsed?.count);
      if (Number.isFinite(stored) && stored > 0) previous = stored;
    } catch {
      previous = 0;
    }
  }
  const lost = Boolean(boot) && previous > 0 && safe === 0;
  if (file && !lost && safe > 0) {
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(file, JSON.stringify({ count: safe, at: (now instanceof Date ? now : new Date(now)).toISOString() }));
    } catch {
      /* the persist check reports a directory that cannot be written */
    }
  }
  return { lost, previous, count: safe };
}

export function gzippedBytes(value) {
  const json = typeof value === 'string' ? value : JSON.stringify(value ?? null);
  return gzipSync(Buffer.from(json)).length;
}

function oddsIssues(state, now) {
  const issues = [];
  for (const slip of slipList(state)) {
    for (const leg of openLegs(slip, now)) {
      if (priceInRange(leg?.market, leg?.odds, leg)) continue;
      issues.push(`${slipName(slip)} ${rangeReason(leg?.market, leg?.odds)}`);
    }
  }
  for (const leg of state?.extraLegs || []) {
    if (!legOpen(leg, now) && leg?.kickoff) continue;
    if (priceInRange(leg?.market, leg?.odds, leg)) continue;
    issues.push(`${leg.surface || 'surface'} ${rangeReason(leg?.market, leg?.odds)}`);
  }
  return issues;
}

function kickoffIssues(state, now) {
  const issues = [];
  for (const slip of slipList(state)) {
    const started = (slip?.legs || []).filter((leg) => {
      const kick = Date.parse(leg?.kickoff || '');
      return Number.isFinite(kick) && kick < now;
    });
    if (started.length) issues.push(`${slipName(slip)} still lists ${started.length} kicked-off ${started.length === 1 ? 'leg' : 'legs'}.`);
  }
  return issues;
}

function coverageIssues(state, now) {
  const issues = [];
  const watched = [
    ...['100', '90', '80'].map((tier) => ({ slip: headline(state, tier), empty: `${tier}% has no open legs.` })),
    ...marketSlips(state).map((slip) => ({ slip, empty: null })),
  ];
  for (const row of watched) {
    const slip = row.slip;
    if (!slip) {
      if (row.empty) issues.push({ empty: true, message: row.empty });
      continue;
    }
    const legs = openLegs(slip, now);
    if (!legs.length) {
      if (row.empty) issues.push({ empty: true, message: row.empty });
      continue;
    }
    for (const desk of DESKS) {
      const parts = codedParts(slip, desk);
      const cap = partCap(desk);
      if (!parts.length) {
        issues.push({ empty: false, message: `${slipName(slip)} has no ${DESK_LABEL[desk]} code.` });
        continue;
      }
      parts.forEach((part, index) => {
        const count = partLegs(part);
        if (count > cap) {
          issues.push({
            empty: false,
            message: `${slipName(slip)} ${DESK_LABEL[desk]} part ${index + 1} has ${count} legs. The desk holds ${cap}.`,
          });
        }
      });
    }
  }
  return issues;
}

/**
 * @returns {{ ok: boolean, reason: string|null, checks: Array<{id:string,ok:boolean,level:string,message:string}>, actions: string[] }}
 */
export function evaluateChecks(input = {}) {
  const now = input.now instanceof Date ? input.now.getTime() : Number(input.now) || Date.now();
  const state = input.state || {};
  const raw = input.raw || state;
  const actions = new Set();
  const checks = [];

  const live = isLiveMode(input.mode ?? 'live');
  checks.push(check('mode', live, 'attention', live ? 'Mode is live.' : 'Mode is not live. Switching to live.', ['switch-live']));

  const booking = Boolean(input.booking);
  const coded = boardHasCodes(state);
  if (coded) checks.push(check('board', true, 'attention', 'The booked board is being served.'));
  else if (booking) checks.push(check('board', true, 'attention', 'A booking cycle is still running. The last board stays up.'));
  else {
    actions.add('restore');
    actions.add('rebook');
    checks.push(check('board', false, 'attention', 'The booked board has no codes.', ['restore', 'rebook']));
  }

  const odds = oddsIssues(raw, now);
  if (odds.length) actions.add('rebook');
  checks.push(check('odds', odds.length === 0, 'attention', compact(odds, 'Booked legs are inside the odds table.'), ['rebook']));

  const kicked = kickoffIssues(raw, now);
  if (kicked.length) actions.add('rebook');
  checks.push(check('kickoff', kicked.length === 0, 'attention', compact(kicked, 'Kicked-off legs are off the board.'), ['rebook']));

  const coverage = coverageIssues(state, now);
  const coverageGaps = coverage.filter((row) => !row.empty);
  const coverageNote = coverage.filter((row) => row.empty).map((row) => row.message);
  if (coverageGaps.length) actions.add('rebook');
  const coverageMessage = coverageGaps.length
    ? compact(coverageGaps.map((row) => row.message), '')
    : coverageNote.length
      ? `Desk codes are booked. ${coverageNote.join(' ')}`
      : 'Tiers and markets have codes on the five desks.';
  checks.push(check('coverage', coverageGaps.length === 0, 'attention', coverageMessage, ['rebook']));

  const persistent = input.persistent !== false;
  const devices = Math.max(0, Number(input.devices) || 0);
  const previous = Math.max(0, Number(input.previousDevices) || 0);
  const lost = Boolean(input.devicesLost) || (Boolean(input.restarted) && previous > 0 && devices === 0);
  const persistIssues = [];
  if (!persistent) persistIssues.push('The data directory is not a persistent disk.');
  if (lost) persistIssues.push(`Device list was lost after a restart (was ${previous || 'some'}, now 0).`);
  checks.push(check(
    'persist',
    persistIssues.length === 0,
    'attention',
    persistIssues.length ? persistIssues.join(' ') : `Data directory is persistent. ${devices} ${devices === 1 ? 'device' : 'devices'}.`,
  ));

  const feedOk = input.feedOk;
  const sentOk = Number(input.sentOk) || 0;
  const sentError = Number(input.sentError) || 0;
  const pruned = Number(input.pruned) || 0;
  let pushOk = true;
  let pushLevel = 'attention';
  let pushMessage = `Live feed is current. FCM sends success ${sentOk}, error ${sentError}. Stale tokens pruned: ${pruned}.`;
  if (feedOk == null) pushMessage = 'Waiting for the first live-feed read.';
  else if (feedOk === false) {
    pushOk = false;
    const why = input.feedError ? ` ${input.feedError}` : '';
    pushMessage = `The last live-feed read failed.${why}`;
  }
  checks.push(check('push', pushOk, pushLevel, pushMessage));

  const payloadBytes = Number(input.payloadBytes) || 0;
  const heavy = payloadBytes > APP_PAYLOAD_LIMIT;
  checks.push(check(
    'payload',
    !heavy,
    'warn',
    heavy
      ? `The app board is ${Math.ceil(payloadBytes / 1024)}KB gzipped, over the 400KB limit.`
      : 'The app board is within 400KB gzipped.',
  ));

  const attention = checks.filter((row) => !row.ok && row.level === 'attention');
  for (const row of checks) {
    for (const action of row.actions || []) actions.add(action);
  }
  return {
    ok: attention.length === 0,
    reason: attention[0]?.message || null,
    checks: checks.map(({ id, ok, level, message }) => ({ id, ok, level, message })),
    actions: [...actions],
  };
}
