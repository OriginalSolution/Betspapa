/**
 * Real upcoming football fixtures for Betspapa, read from the public no-login
 * Ghana catalogue. This replaces the legacy API that used to answer
 * /api/sportybet/upcoming on api.betspapa.com. No demo or simulated events are
 * ever produced: if the catalogue is unreachable the caller gets an error.
 */

const BASE = 'https://www.sportybet.com/api/gh';
const PAGE_SIZE = 100;
const MAX_PAGES = 20;
const CACHE_TTL_MS = 5 * 60_000;
const STALE_MS = 60 * 60_000;
export const CATALOGUE_MARKETS = '1,10,11,18,19,20,29,31,32,60,68';
const EXTRA_MARKETS = '166,800063';

const cache = { loadedAt: 0, events: [], pending: null };

function price(outcome) {
  if (outcome?.isActive === 0 || outcome?.isActive === false) return null;
  const value = Number(outcome?.odds);
  return Number.isFinite(value) && value > 1 ? value : null;
}

function lineSuffix(specifier) {
  const line = String(specifier || '').match(/total=([0-9.]+)/i)?.[1];
  if (!line || !line.includes('.')) return null;
  return line.replace('.', '');
}

function writeTotal(odds, prefix, specifier, outcome) {
  const suffix = lineSuffix(specifier);
  const value = price(outcome);
  if (!suffix || !value) return;
  const over = String(outcome.id) === '12' || /^over/i.test(String(outcome.desc || ''));
  odds[`${prefix ? `${prefix}-` : ''}${over ? 'over' : 'under'}-${suffix}`] = value;
}

/** Turn one catalogue event's markets into the odds keys qualify.mjs reads. */
export function parseOdds(markets = []) {
  const odds = {};
  for (const market of markets || []) {
    const id = String(market?.id);
    for (const outcome of market?.outcomes || []) {
      const value = price(outcome);
      if (!value) continue;
      const desc = String(outcome.desc || '').toLowerCase();
      const oid = String(outcome.id);
      if (id === '1') {
        if (oid === '1' || desc === 'home') odds.home = value;
        if (oid === '2' || desc === 'draw') odds.draw = value;
        if (oid === '3' || desc === 'away') odds.away = value;
      } else if (id === '18') writeTotal(odds, '', market.specifier, outcome);
      else if (id === '19') writeTotal(odds, 'home', market.specifier, outcome);
      else if (id === '20') writeTotal(odds, 'away', market.specifier, outcome);
      else if (id === '11') {
        if (oid === '4' || desc === 'home') odds['home-dnb'] = value;
        if (oid === '5' || desc === 'away') odds['away-dnb'] = value;
      } else if (id === '29') {
        if (oid === '74' || desc === 'yes') odds['btts-yes'] = value;
        if (oid === '76' || desc === 'no') odds['btts-no'] = value;
      } else if (id === '10') {
        if (oid === '9') odds['dc-1x'] = value;
        if (oid === '10') odds['dc-12'] = value;
        if (oid === '11') odds['dc-x2'] = value;
      } else if (id === '60') {
        if (oid === '1' || desc === 'home') odds['fh-home'] = value;
        if (oid === '2' || desc === 'draw') odds['fh-draw'] = value;
        if (oid === '3' || desc === 'away') odds['fh-away'] = value;
      } else if (id === '68') writeTotal(odds, 'fh', market.specifier, outcome);
      else if (id === '31' && (oid === '74' || desc === 'yes')) odds['home-clean'] = value;
      else if (id === '32' && (oid === '74' || desc === 'yes')) odds['away-clean'] = value;
      else if (id === '166') writeTotal(odds, 'corners', market.specifier, outcome);
      else if (id === '800063') {
        if (desc === '4+' || oid.endsWith('00000004')) odds['cards-over-35'] = value;
        if (desc === '5+' || oid.endsWith('00000005')) odds['cards-over-45'] = value;
      }
    }
  }
  return odds;
}

/** Simulated, virtual and e-sport fixtures are never shown or booked. */
export function isSimulated(event) {
  const where = `${event?.country || ''} | ${event?.tournament || ''}`.toLowerCase();
  return /simulated|virtual|e-?soccer|esports|cyber|\bsrl$/.test(where) || /\bsrl\b/.test(String(event?.tournament || '').toLowerCase());
}

