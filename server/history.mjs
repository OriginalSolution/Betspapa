/** Recent real results for occurrence. Sportradar's public last-X feed, cached in memory. */
import { WINDOW } from './occurrence.mjs';

const LAST_URL = (uid) => `https://stats.fn.sportradar.com/common/en/Europe:Berlin/gismo/stats_team_lastx/${uid}/30`;
const STATS_URL = (id) => `https://stats.fn.sportradar.com/common/en/Europe:Berlin/gismo/match_detailsextended/${id}`;
const TEAM_TTL_MS = 30 * 60 * 1000;
const VIRTUAL = /\bSRL\b|simulated|virtual/i;

async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function getJson(url, fetchImpl) {
  const response = await fetchImpl(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Stats returned ${response.status}`);
  return response.json();
}

export function rowFromMatch(match, teamId) {
  if (!match || match.canceled || match.postponed || match.walkover) return null;
  const home = match.teams?.home;
  const away = match.teams?.away;
  if (!home || !away || home.virtual || away.virtual) return null;
  if (VIRTUAL.test(`${home.name || ''} ${away.name || ''}`)) return null;
  const uid = Number(teamId);
  const homeUid = Number(home.uid ?? home._id);
  const awayUid = Number(away.uid ?? away._id);
  const teamIsHome = homeUid === uid;
  if (!teamIsHome && awayUid !== uid) return null;
  const ftHome = Number(match.result?.home ?? match.periods?.ft?.home);
  const ftAway = Number(match.result?.away ?? match.periods?.ft?.away);
  if (!Number.isFinite(ftHome) || !Number.isFinite(ftAway)) return null;
  const htHome = Number(match.periods?.p1?.home);
  const htAway = Number(match.periods?.p1?.away);
  const id = Number(match._id);
  if (!Number.isFinite(id)) return null;
  return {
    matchId: id,
    uts: Number(match.time?.uts) || 0,
    teamIsHome,
    neutral: Boolean(match.neutralground),
    ftHome,
    ftAway,
    htHome: Number.isFinite(htHome) ? htHome : null,
    htAway: Number.isFinite(htAway) ? htAway : null,
    cornersHome: null,
    cornersAway: null,
    cardsHome: null,
    cardsAway: null,
  };
}

export function rowsFromLastX(payload, teamId) {
  const matches = payload?.doc?.[0]?.data?.matches;
  if (!Array.isArray(matches)) return [];
  return matches
    .map((match) => rowFromMatch(match, teamId))
    .filter(Boolean)
    .sort((a, b) => b.uts - a.uts || b.matchId - a.matchId);
}

function count(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function pair(value) {
  const home = count(value?.home);
  const away = count(value?.away);
  if (home == null || away == null) return null;
  return { home, away };
}

/** Corners are stat 124. Cards are yellow + second yellow + red. */
export function parseMatchStats(payload) {
  const values = payload?.doc?.[0]?.data?.values;
  if (!values || typeof values !== 'object') return null;
  const corners = pair(values['124']?.value);
  const yellow = pair(values['40']?.value);
  const second = pair(values['45']?.value);
  const red = pair(values['50']?.value);
  const cards = yellow && second && red ? { home: yellow.home + second.home + red.home, away: yellow.away + second.away + red.away } : null;
  if (!corners && !cards) return null;
  return {
    cornersHome: corners?.home ?? null,
    cornersAway: corners?.away ?? null,
    cardsHome: cards?.home ?? null,
    cardsAway: cards?.away ?? null,
  };
}

export function windowMatchIds(rows) {
  const ids = new Set();
  const take = (list) => {
    for (const row of list.slice(0, WINDOW)) if (Number.isFinite(row.matchId)) ids.add(row.matchId);
  };
  take(rows);
  take(rows.filter((row) => row.teamIsHome && !row.neutral));
  take(rows.filter((row) => !row.teamIsHome && !row.neutral));
  return [...ids];
}

export async function loadHistories(teamIds, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const cache = options.cache || { teams: new Map(), stats: new Map() };
  const log = options.log || (() => {});
  const now = options.now || Date.now();
  const ids = [...new Set((teamIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id)))];
  let teamErrors = 0;
  await pool(ids, 8, async (uid) => {
    const cached = cache.teams.get(uid);
    if (cached && now - cached.at < TEAM_TTL_MS) return;
    try {
      cache.teams.set(uid, { at: now, rows: rowsFromLastX(await getJson(LAST_URL(uid), fetchImpl), uid) });
    } catch (error) {
      teamErrors += 1;
      log('error', `Team ${uid} history failed: ${error instanceof Error ? error.message : error}`);
    }
  });
  const histories = new Map(ids.map((uid) => [uid, (cache.teams.get(uid)?.rows || []).map((row) => ({ ...row }))]));
  const needed = new Set();
  for (const rows of histories.values()) for (const id of windowMatchIds(rows)) needed.add(id);
  const missing = [...needed].filter((id) => !cache.stats.has(id));
  const deadline = Date.now() + (options.statsBudgetMs ?? 120_000);
  let statsDeferred = 0;
  await pool(missing, 12, async (matchId) => {
    if (Date.now() > deadline) {
      statsDeferred += 1;
      return;
    }
    try {
      const stats = parseMatchStats(await getJson(STATS_URL(matchId), fetchImpl));
      cache.stats.set(matchId, stats);
    } catch {
      statsDeferred += 1;
    }
  });
  let statsMissing = 0;
  for (const id of needed) {
    if (!cache.stats.has(id)) continue;
    const stats = cache.stats.get(id);
    if (!stats || (stats.cornersHome == null && stats.cardsHome == null)) {
      statsMissing += 1;
      continue;
    }
    for (const rows of histories.values()) {
      for (const row of rows) if (row.matchId === id) Object.assign(row, stats);
    }
  }
  return { histories, teamErrors, statsMissing, statsDeferred, teams: ids.length };
}
