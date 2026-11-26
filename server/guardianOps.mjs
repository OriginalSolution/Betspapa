/**
 * Decisions Papa Guardian can make without another process.
 * Nothing here invents a booking code or a fixture.
 */
import { appendFileSync, mkdirSync, readdirSync, readFileSync, statfsSync, statSync, unlinkSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { totalmem } from 'node:os';
import { safeWriteFile } from './safeWrite.mjs';

export const LEG_KEEP_RATIO = 0.3;
export const DISK_PRESSURE = 0.8;
export const MEMORY_PRESSURE = 0.85;
export const ATTENTION_STREAK = 3;

const KEEP_FILES = new Set(['devices.json', 'engine-state.json', 'device-census.json', 'incidents.jsonl', 'push-baseline.json']);

export function cycleHung(startedAt, now, intervalMs) {
  const started = Number(startedAt);
  if (!Number.isFinite(started) || started <= 0) return false;
  const limit = Math.max(1, Number(intervalMs) || 0) * 2;
  return Number(now) - started > limit;
}

export function openLegCount(state, now = Date.now()) {
  const clock = now instanceof Date ? now.getTime() : Number(now);
  const rows = Array.isArray(state?.legs) && state.legs.length
    ? state.legs
    : [...(state?.master?.legs || []), ...(state?.trends || []).flatMap((slip) => slip?.legs || []), ...(state?.tiers || []).flatMap((slip) => slip?.legs || [])];
  return rows.filter((leg) => {
    const kick = Date.parse(leg?.kickoff || '');
    return Number.isFinite(kick) && kick >= clock;
  }).length;
}

/** A cycle that keeps codes but collapses the leg list must not replace the last good board. */
export function collapsedLegs(previous, next, now = Date.now()) {
  const before = openLegCount(previous, now);
  const after = openLegCount(next, now);
  return before > 0 && after > 0 && after < before * LEG_KEEP_RATIO;
}

export function diskPressure(usage) {
  const total = Number(usage?.total) || 0;
  const free = Number(usage?.free) || 0;
  if (total <= 0) return { full: false, used: 0 };
  const used = (total - free) / total;
  return { full: used > DISK_PRESSURE, used };
}

export function readDiskUsage(dir) {
  try {
    const stats = statfsSync(dir);
    const total = Number(stats.blocks) * Number(stats.bsize);
    const free = Number(stats.bavail) * Number(stats.bsize);
    return { total, free };
  } catch {
    return { total: 0, free: 0 };
  }
}

export function memoryHot(rss, limit) {
  const used = Number(rss) || 0;
  const cap = Number(limit) || 0;
  if (cap <= 0) return false;
  return used / cap > MEMORY_PRESSURE;
}

export function readMemoryLimit() {
  try {
    const raw = readFileSync('/sys/fs/cgroup/memory.max', 'utf8').trim();
    if (raw && raw !== 'max') {
      const value = Number(raw);
      if (Number.isFinite(value) && value > 0) return value;
    }
  } catch {
    /* the host limit is the fallback */
  }
  return totalmem();
}

export function shapeSample(value) {
  try {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    return text.length > 400 ? `${text.slice(0, 400)}…` : text;
  } catch {
    return String(value).slice(0, 400);
  }
}

/** A catalogue page is usable only when it still carries a tournament list. */
export function catalogueShape(payload) {
  return Boolean(payload && typeof payload === 'object' && !Array.isArray(payload) && Array.isArray(payload.data?.tournaments));
}

/** A desk body is usable when it is a JSON object. HTML or a bare list is a schema change. */
export function responseShape(body) {
  if (body && typeof body === 'object' && !Array.isArray(body)) return { ok: true, sample: '' };
  return { ok: false, sample: shapeSample(body) };
}

export function attentionStreak(previous, checks, limit = ATTENTION_STREAK) {
  const streaks = { ...(previous || {}) };
  const fired = [];
  const seen = new Set();
  for (const check of checks || []) {
    seen.add(check.id);
    if (!check.ok && check.level === 'attention') {
      streaks[check.id] = (Number(previous?.[check.id]) || 0) + 1;
      if (streaks[check.id] === limit) fired.push(check.id);
    } else streaks[check.id] = 0;
  }
  return { streaks, fired };
}

export function selfTestDue(state, now, boot) {
  const clock = now instanceof Date ? now : new Date(now);
  const day = clock.toISOString().slice(0, 10);
  const bootDue = Boolean(boot) && !state?.bootDone;
  const gmtDue = clock.getUTCHours() >= 4 && state?.gmtDay !== day;
  return { due: bootDue || gmtDue, bootDue, gmtDue, day };
}

export function noteSelfTest(state, result) {
  return {
    bootDone: true,
    gmtDay: result.gmtDue || (result.bootDue && result.hour >= 4) ? result.day : state?.gmtDay || null,
  };
}

const INVALID = /invalid|expired|not exist|unrecognized|unknown code/i;

export function invalidDeskReports(state) {
  const hits = [];
  const slips = [state?.master, ...(state?.trends || []), ...(state?.tiers || [])].filter(Boolean);
  for (const slip of slips) {
    for (const [desk, book] of Object.entries(slip?.books || {})) {
      const error = String(book?.error || '');
      if (INVALID.test(error)) hits.push({ desk, slip: slip.id || slip.label || 'slip', error: error.slice(0, 180) });
      for (const part of book?.parts || []) {
        const partError = String(part?.error || '');
        if (part?.invalid === true || INVALID.test(partError)) {
          hits.push({ desk, slip: slip.id || 'slip', code: part?.code || '', error: partError.slice(0, 180) || 'invalid' });
        }
      }
    }
  }
  return hits;
}

export function appendIncident(dir, record) {
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, 'incidents.jsonl'), `${JSON.stringify(record)}\n`);
}

