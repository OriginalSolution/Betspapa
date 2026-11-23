/** Upcoming fixtures, league tables and last-10 form. No share booking. */
import { BUSY_FIXTURE_THRESHOLD, BUSY_LEAGUE_SOURCE } from './bankerConfig.mjs';
import { defenceFor, tablePositions } from './bankerDefence.mjs';
import { canon, isCupLeague, isSenior, leagueKey } from './bankerFilters.mjs';
import { find1up, find1x2, find2up, findAhMinus1, findO25, findTeamO15, isOpenStatus } from './bankerMarkets.mjs';
import { SHIELD_GA_RATIO, SHIELD_MIN_VENUE_GAMES } from './bankerConfig.mjs';

const UPCOMING = 'https://www.sportybet.com/api/gh/factsCenter/pcUpcomingEvents';
const EVENT = 'https://www.sportybet.com/api/gh/factsCenter/event';
const GISMO = 'https://stats.fn.sportradar.com/sportybet/en/Etc:UTC/gismo';

function quote(value) {
  return encodeURIComponent(String(value));
}

export async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function eventFields(event, tournament) {
  const category = event?.sport?.category || tournament?.sport?.category || {};
  const country = category.name || tournament?.categoryName || '';
  const league = tournament?.name || category?.tournament?.name || event?.tournamentName || '';
  const tournamentId = category?.tournament?.id || tournament?.id || event?.tournamentId || '';
  return { country, league, tournamentId: tournamentId ? String(tournamentId) : '' };
}

export function flattenUpcoming(body, tournamentId = '') {
  const data = body?.data || {};
  const events = [];
  for (const tournament of data.tournaments || []) {
    for (const event of tournament.events || []) {
      const fields = eventFields(event, tournament);
      events.push({ ...event, _country: fields.country, _league: fields.league, _tournamentId: tournamentId || fields.tournamentId });
    }
  }
  return { events, total: Number(data.totalNum) || 0 };
}

function upcomingUrl(page, size, tournamentId) {
  const markets = '1,16,18,19,20,60100,60200';
  let url = `${UPCOMING}?sportId=${quote('sr:sport:1')}&marketId=${markets}&pageSize=${size}&pageNum=${page}&option=1`;
  if (tournamentId) url += `&tournamentId=${quote(tournamentId)}`;
  return url;
}

export async function fetchUpcoming(request) {
  const byId = new Map();
  let total = 0;
  for (let page = 1; page <= 40; page += 1) {
    const body = await request('GET', upcomingUrl(page, 100));
    const pageRows = flattenUpcoming(body);
    total = pageRows.total || total;
    if (!pageRows.events.length) break;
    for (const event of pageRows.events) if (event.eventId) byId.set(event.eventId, event);
    if (page * 100 >= total) break;
  }
  const counts = new Map();
  for (const event of byId.values()) {
    if (!event._tournamentId) continue;
    counts.set(event._tournamentId, (counts.get(event._tournamentId) || 0) + 1);
  }
  let extra = 0;
  for (const [tournamentId, count] of counts) {
    if (count < 8) continue;
    const seen = new Set();
    for (let page = 1; page <= 40; page += 1) {
      const body = await request('GET', upcomingUrl(page, 10, tournamentId));
      const pageRows = flattenUpcoming(body, tournamentId);
      const fresh = pageRows.events.filter((event) => event.eventId && !seen.has(event.eventId));
      if (!fresh.length) break;
      for (const event of fresh) {
        seen.add(event.eventId);
        if (!byId.has(event.eventId)) extra += 1;
        byId.set(event.eventId, event);
      }
      if (seen.size >= pageRows.total) break;
    }
  }
  return { events: [...byId.values()], total, extra };
}

