/**
 * The crest list. Teams are keyed by their sr:competitor id and every badge we
 * serve is our own checked copy on the data disk:
 *   api.betspapa.com/crests/id/{id}.png?v={hash}
 * Resolve order: manual override > Sportradar by id > the bundled catalogue >
 * TheSportsDB > Wikidata > a flag (national teams only). One paced queue does
 * all lookups. Misses back off and are retried by the nightly pre-warm, each
 * booking cycle's top-up, and the Papa Guardian crest check.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { coreName, flagUrl, isNationalSide, looseKey, teamSlug } from '../src/lib/crestMatch.mjs';
import { loadCatalog, loadOverrides, pacer, sportsDb, wikidata } from './crestResolve.mjs';
import { prepareCrest } from './crestImage.mjs';

const USER_AGENT = 'Betspapa/0.4.15 (crest list; https://betspapa.com)';
export const SPORTRADAR = 'https://img.sportradar.com/ls/crest/big/';
const DAY = 86_400_000;
/** Bump when the image checks change so earlier misses are tried again at once. */
export const CHECK_VERSION = 2;
const TRANSIENT = /http (429|5\d\d)|abort|timeout|timed out|fetch failed|network|ECONN|ETIMEDOUT|socket/i;
const HOUR = 3_600_000;
const TOP = [/^england\|premier league$/, /^spain\|laliga$/, /^italy\|serie a$/, /^germany\|bundesliga$/, /^france\|ligue 1$/, /^international clubs\|uefa (champions|europa|conference) league/];
const YOUTH = /\b(u1[5-9]|u2[0-3]|women|youth|reserve|amateur|juvenil|primavera|development|academy)\b|\b(w|ii|b|u\d\d)$/i;

export function competitorId(raw) {
  const text = String(raw ?? '').trim();
  const match = text.match(/^(?:sr:competitor:)?(\d{1,12})$/);
  return match ? match[1] : '';
}

export function teamTier(name, country, tournament) {
  const key = `${String(country || '').toLowerCase()}|${String(tournament || '').toLowerCase()}`;
  if (YOUTH.test(name || '') || YOUTH.test(tournament || '')) return 'youth';
  return TOP.some((rule) => rule.test(key)) ? 'top' : 'other';
}