/** Flatten one catalogue page into Betspapa fixture events. */
export function flattenPage(payload) {
  const events = [];
  for (const tournament of payload?.data?.tournaments || []) {
    for (const event of tournament?.events || []) {
      const kickoffMs = Number(event?.estimateStartTime);
      if (!event?.eventId || !event?.homeTeamName || !event?.awayTeamName || !Number.isFinite(kickoffMs)) continue;
      const record = {
        eventId: String(event.eventId),
        home: String(event.homeTeamName),
        away: String(event.awayTeamName),
        kickoff: new Date(kickoffMs).toISOString(),
        homeId: event.homeTeamId ? String(event.homeTeamId) : null,
        awayId: event.awayTeamId ? String(event.awayTeamId) : null,
        tournament: tournament.name || event.sport?.category?.tournament?.name || 'Fixture',
        country: event.sport?.category?.name || '',
        odds: parseOdds(event.markets),
      };
      if (!isSimulated(record)) events.push(record);
    }
  }
  return events;
}

async function fetchPage(pageNum, fetchImpl, markets = CATALOGUE_MARKETS) {
  const url = `${BASE}/factsCenter/pcUpcomingEvents?sportId=sr%3Asport%3A1&marketId=${encodeURIComponent(markets)}&pageSize=${PAGE_SIZE}&pageNum=${pageNum}`;
  const response = await fetchImpl(url, {
    headers: {
      Accept: 'application/json',
      OperId: '3',
      Platform: 'web',
      Referer: 'https://www.sportybet.com/gh/sport/football',
      Origin: 'https://www.sportybet.com',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Fixture page ${pageNum} returned ${response.status}`);
  const payload = await response.json();
  if (Number(payload?.bizCode) !== 10000) throw new Error(`Fixture page ${pageNum} was rejected`);
  return { events: flattenPage(payload), total: Number(payload?.data?.totalNum) || 0 };
}

async function loadAll(fetchImpl, markets = CATALOGUE_MARKETS) {
  const first = await fetchPage(1, fetchImpl, markets);
  const pages = Math.min(MAX_PAGES, Math.max(1, Math.ceil(first.total / PAGE_SIZE)));
  const events = [...first.events];
  for (let start = 2; start <= pages; start += 4) {
    const batch = [];
    for (let page = start; page < start + 4 && page <= pages; page += 1) batch.push(fetchPage(page, fetchImpl, markets));
    for (const result of await Promise.allSettled(batch)) {
      if (result.status === 'fulfilled') events.push(...result.value.events);
      else console.error(`[fixtures] ${result.reason?.message || result.reason}`);
    }
  }
  const seen = new Set();
  return events
    .filter((event) => (seen.has(event.eventId) ? false : (seen.add(event.eventId), true)))
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff));
}

function refresh(fetchImpl) {
  if (cache.pending) return cache.pending;
  cache.pending = loadAll(fetchImpl)
    .then((events) => {
      if (!events.length) throw new Error('Fixture catalogue returned no events');
      cache.events = events;
      cache.loadedAt = Date.now();
      return events;
    })
    .finally(() => {
      cache.pending = null;
    });
  return cache.pending;
}

/**
 * Cached real fixture list. A stale list (under an hour old) is returned at once
 * while a fresh one loads in the background. Throws when nothing real is available.
 */
const extraCache = { loadedAt: 0, prices: new Map(), pending: null };

/** Corner and card prices are omitted when requested together with the main lines, so they load on their own. */
export async function loadExtraPrices({ fetchImpl = fetch } = {}) {
  if (extraCache.prices.size && Date.now() - extraCache.loadedAt < CACHE_TTL_MS) return extraCache.prices;
  if (extraCache.pending) return extraCache.pending;
  extraCache.pending = loadAll(fetchImpl, EXTRA_MARKETS)
    .then((events) => {
      const prices = new Map(events.filter((event) => event.odds && Object.keys(event.odds).length).map((event) => [event.eventId, event.odds]));
      extraCache.prices = prices;
      extraCache.loadedAt = Date.now();
      return prices;
    })
    .finally(() => {
      extraCache.pending = null;
    });
  return extraCache.pending;
}

export function mergePrices(events, extra) {
  if (!extra) return events;
  return (events || []).map((event) => {
    const more = extra instanceof Map ? extra.get(event.eventId) : extra[event.eventId];
    if (!more) return event;
    return { ...event, odds: { ...(event.odds || {}), ...more } };
  });
}

export async function loadUpcomingEvents({ force = false, fetchImpl = fetch } = {}) {
  const age = Date.now() - cache.loadedAt;
  if (!force && cache.events.length && age < CACHE_TTL_MS) return cache.events;
  if (!force && cache.events.length && age < STALE_MS) {
    refresh(fetchImpl).catch((error) => console.error(`[fixtures] Background refresh failed: ${error.message}`));
    return cache.events;
  }
  return refresh(fetchImpl);
}