export function candidateFromEvent(event) {
  const ah = findAhMinus1(event);
  if (!ah) return null;
  const home = event.homeTeamName || '';
  const away = event.awayTeamName || '';
  const country = event._country || '';
  const league = event._league || '';
  const favId = ah.side === 'H' ? event.homeTeamId : event.awayTeamId;
  const one = find1x2(event, ah.side);
  return {
    eventId: String(event.eventId || ''),
    home,
    away,
    homeId: event.homeTeamId || '',
    awayId: event.awayTeamId || '',
    country,
    league,
    cup: isCupLeague(league),
    tournamentId: event._tournamentId || '',
    seasonId: event._seasonId || '',
    kickMs: Number(event.estimateStartTime) || 0,
    open: isOpenStatus(event.matchStatus || event.status),
    senior: isSenior(country, league, home, away),
    ah,
    favId,
    fav1x2: one ? one.price : null,
    up2: find2up(event, ah.side),
    up1: find1up(event, ah.side),
    o25: findO25(event),
    teamO15: findTeamO15(event, ah.side),
    hpos: null,
    apos: null,
    tableN: 0,
    defence: null,
    awayForm: null,
    weakScored: null,
    weakN: null,
    favScored2: null,
    capable: false,
    busy: false,
  };
}

export function gismo(path) {
  return `${GISMO}/${path}`;
}

export function formRows(payload, uid) {
  const data = payload?.doc?.[0]?.data || {};
  const tournaments = data.tournaments || {};
  const want = Number(String(uid || '').match(/(\d+)$/)?.[1]);
  if (!want) return [];
  const rows = [];
  for (const match of data.matches || []) {
    if (match.postponed || match.walkover || match.retired) continue;
    const tournament = tournaments[String(match._tid || '')] || {};
    if (tournament.friendly) continue;
    const result = match.result;
    if (result?.home == null || result?.away == null) continue;
    const homeUid = Number(match.teams?.home?.uid);
    const awayUid = Number(match.teams?.away?.uid);
    const venue = homeUid === want ? 'H' : awayUid === want ? 'A' : '';
    if (!venue) continue;
    const goals = venue === 'H' ? Number(result.home) : Number(result.away);
    const opp = venue === 'H' ? Number(result.away) : Number(result.home);
    rows.push({ venue, goals, opp });
  }
  return rows;
}

export function scoringOf(rows, n = 10) {
  const sample = rows.slice(0, n);
  return {
    n: sample.length,
    scored: sample.filter((row) => row.goals >= 1).length,
    scored2: sample.filter((row) => row.goals >= 2).length,
  };
}

export function awayOf(rows, n = 5) {
  const sample = rows.filter((row) => row.venue === 'A').slice(0, n);
  return {
    n: sample.length,
    wins: sample.filter((row) => row.goals > row.opp).length,
    scored: sample.filter((row) => row.goals >= 1).length,
  };
}

function numericId(value) {
  const found = String(value || '').match(/(\d+)$/);
  return found ? found[1] : '';
}