export function readIncidents(dir, limit = 50) {
  if (!dir) return [];
  try {
    const text = readFileSync(join(dir, 'incidents.jsonl'), 'utf8');
    const rows = text.split('\n').filter(Boolean).map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(Boolean);
    return rows.slice(-limit).reverse();
  } catch {
    return [];
  }
}

/** Drop old health reports and shorten the incident log. Never removes the board or the device list. */
export function compactDataDir(dir, now = Date.now()) {
  const removed = [];
  if (!dir) return removed;
  const clock = now instanceof Date ? now.getTime() : Number(now);
  const health = join(dir, 'health');
  try {
    for (const name of readdirSync(health)) {
      const file = join(health, name);
      const stats = statSync(file);
      if (!stats.isFile()) continue;
      if (clock - stats.mtimeMs > 7 * 24 * 60 * 60 * 1000) {
        unlinkSync(file);
        removed.push(file);
      }
    }
  } catch {
    /* no health directory yet */
  }
  const incidents = join(dir, 'incidents.jsonl');
  try {
    const stats = statSync(incidents);
    if (stats.size > 512 * 1024) {
      const lines = readFileSync(incidents, 'utf8').split('\n').filter(Boolean).slice(-200);
      safeWriteFile(incidents, `${lines.join('\n')}\n`);
      removed.push(incidents);
    }
  } catch {
    /* no incident log yet */
  }
  try {
    for (const name of readdirSync(dir)) {
      if (KEEP_FILES.has(name) || name === 'health' || name === 'promos') continue;
      const file = join(dir, name);
      const stats = statSync(file);
      if (!stats.isFile() || stats.size < 2 * 1024 * 1024) continue;
      unlinkSync(file);
      removed.push(file);
    }
  } catch {
    /* the directory can be missing in a test */
  }
  return removed;
}

/** Names and trees that must survive a disk cleanup. Crest images and the fixture catalogue can be fetched again. */
const PROTECTED_FILES = new Set([
  'devices.json',
  'devices.json.bak',
  'engine-state.json',
  'engine-state.json.bak',
  'push-baseline.json',
  'push-baseline.json.bak',
  'device-census.json',
  'incidents.jsonl',
  'league-risk.json',
]);

const PROTECTED_DIRS = ['results', 'banker', 'lineups'];

export const DISK_FREE_TARGET = 200 * 1024 * 1024;

function relPath(dir, file) {
  return relative(dir, file).split(sep).join('/');
}

