/**
 * Operator snapshot. Counts and real bookmaker codes only.
 * Device tokens and addresses never leave this module.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { coverage, loadCatalog } from './crestResolve.mjs';
import { getCachedEvents, getEngineSchedule, getEngineState, INTERVAL_MS } from './engine.mjs';
import { cleanCountry } from './geo.mjs';
import { MIN_ODDS } from './occurrence.mjs';
import { DESKS, validPart } from './quality.mjs';

const RELEASES_URL = 'https://api.github.com/repos/OriginalSolution/Betspapa/releases?per_page=100';
const RELEASE_TTL = 10 * 60 * 1000;
const NAMES = {
  sportybet: 'SportyBet',
  footballcom: 'Football.com',
  msport: 'MSport',
  betika: 'Betika',
  betpawa: 'BetPawa',
};
const LOGOS = {
  sportybet: '/bookies/sportybet.png',
  footballcom: '/bookies/football.png',
  msport: '/bookies/msport.png',
  betika: '/bookies/betika.png',
  betpawa: '/bookies/betpawa.png',
};

let releaseCache = { expires: 0, value: null };
let crestCache = { expires: 0, value: null };

export function summarizeReleases(body) {
  const rows = [];
  for (const release of Array.isArray(body) ? body : []) {
    const assets = (release?.assets || []).filter((asset) => /\.apk$/i.test(String(asset?.name || '')));
    if (!assets.length) continue;
    const downloads = assets.reduce((sum, asset) => sum + (Number(asset.download_count) || 0), 0);
    rows.push({
      version: String(release.tag_name || release.name || 'release'),
      downloads,
      publishedAt: release.published_at || null,
    });
  }
  const total = rows.reduce((sum, row) => sum + row.downloads, 0);
  return { total, releases: rows.slice().reverse(), error: null };
}

export async function loadGithubReleases(fetchImpl = fetch, now = Date.now()) {
  if (releaseCache.value && releaseCache.expires > now) return releaseCache.value;
  try {
    const response = await fetchImpl(RELEASES_URL, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Betspapa-admin' },
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) throw new Error(`GitHub releases returned ${response.status}`);
    const value = summarizeReleases(await response.json());
    releaseCache = { expires: now + RELEASE_TTL, value };
    return value;
  } catch (error) {
    const value = { total: null, releases: [], error: error instanceof Error ? error.message : 'GitHub releases unavailable' };
    releaseCache = { expires: now + 60_000, value };
    return value;
  }
}

export function deviceSnapshot(devices, now = Date.now()) {
  const list = Array.isArray(devices) ? devices : [];
  const activeAfter = now - 15 * 60 * 1000;
  const countries = new Map();
  const versions = new Map();
  let ghana = 0;
  let active = 0;
  for (const device of list) {
    const code = cleanCountry(device?.country) || 'Unknown';
    countries.set(code, (countries.get(code) || 0) + 1);
    if (code === 'GH') ghana += 1;
    const version = typeof device?.appVersion === 'string' && device.appVersion ? device.appVersion : 'Unknown';
    versions.set(version, (versions.get(version) || 0) + 1);
    const seen = Date.parse(device?.lastSeenAt || device?.updatedAt || '');
    if (Number.isFinite(seen) && seen >= activeAfter) active += 1;
  }
  const latest = list[0];
  const token = String(latest?.token || '');
  return {
    devices: list.length,
    activeNow: active,
    ghana,
    countries: [...countries.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([code, count]) => ({ code, count })),
    versions: [...versions.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([version, count]) => ({ version, count })),
    latestTail: token.length >= 6 ? token.slice(-6) : null,
    latestSeen: latest?.lastSeenAt || latest?.updatedAt || null,
  };
}

export function deskRows(books, masterLegs = 0) {
  return DESKS.map((id) => {
    const book = books?.[id] || {};
    const parts = (book.parts || []).filter((part) => validPart(id, part));
    const dropped = Array.isArray(book.dropped) ? book.dropped.length : 0;
    const codes = parts.map((part) => part.code);
    const legsKnown = parts.length > 0 && parts.every((part) => Number(part.legs) > 0);
    const covered = parts.reduce((sum, part) => sum + (Number(part.legs) || 0), 0);
    const short = legsKnown && masterLegs > 0 && covered < masterLegs;
    let status = 'Missing';
    if (codes.length) status = dropped > 0 || codes.length > 1 || short ? 'Partial' : 'Ready';
    return {
      id,
      name: NAMES[id],
      logo: LOGOS[id],
      status,
      code: codes[0] || null,
      codes,
      legs: legsKnown ? covered : null,
    };
  });
}

export function droppedUnderFloor(state) {
  const notes = Array.isArray(state?.cycleNotes) ? state.cycleNotes : null;
  if (!notes) return null;
  const line = notes.find((item) => /no price at or above 1\.20/.test(String(item)));
  if (!line) return 0;
  const match = String(line).match(/(\d+)\s+lines were at 80%/);
  return match ? Number(match[1]) : 0;
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export function crestSummary(events, now = Date.now()) {
  if (!crestCache.value || crestCache.expires <= now) {
    let catalog = { byKey: {}, byId: {}, teams: [] };
    try {
      catalog = loadCatalog();
    } catch {
      catalog = { byKey: {}, byId: {}, teams: [] };
    }
    crestCache = {
      expires: now + 60_000,
      value: {
        catalog,
        stored: readJson(join(process.cwd(), 'public', 'crests', 'coverage.json')),
      },
    };
  }
  const { catalog, stored } = crestCache.value;
  const list = Array.isArray(events) ? events : [];
  const live = list.length ? coverage(list, catalog) : null;
  const catalogueMissing = Number.isFinite(Number(stored?.missing)) ? Number(stored.missing) : null;
  return {
    cataloguePercent: Number.isFinite(Number(stored?.after?.percent)) ? Number(stored.after.percent) : null,
    catalogueMissing,
    catalogueTeams: Array.isArray(catalog.teams) ? catalog.teams.length : 0,
    upcomingBothPercent: live ? live.after.percent : null,
    upcomingFixtures: live ? live.fixtures : 0,
    missingClubs: live ? live.missingTeams : catalogueMissing,
    missingLive: Boolean(live),
    generatedAt: stored?.generatedAt || catalog.generatedAt || null,
    live: Boolean(live),
  };
}

function trendRows(trends) {
  return (Array.isArray(trends) ? trends : [])
    .filter((trend) => trend && trend.id !== 'master' && (trend.legCount || trend.legs?.length))
    .map((trend) => ({
      id: String(trend.id || ''),
      label: String(trend.label || trend.name || 'Trend'),
      legCount: Number(trend.legCount) || 0,
      sameAsMaster: Boolean(trend.sameAsMaster),
      desks: trend.sameAsMaster ? [] : deskRows(trend.books, trend.legCount || 0).filter((desk) => desk.code),
    }));
}

function stripSecrets(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(stripSecrets);
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === 'token' || key === 'ip' || key === 'address' || key === 'authorization' || key === 'private_key') continue;
    out[key] = stripSecrets(item);
  }
  return out;
}

export function buildOverview({ state = {}, schedule = {}, devices = [], alerts = [], releases = {}, crests = {}, now = Date.now() } = {}) {
  const ran = Boolean(state.updatedAt);
  const installs = deviceSnapshot(devices, now);
  const masterLegs = ran ? Number(state.master?.legCount ?? state.legCount ?? 0) : null;
  const body = {
    generatedAt: new Date(now).toISOString(),
    zone: 'Africa/Accra',
    status: {
      engine: state.feedError ? 'ERROR' : 'OPEN',
      engineError: state.feedError || null,
      fcm: Boolean(state.fcm),
      feed: Number(state.eventCount) || 0,
      lastCycle: state.updatedAt || null,
      nextRunAt: schedule.nextRunAt ? new Date(schedule.nextRunAt).toISOString() : null,
      oddsFloor: MIN_ODDS,
      cycleMinutes: Math.round((schedule.intervalMs || INTERVAL_MS) / 60_000),
      running: Boolean(schedule.running),
    },
    installs: {
      downloads: releases.total ?? null,
      downloadsError: releases.error || null,
      devices: installs.devices,
      activeNow: installs.activeNow,
      ghana: installs.ghana,
      releases: Array.isArray(releases.releases) ? releases.releases : [],
      countries: installs.countries,
      versions: installs.versions,
    },
    cycle: {
      lastFinished: state.updatedAt || null,
      masterLegs,
      nextRunAt: schedule.nextRunAt ? new Date(schedule.nextRunAt).toISOString() : null,
      running: Boolean(schedule.running),
    },
    codes: deskRows(state.books, Number(state.master?.legCount ?? state.legCount ?? 0)),
    trends: {
      markets: ran ? (state.trends || []).length : null,
      masterLegs,
      droppedUnderFloor: droppedUnderFloor(state),
    },
    trendCodes: trendRows(state.trends),
    alerts: (Array.isArray(alerts) ? alerts : []).slice(0, 30).map((row) => ({
      type: String(row.type || ''),
      match: String(row.match || ''),
      time: row.time || null,
    })),
    crests: {
      ...crests,
      oddsFloor: MIN_ODDS,
      cycleMinutes: Math.round(INTERVAL_MS / 60_000),
      desks: DESKS.map((id) => NAMES[id]),
    },
    push: {
      fcm: Boolean(state.fcm),
      devices: installs.devices,
      latestTail: installs.latestTail,
      latestSeen: installs.latestSeen,
    },
  };
  return stripSecrets(body);
}

export async function loadOverview({ devices = [], alerts = [], fcm = false, fetchImpl } = {}) {
  const state = { ...getEngineState(), fcm };
  const schedule = getEngineSchedule();
  const [github, crests] = await Promise.all([
    loadGithubReleases(fetchImpl),
    Promise.resolve(crestSummary(getCachedEvents())),
  ]);
  return buildOverview({ state, schedule, devices, alerts, releases: github, crests });
}