async function gismoGet(fetchImpl, path) {
  const response = await fetchImpl(gismo(path), {
    headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) return null;
  return response.json();
}

export function markBusy(candidates, coverage) {
  const open = candidates.filter((row) => row.open && row.senior);
  const byDay = new Map();
  for (const row of open) {
    if (!row.kickMs) continue;
    const day = new Date(row.kickMs).toISOString().slice(0, 10);
    byDay.set(day, (byDay.get(day) || 0) + 1);
  }
  for (const row of candidates) {
    const day = row.kickMs ? new Date(row.kickMs).toISOString().slice(0, 10) : '';
    row.busy = (byDay.get(day) || 0) >= BUSY_FIXTURE_THRESHOLD;
    if (BUSY_LEAGUE_SOURCE === 'sportradar-coverage' && coverage?.size) {
      row.capable = coverage.has(leagueKey(row.country, row.league));
    } else {
      row.capable = Boolean(row.seasonId);
    }
    row.capable = row.capable && row.senior && !/women|youth|srl|simulated/i.test(`${row.country} ${row.league}`);
  }
  return candidates;
}

export function coverageFromEvents(events) {
  const keys = new Set();
  for (const event of events || []) {
    const country = event.country || event._country || '';
    const league = event.tournament || event._league || '';
    if (!isSenior(country, league, event.home || event.homeTeamName || 'Home', event.away || event.awayTeamName || 'Away')) continue;
    const id = event.eventId || event.id || '';
    if (!String(id).includes('sr:match') && !event.seasonId && !event._seasonId) continue;
    const key = leagueKey(country, league);
    if (key !== '|') keys.add(key);
  }
  return keys;
}

/**
 * Candidates inside [fromMs, toMs). Confirms markets, tables and form.
 * coverage is the set of Sportradar leagues Betspapa already carries.
 */
export async function collectCandidates(request, fetchImpl, { fromMs, toMs, coverage }) {
  const upcoming = await fetchUpcoming(request);
  let rows = upcoming.events
    .map(candidateFromEvent)
    .filter((row) => row && row.kickMs >= fromMs && row.kickMs < toMs && row.open && row.senior && row.ah.price <= 2);
  const details = await mapPool(rows, 4, async (row) => {
    const body = await request('GET', `${EVENT}?eventId=${quote(row.eventId)}&productId=3`);
    const data = body?.bizCode === 10000 ? body.data : null;
    if (!data) return row;
    const refreshed = candidateFromEvent({ ...data, _country: row.country, _league: row.league, _tournamentId: row.tournamentId, estimateStartTime: row.kickMs, matchStatus: 'Not start' });
    if (!refreshed) return row;
    return {
      ...row,
      ah: refreshed.ah || row.ah,
      fav1x2: refreshed.fav1x2 ?? row.fav1x2,
      up2: refreshed.up2 || row.up2,
      up1: refreshed.up1 || row.up1,
      o25: refreshed.o25 || row.o25,
      teamO15: refreshed.teamO15 || row.teamO15,
    };
  });
  rows = details.filter(Boolean);
  const infoCache = new Map();
  await mapPool(rows, 4, async (row) => {
    const mid = numericId(row.eventId);
    if (!mid) return;
    if (!infoCache.has(mid)) infoCache.set(mid, gismoGet(fetchImpl, `match_info/${mid}`));
    const body = await infoCache.get(mid);
    const match = body?.doc?.[0]?.data?.match;
    if (!match) return;
    row.seasonId = String(match._seasonid || '');
    row.homeUid = match.teams?.home?.uid;
    row.awayUid = match.teams?.away?.uid;
  });
  markBusy(rows, coverage);
  const tables = new Map();
  const lastx = new Map();
  await mapPool(rows, 4, async (row) => {
    if (row.seasonId && !row.cup) {
      if (!tables.has(row.seasonId)) tables.set(row.seasonId, gismoGet(fetchImpl, `stats_season_tables/${row.seasonId}`));
      const table = await tables.get(row.seasonId);
      const positions = tablePositions(table, row.homeUid, row.awayUid);
      if (positions) {
        row.hpos = positions.hpos;
        row.apos = positions.apos;
        row.tableN = positions.n;
      }
      const favUid = row.ah.side === 'H' ? row.homeUid : row.awayUid;
      row.defence = defenceFor(table, favUid, row.ah.side, { minVenueGames: SHIELD_MIN_VENUE_GAMES, gaRatio: SHIELD_GA_RATIO });
    }
    const weakUid = row.ah.side === 'H' ? row.awayUid : row.homeUid;
    const favUid = row.ah.side === 'H' ? row.homeUid : row.awayUid;
    const load = async (uid) => {
      const id = numericId(uid);
      if (!id) return [];
      if (!lastx.has(id)) lastx.set(id, gismoGet(fetchImpl, `stats_team_lastx/${id}/30`));
      return formRows(await lastx.get(id), id);
    };
    const weakRows = await load(weakUid);
    const favRows = await load(favUid);
    const weak = scoringOf(weakRows, 10);
    const fav = scoringOf(favRows, 10);
    row.weakScored = weak.n ? weak.scored : null;
    row.weakN = weak.n;
    row.favScored2 = fav.n ? fav.scored2 : null;
    if (row.ah.side === 'A') row.awayForm = awayOf(favRows, 5);
  });
  return rows.map((row) => {
    const { homeUid, awayUid, ...rest } = row;
    void homeUid;
    void awayUid;
    void canon;
    return rest;
  });
}