export function isProtectedData(dir, file) {
  const rel = relPath(dir, file);
  if (!rel || rel.startsWith('..')) return true;
  if (PROTECTED_FILES.has(rel)) return true;
  if (PROTECTED_DIRS.some((name) => rel === name || rel.startsWith(`${name}/`))) return true;
  if (/(^|\/)(promos\/state\.json|crests\/index\.json)$/.test(rel)) return true;
  if (/keystore|\.jks$|\.p12$|\.pem$|secret|credential|service-account/i.test(rel)) return true;
  return false;
}

function walkFiles(dir, root = dir) {
  const found = [];
  let names = [];
  try {
    names = readdirSync(dir);
  } catch {
    return found;
  }
  for (const name of names) {
    const file = join(dir, name);
    let stats;
    try {
      stats = statSync(file);
    } catch {
      continue;
    }
    if (stats.isDirectory()) found.push(...walkFiles(file, root));
    else if (stats.isFile()) found.push({ file, rel: relPath(root, file), size: stats.size, mtimeMs: stats.mtimeMs });
  }
  return found;
}

/** Bytes by top-level name, largest first. Used to see what filled the disk before anything is removed. */
export function diskBreakdown(dir) {
  const totals = new Map();
  for (const row of walkFiles(dir)) {
    const top = row.rel.split('/')[0] || row.rel;
    totals.set(top, (totals.get(top) || 0) + row.size);
  }
  return [...totals.entries()].map(([name, bytes]) => ({ name, bytes })).sort((a, b) => b.bytes - a.bytes);
}

/**
 * Free space on the data disk. Never removes device registrations, the results
 * record, banker codes, lineups, the booked board, or keystores and secrets.
 * Crest files and the fixture catalogue are caches and can be fetched again.
 */
export function relieveDisk(dir, { targetFreeBytes = DISK_FREE_TARGET, now = Date.now(), usage = null } = {}) {
  const removed = [];
  let freed = 0;
  if (!dir) return { removed, freed, before: { total: 0, free: 0 }, after: { total: 0, free: 0 }, largest: [] };
  const largest = diskBreakdown(dir);
  const before = usage || readDiskUsage(dir);
  const clock = now instanceof Date ? now.getTime() : Number(now);
  const drop = (row) => {
    if (!row || isProtectedData(dir, row.file)) return false;
    try {
      unlinkSync(row.file);
      removed.push(row.rel);
      freed += row.size || 0;
      return true;
    } catch {
      return false;
    }
  };
  const files = walkFiles(dir);
  for (const row of files) {
    if (row.rel.endsWith('.tmp')) drop(row);
  }
  const freeNow = () => {
    if (usage) return (Number(usage.free) || 0) + freed;
    return Number(readDiskUsage(dir).free) || 0;
  };
  const tight = () => freeNow() < targetFreeBytes;
  if (tight()) {
    for (const row of files) {
      if (row.rel === 'fixtures-catalogue.json' || row.rel.startsWith('health/')) {
        if (row.rel.startsWith('health/') && clock - row.mtimeMs < 3 * 24 * 60 * 60 * 1000) continue;
        drop(row);
      }
    }
    compactDataDir(dir, clock);
  }
  if (tight()) {
    const crests = walkFiles(dir)
      .filter((row) => row.rel.startsWith('crests/id/') && row.rel.endsWith('.png'))
      .sort((a, b) => a.mtimeMs - b.mtimeMs);
    for (const row of crests) {
      if (!tight()) break;
      drop(row);
    }
  }
  if (tight()) {
    const promos = walkFiles(dir)
      .filter((row) => row.rel.startsWith('promos/') && row.rel.endsWith('.png'))
      .sort((a, b) => a.mtimeMs - b.mtimeMs);
    for (const row of promos) {
      if (!tight()) break;
      drop(row);
    }
  }
  const after = readDiskUsage(dir);
  return { removed, freed, before, after, largest };
}

export async function dispatchAttention(incident, env = process.env, fetchImpl = fetch) {
  const token = String(env.GITHUB_DISPATCH_TOKEN || '').trim();
  if (!token) return { sent: false, reason: 'GITHUB_DISPATCH_TOKEN is not set.' };
  const repo = env.ENGINE_SNAPSHOT_REPO || 'OriginalSolution/Betspapa';
  const response = await fetchImpl(`https://api.github.com/repos/${repo}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'betspapa-guardian',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ event_type: 'guardian-attention', client_payload: incident }),
  });
  return { sent: response.ok, status: response.status };
}
