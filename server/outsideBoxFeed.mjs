/** Upcoming Match Shots Outside Box lines, plus last-10 totals from the timeline. No share booking. */
import { mapPool } from './bankerFeed.mjs';
import { isSenior } from './bankerFilters.mjs';
import { isOpenStatus } from './bankerMarkets.mjs';
import { OUTSIDE_MARKET, competitiveMatchIds, matchOutsideTotal, pickOutsideLine } from './outsideBox.mjs';

const UPCOMING = 'https://www.sportybet.com/api/gh/factsCenter/pcUpcomingEvents';
const GISMO = 'https://stats.fn.sportradar.com/sportybet/en/Etc:UTC/gismo';

function quote(value) {
  return encodeURIComponent(String(value));
}

function numericId(value) {
  const found = String(value || '').match(/(\d+)$/);
  return found ? found[1] : '';
}

async function gismoGet(fetchImpl, path) {
  const response = await fetchImpl(`${GISMO}/${path}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) return null;
  return response.json();
}

function linesOf(event) {
  const lines = [];
  for (const market of event?.markets || []) {
    if (String(market?.id) !== OUTSIDE_MARKET) continue;
    for (const outcome of market.outcomes || []) {
      if (outcome?.isActive === 0) continue;
      const odds = Number(outcome?.odds);
      const line = Number(String(outcome?.desc || '').replace('+', ''));
      if (!(odds > 1) || !Number.isFinite(line)) continue;
      lines.push({
        line,
        odds,
        outcomeId: String(outcome.id || ''),
        label: `${line}+ outside box`,
      });
    }
  }
  return lines;
}

export async function fetchOutsideEvents(request) {
  const events = [];
  for (let page = 1; page <= 40; page += 1) {
    const body = await request('GET', `${UPCOMING}?sportId=${quote('sr:sport:1')}&marketId=${OUTSIDE_MARKET}&pageSize=100&pageNum=${page}&option=1`);
    const pageEvents = [];
    for (const tournament of body?.data?.tournaments || []) {
      const country = tournament?.categoryName || tournament?.sport?.category?.name || '';
      const league = tournament?.name || '';
      for (const event of tournament.events || []) {
        pageEvents.push({ ...event, _country: country, _league: league, _tournamentId: tournament?.id ? String(tournament.id) : '' });
      }
    }
    if (!pageEvents.length) break;
    events.push(...pageEvents);
  }
  const seen = new Set();
  return events.filter((event) => {
    if (!event?.eventId || seen.has(event.eventId)) return false;
    seen.add(event.eventId);
    return true;
  });
}

function sampleOf(ids, totals) {
  const kept = [];
  for (const id of ids) {
    const row = totals.get(id);
    if (row?.valid) kept.push(row.total);
  }
  return { n: kept.length, totals: kept };
}

/**
 * Open fixtures with a Match Shots Outside Box price and a line both teams
 * hit in at least 8 of 10. Matches whose shot positions are missing are not
 * part of a team's sample.
 */
export async function collectOutsideBox(request, fetchImpl, { fromMs, toMs }) {
  const upcoming = await fetchOutsideEvents(request);
  const rows = [];
  for (const event of upcoming) {
    const kickMs = Number(event.estimateStartTime) || 0;
    if (kickMs < fromMs || kickMs >= toMs) continue;
    if (!isOpenStatus(event.matchStatus || event.status)) continue;
    const home = event.homeTeamName || '';
    const away = event.awayTeamName || '';
    if (!isSenior(event._country, event._league, home, away)) continue;
    const lines = linesOf(event);
    if (!lines.length || !event.eventId) continue;
    rows.push({
      eventId: String(event.eventId),
      home,
      away,
      homeId: event.homeTeamId || '',
      awayId: event.awayTeamId || '',
      country: event._country || '',
      league: event._league || '',
      tournamentId: event._tournamentId || '',
      kickMs,
      lines,
    });
  }
  const lastx = new Map();
  const timelines = new Map();
  const loadIds = async (teamId) => {
    const id = numericId(teamId);
    if (!id) return [];
    if (!lastx.has(id)) lastx.set(id, gismoGet(fetchImpl, `stats_team_lastx/${id}/30`));
    return competitiveMatchIds(await lastx.get(id));
  };
  const loadTotal = async (matchId) => {
    if (!timelines.has(matchId)) {
      timelines.set(matchId, gismoGet(fetchImpl, `match_timeline/${matchId}`).then((body) => {
        const events = body?.doc?.[0]?.data?.events;
        return matchOutsideTotal(events);
      }));
    }
    return timelines.get(matchId);
  };
  await mapPool(rows, 4, async (row) => {
    const homeIds = await loadIds(row.homeId);
    const awayIds = await loadIds(row.awayId);
    const totals = new Map();
    for (const id of new Set([...homeIds, ...awayIds])) totals.set(id, await loadTotal(id));
    row.pick = pickOutsideLine(row.lines, sampleOf(homeIds, totals), sampleOf(awayIds, totals));
  });
  return rows.filter((row) => row.pick);
}