function crestKey(name) {
  return String(name || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
}

function emptyIndex() {
  return { version: 1, teams: {}, misses: {}, overrides: {} };
}

function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createCrestStore(options = {}) {
  const dir = options.dir || join(process.env.ENGINE_DATA_DIR || join(process.cwd(), 'data', 'engine'), 'crests');
  const imgDir = join(dir, 'id');
  const indexFile = join(dir, 'index.json');
  const origin = (options.origin || process.env.PUBLIC_API_ORIGIN || 'https://api.betspapa.com').replace(/\/$/, '');
  const fetchImpl = options.fetchImpl || fetch;
  const now = options.now || (() => Date.now());
  const root = options.root || process.cwd();
  const log = options.log || ((message) => console.log(`[crests] ${message}`));
  mkdirSync(imgDir, { recursive: true });
  const index = { ...emptyIndex(), ...readJson(indexFile, {}) };
  for (const key of ['teams', 'misses', 'overrides']) if (!index[key] || typeof index[key] !== 'object') index[key] = {};
  if (index.checkVersion !== CHECK_VERSION) {
    for (const miss of Object.values(index.misses)) {
      miss.nextAt = 0;
      miss.tries = 0;
    }
    index.checkVersion = CHECK_VERSION;
  }
  let legacy = null;
  let legacyOverrides = null;
  const paceRadar = options.paceRadar || pacer(options.radarGap ?? 250);
  const paceImage = options.paceImage || pacer(options.imageGap ?? 150);
  const deps = {
    fetchImpl,
    memory: {},
    paceSports: options.paceSports || pacer(options.sportsGap ?? 2100),
    paceWiki: options.paceWiki || pacer(options.wikiGap ?? 400),
  };
  const queue = [];
  const slowQueue = [];
  const queued = new Set();
  let lastEvents = [];
  let lastHealAt = 0;
  let saveTimer = null;
  const stats = { resolved: 0, missed: 0, bySource: {}, startedAt: new Date(now()).toISOString() };

  function legacyCatalog() {
    if (!legacy) {
      try {
        legacy = loadCatalog(root);
      } catch {
        legacy = { byKey: {}, byId: {} };
      }
    }
    return legacy;
  }

  function legacyOverride(name) {
    if (!legacyOverrides) {
      try {
        legacyOverrides = loadOverrides(root);
      } catch {
        legacyOverrides = { byName: {}, byId: {} };
      }
    }
    const keys = [name, crestKey(name), looseKey(name), teamSlug(name)];
    for (const key of keys) {
      const value = legacyOverrides.byName[key] || legacyOverrides.byId[key];
      if (typeof value === 'string' && /^https:\/\//.test(value)) return value;
    }
    return '';
  }

  /** The bundled file path for a name, e.g. /crests/img/abc.png, or ''. */
  function legacyPath(name) {
    const catalog = legacyCatalog();
    for (const key of [teamSlug(name), crestKey(name), looseKey(name), coreName(name)]) {
      if (!key) continue;
      const file = catalog.byId?.[key] || catalog.byKey?.[key];
      if (typeof file === 'string' && file) return file;
    }
    return '';
  }

  function saveSoon() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      saveNow();
    }, options.saveDelayMs ?? 2000);
    saveTimer.unref?.();
  }

  function saveNow() {
    const tmp = `${indexFile}.tmp`;
    writeFileSync(tmp, JSON.stringify(index));
    renameSync(tmp, indexFile);
  }

  function urlFor(cid) {
    const row = index.teams[cid];
    return row ? `${origin}/crests/id/${cid}.png?v=${row.hash}` : '';
  }

  /** Crest URL for a team: our copy by id, else the bundled catalogue by name, else ''. */
  function crestFor(rawId, name) {
    const cid = competitorId(rawId);
    if (cid && index.teams[cid]) return urlFor(cid);
    const file = name ? legacyPath(name) : '';
    if (!file) return '';
    if (/^https?:\/\//i.test(file)) return file;
    return `${origin}${file.startsWith('/') ? file : `/${file}`}`;
  }

  async function download(url) {
    if (url.startsWith('/')) {
      const local = join(root, 'public', url.split('?')[0]);
      if (!local.startsWith(join(root, 'public')) || !existsSync(local)) throw new Error('missing bundled file');
      return readFileSync(local);
    }
    if (/sofascore|sportybet/i.test(url)) throw new Error('blocked source');
    let last = new Error('download failed');
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetchImpl(url, {
          headers: { 'User-Agent': USER_AGENT, Accept: 'image/png,image/*;q=0.8,*/*;q=0.5' },
          redirect: 'follow',
          signal: AbortSignal.timeout(20_000),
        });
        if (response.status === 404 || response.status === 403 || response.status === 410) throw Object.assign(new Error(`http ${response.status}`), { final: true });
        if (response.status === 429) {
          await sleep(Math.min(30, Number(response.headers?.get?.('retry-after')) || 8) * 1000);
          last = new Error('http 429');
          continue;
        }
        if (!response.ok) {
          last = new Error(`http ${response.status}`);
          continue;
        }
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length > 4_000_000) throw Object.assign(new Error('too large'), { final: true });
        return bytes;
      } catch (error) {
        if (error?.final) throw error;
        last = error instanceof Error ? error : new Error(String(error));
        await sleep(600 * (attempt + 1));
      }
    }
    throw last;
  }

  function keep(cid, team, source, remote, prepared, extra = {}) {
    const hash = createHash('sha1').update(prepared.png).digest('hex').slice(0, 10);
    const target = join(imgDir, `${cid}.png`);
    const tmp = `${target}.tmp`;
    writeFileSync(tmp, prepared.png);
    renameSync(tmp, target);
    index.teams[cid] = {
      name: team.name || index.teams[cid]?.name || '',
      country: team.country || '',
      competition: team.competition || '',
      source,
      remote: String(remote || '').slice(0, 400),
      hash,
      size: prepared.metrics?.width || 0,
      at: new Date(now()).toISOString(),
      ...extra,
    };
    delete index.misses[cid];
    stats.resolved += 1;
    stats.bySource[source] = (stats.bySource[source] || 0) + 1;
    saveSoon();
    return urlFor(cid);
  }

  async function tryLayer(cid, team, source, url, reasons, pace) {
    if (!url) return '';
    try {
      if (pace) await pace();
      const bytes = await download(url);
      const prepared = prepareCrest(bytes);
      if (!prepared.ok) {
        reasons.push(`${source}: ${prepared.reason}`);
        return '';
      }
      return keep(cid, team, source, url, prepared);
    } catch (error) {
      reasons.push(`${source}: ${error instanceof Error ? error.message : 'failed'}`);
      return '';
    }
  }

  /**
   * Resolve one team. stage 'fast' tries only the override, Sportradar and the
   * bundled catalogue; 'slow' only the name searches; 'all' (default) both.
   * Returns the crest URL, '' for a miss, or null when the slow stage is still due.
   */
  async function resolveTeam(team, { stage = 'all' } = {}) {
    const cid = competitorId(team.id);
    if (!cid || !team.name) return '';
    const reasons = [];
    const context = { area: team.country || '', competition: team.competition || '' };
    if (Object.keys(deps.memory).length > 4000) deps.memory = {};
    const override = index.overrides[cid]?.url || legacyOverride(team.name);
    let url = '';
    if (stage !== 'slow') {
      if (override && override !== 'upload') url = await tryLayer(cid, team, 'override', override, reasons, paceImage);
      if (!url) url = await tryLayer(cid, team, 'sportradar', `${SPORTRADAR}${cid}.png`, reasons, paceRadar);
      if (!url) url = await tryLayer(cid, team, 'catalogue', legacyPath(team.name), reasons);
      if (url) return url;
      if (stage === 'fast') {
        slowQueue.push({ ...team, id: cid, reasons });
        return null;
      }
    } else {
      const earlier = Array.isArray(team.reasons) ? team.reasons : [];
      // A network blip on the fast pass gets one more Sportradar try here.
      const radar = earlier.find((reason) => reason.startsWith('sportradar:'));
      if (radar && TRANSIENT.test(radar)) {
        url = await tryLayer(cid, team, 'sportradar', `${SPORTRADAR}${cid}.png`, reasons, paceRadar);
        if (url) return url;
        reasons.push(...earlier.filter((reason) => !reason.startsWith('sportradar:')));
      } else {
        reasons.push(...earlier);
      }
    }
    if (!url) {
      let found = null;
      try {
        found = await sportsDb(team.name, context, deps);
      } catch (error) {
        reasons.push(`thesportsdb: ${error instanceof Error ? error.message : 'failed'}`);
      }
      if (found?.url) url = await tryLayer(cid, team, 'thesportsdb', found.url, reasons, paceImage);
      else if (found === null) reasons.push('thesportsdb: no confident match');
    }
    if (!url) {
      let found = null;
      try {
        found = await wikidata(team.name, context, deps);
      } catch (error) {
        reasons.push(`wikidata: ${error instanceof Error ? error.message : 'failed'}`);
      }
      if (found?.url) url = await tryLayer(cid, team, 'wikidata', found.url, reasons, paceImage);
      else if (found === null) reasons.push('wikidata: no confident match');
    }
    if (!url && isNationalSide(team.name, context)) {
      url = await tryLayer(cid, team, 'flag', flagUrl(team.name) || '', reasons);
    }
    if (url) return url;
    const prior = index.misses[cid];
    const tries = (prior?.tries || 0) + 1;
    index.misses[cid] = {
      name: team.name,
      country: team.country || '',
      competition: team.competition || '',
      tries,
      lastTry: new Date(now()).toISOString(),
      nextAt: now() + Math.min(7 * DAY, 6 * HOUR * 2 ** (tries - 1)),
      reasons: reasons.slice(0, 6),
    };
    stats.missed += 1;
    saveSoon();
    return '';
  }

  function due(cid) {
    if (index.teams[cid]) return false;
    const miss = index.misses[cid];
    return !miss || !(miss.nextAt > now());
  }

  function enqueue(team, { front = false } = {}) {
    const cid = competitorId(team.id);
    if (!cid || !team.name || queued.has(cid)) return false;
    queued.add(cid);
    if (front) queue.unshift({ ...team, id: cid });
    else queue.push({ ...team, id: cid });
    pump();
    return true;
  }

  // Up to three workers share the paced fast pass (Sportradar at most ~4/s);
  // the slow name searches run one at a time behind them.
  const FAST_WORKERS = options.fastWorkers ?? 3;
  const active = new Set();
  let slowBusy = false;

  async function work() {
    for (;;) {
      let team;
      let fast = false;
      if (queue.length) {
        team = queue.shift();
        fast = true;
      } else if (slowQueue.length && !slowBusy) {
        team = slowQueue.shift();
        slowBusy = true;
      } else {
        return;
      }
      let pending = false;
      try {
        if (due(team.id) || team.force) pending = (await resolveTeam(team, { stage: fast ? 'fast' : 'slow' })) === null;
      } catch (error) {
        log(`resolve ${team.id} failed: ${error instanceof Error ? error.message : error}`);
      } finally {
        if (!fast) slowBusy = false;
        if (!pending) queued.delete(team.id);
      }
    }
  }

  function pump() {
    while (active.size < FAST_WORKERS && (queue.length || (slowQueue.length && !slowBusy && active.size === 0))) {
      const job = work().finally(() => {
        active.delete(job);
        if (queue.length || slowQueue.length) pump();
      });
      active.add(job);
    }
  }

  async function idle() {
    while (active.size) await Promise.all([...active]);
  }

  function teamsFrom(events, fromMs, toMs) {
    const rows = [];
    const seen = new Set();
    const sorted = [...(events || [])]
      .filter((event) => {
        const kick = Date.parse(event?.kickoff || '');
        return Number.isFinite(kick) && kick >= fromMs && kick <= toMs;
      })
      .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
    for (const event of sorted) {
      for (const side of ['home', 'away']) {
        const name = event[side];
        const cid = competitorId(event[`${side}Id`]);
        const key = cid || `name:${name}`;
        if (!name || seen.has(key)) continue;
        seen.add(key);
        rows.push({ id: cid, name, country: event.country || '', competition: event.tournament || '', tier: teamTier(name, event.country, event.tournament) });
      }
    }
    return rows;
  }

  function remember(events) {
    if (Array.isArray(events) && events.length) lastEvents = events;
  }

  /** Queue every team playing in the next `days` days, soonest first. */
  function prewarm(events, { days = 7 } = {}) {
    remember(events);
    const start = now() - 3 * HOUR;
    let added = 0;
    for (const team of teamsFrom(events, start, now() + days * DAY)) {
      if (team.id && due(team.id) && enqueue(team)) added += 1;
    }
    if (added) log(`queued ${added} teams for the next ${days} days`);
    return added;
  }

  function coverage({ hours = 48, events } = {}) {
    const rows = teamsFrom(events || lastEvents, now() - 3 * HOUR, now() + hours * HOUR);
    const tiers = { top: { teams: 0, withCrest: 0 }, other: { teams: 0, withCrest: 0 }, youth: { teams: 0, withCrest: 0 }, all: { teams: 0, withCrest: 0 } };
    const missing = [];
    for (const row of rows) {
      const has = Boolean(crestFor(row.id, row.name));
      for (const key of [row.tier, 'all']) {
        tiers[key].teams += 1;
        if (has) tiers[key].withCrest += 1;
      }
      if (!has) {
        const miss = row.id ? index.misses[row.id] : null;
        missing.push({ ...row, tries: miss?.tries || 0, lastTry: miss?.lastTry || null, reasons: miss?.reasons || (row.id ? ['not tried yet'] : ['no team id in the feed']) });
      }
    }
    for (const tier of Object.values(tiers)) tier.pct = tier.teams ? Number(((100 * tier.withCrest) / tier.teams).toFixed(1)) : null;
    const order = { top: 0, other: 1, youth: 2 };
    missing.sort((a, b) => order[a.tier] - order[b.tier] || a.name.localeCompare(b.name));
    return { hours, tiers, missing, stored: Object.keys(index.teams).length, misses: Object.keys(index.misses).length, queue: queue.length + slowQueue.length, ready: rows.length > 0 };
  }

  /** Papa Guardian auto-fix: retry this window's misses now (at most every 30 min). */
  function healMisses({ hours = 48, force = false } = {}) {
    if (!force && now() - lastHealAt < 30 * 60_000) return 0;
    lastHealAt = now();
    let added = 0;
    for (const row of coverage({ hours }).missing) {
      if (!row.id) continue;
      if (!force && index.misses[row.id]?.tries >= 6) continue;
      if (enqueue({ ...row, force: true }, { front: row.tier === 'top' })) added += 1;
    }
    return added;
  }

  async function setOverride(rawId, { url = '', bytes = null, name = '', force = false } = {}) {
    const cid = competitorId(rawId);
    if (!cid) return { error: 'Use a team id like sr:competitor:38.' };
    let data = bytes;
    try {
      if (!data) {
        if (!/^https:\/\//i.test(url)) return { error: 'Give an https image link or upload a file.' };
        data = await download(url);
      }
    } catch (error) {
      return { error: `Could not fetch that image (${error instanceof Error ? error.message : 'failed'}).` };
    }
    const prepared = prepareCrest(data, { force });
    if (!prepared.ok) return { error: `Image check failed: ${prepared.reason}. Tick "skip checks" to keep it anyway.` };
    const team = { name: name || index.teams[cid]?.name || index.misses[cid]?.name || '' , country: index.misses[cid]?.country || index.teams[cid]?.country || '', competition: index.misses[cid]?.competition || index.teams[cid]?.competition || '' };
    index.overrides[cid] = { url: bytes ? 'upload' : url, at: new Date(now()).toISOString() };
    const crest = keep(cid, team, 'override', bytes ? 'upload' : url, prepared);
    saveNow();
    return { ok: true, id: cid, url: crest };
  }

  function clearOverride(rawId) {
    const cid = competitorId(rawId);
    if (!cid || !index.overrides[cid]) return false;
    delete index.overrides[cid];
    if (index.teams[cid]?.source === 'override') delete index.teams[cid];
    saveNow();
    enqueue({ id: cid, name: index.misses[cid]?.name || '', force: true }, { front: true });
    return true;
  }

  function imagePath(rawId) {
    const cid = competitorId(rawId);
    if (!cid) return '';
    const file = join(imgDir, `${cid}.png`);
    try {
      return statSync(file).isFile() ? file : '';
    } catch {
      return '';
    }
  }

  function publicList() {
    const crests = {};
    for (const cid of Object.keys(index.teams)) crests[cid] = urlFor(cid);
    return { generatedAt: new Date(now()).toISOString(), count: Object.keys(crests).length, crests };
  }

  function adminView() {
    const cover = coverage({ hours: 48 });
    const overrides = Object.entries(index.overrides).map(([id, row]) => ({ id, ...row, name: index.teams[id]?.name || '', crest: urlFor(id) }));
    return { coverage48: cover, coverage7d: coverage({ hours: 168 }).tiers, overrides, stats, queue: queue.length + slowQueue.length };
  }

  return {
    dir,
    competitorId,
    crestFor,
    urlFor,
    resolveTeam,
    enqueue,
    prewarm,
    remember,
    coverage,
    healMisses,
    setOverride,
    clearOverride,
    imagePath,
    publicList,
    adminView,
    idle,
    flush: saveNow,
    index,
  };
}

let shared = null;

export function crestStore() {
  if (!shared) shared = createCrestStore();
  return shared;
}

export function setCrestStore(store) {
  shared = store;
}

/** 02:00 Africa/Accra (UTC) every night, plus once shortly after boot. */
export function scheduleNightly(run, { bootDelayMs = 30_000, hour = 2 } = {}) {
  const boot = setTimeout(run, bootDelayMs);
  boot.unref?.();
  function next() {
    const at = new Date();
    at.setUTCHours(hour, 0, 0, 0);
    if (at.getTime() <= Date.now()) at.setUTCDate(at.getUTCDate() + 1);
    const timer = setTimeout(async () => {
      try {
        await run();
      } finally {
        next();
      }
    }, at.getTime() - Date.now());
    timer.unref?.();
  }
  next();
}
