/** No-login Ghana share booking. Betway is omitted because it needs a logged-in account. */
import { priceInRange, rangeReason } from './oddsRange.mjs';
import { responseShape } from './guardianOps.mjs';
import { loadOfferIndex, stillOffered, toSelection } from './selection.mjs';

const SPORTY_SHARE = 'https://www.sportybet.com/api/gh/orders/share';
const FOOTBALL_SHARE = 'https://www.football.com/api/gh/orders/share';
const MSPORT_SHARE = 'https://www.msport.com/api/gh/orders/real-sports/order/share';
const BETIKA_SHARE = 'https://api.betika.com.gh/v2/share/';
const BETPAWA = 'https://www.betpawa.com.gh/api/sportsbook/';
/** Selections one share code can hold. SportyBet and Football.com take 50. The others are smaller. */
export const DESK_MAX = {
  sportybet: 50,
  footballcom: 50,
  msport: 30,
  betika: 20,
  betpawa: 20,
};

const LINKS = {
  sportybet: (code) => `https://www.sportybet.com/gh/?shareCode=${code}`,
  footballcom: (code) => `https://www.football.com/gh/?shareCode=${code}`,
  msport: (code) => `https://www.msport.com/gh/?shareCode=${code}`,
  betika: (code) => `https://betika.com/en-gh/share/${code}`,
  betpawa: (code) => `https://www.betpawa.com.gh/share-betslip/${code}`,
};

const BP_MARKETS = {
  1: ['3743', null, { 1: '1', 2: 'X', 3: '2' }],
  10: ['4693', null, { 9: '1X', 10: '12', 11: 'X2' }],
  11: ['4703', null, { 4: '1', 5: '2' }],
  18: ['5000', 't', { 12: 'Over', 13: 'Under' }],
  19: ['5006', 't', { 12: 'Over', 13: 'Under' }],
  20: ['5003', 't', { 12: 'Over', 13: 'Under' }],
  29: ['3795', null, { 74: 'Yes', 76: 'No' }],
  31: ['3816', null, { 74: 'Yes', 76: 'No' }],
  32: ['3807', null, { 74: 'Yes', 76: 'No' }],
  60: ['3668', null, { 1: '1', 2: 'X', 3: '2' }],
  68: ['4958', 't', { 12: 'Over', 13: 'Under' }],
  // 2nd half total. betPawa market type 4976, same quarter-goal handicap as the other totals (0.5 → 2).
  90: ['4976', 't', { 12: 'Over', 13: 'Under' }],
  166: ['1096783', 't', { 12: 'Over', 13: 'Under' }],
};

/** Bump when a desk map changes, so slips that already used their hourly retries are asked again. */
export const BOOKING_MAP_VERSION = 3;

/**
 * betPawa lookups are cached for a while, never for the life of the process.
 * A found event keeps its id for hours. A miss is asked again after a few minutes,
 * because betPawa lists matches later than the feed. Prices are refetched every cycle.
 */
export const BETPAWA_EVENT_TTL_MS = 6 * 60 * 60 * 1000;
export const BETPAWA_MISS_TTL_MS = 10 * 60 * 1000;
export const BETPAWA_PRICE_TTL_MS = 2 * 60 * 1000;
const eventCache = new Map();
const priceCache = new Map();
let offerCache = null;

function cacheGet(cache, key, now = Date.now()) {
  const row = cache.get(key);
  if (!row) return undefined;
  if (row.expires <= now) {
    cache.delete(key);
    return undefined;
  }
  return row.value;
}

function cacheSet(cache, key, value, ttl, now = Date.now()) {
  if (cache.size > 5000) {
    for (const [stale, row] of cache) if (row.expires <= now) cache.delete(stale);
  }
  cache.set(key, { value, expires: now + ttl });
}
const DESK_LIMIT = 2;
const INTERACTIVE_LIMIT = 1;
const deskLanes = new Map();
const interactiveLanes = new Map();

function makeLane(limit) {
  let active = 0;
  const waiting = [];
  return async (fn) => {
    if (active >= limit) await new Promise((resolve) => waiting.push(resolve));
    active += 1;
    try {
      return await fn();
    } finally {
      active -= 1;
      const next = waiting.shift();
      if (next) next();
    }
  };
}

/** Engine bookings share one queue. On-demand Book + track uses a separate lane so it does not wait behind the engine. */
function lane(name, interactive = false) {
  const store = interactive ? interactiveLanes : deskLanes;
  const limit = interactive ? INTERACTIVE_LIMIT : DESK_LIMIT;
  if (!store.has(name)) store.set(name, makeLane(limit));
  return store.get(name);
}

async function withDeadline(promise, deadline, message) {
  const ms = deadline ? deadline - Date.now() : Infinity;
  if (!Number.isFinite(ms)) return promise;
  if (ms <= 0) throw new Error(message);
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function resetBookerCache() {
  eventCache.clear();
  priceCache.clear();
  offerCache = null;
  deskLanes.clear();
  interactiveLanes.clear();
}

function product(values) {
  const total = values.reduce((acc, value) => acc * (Number(value) || 1), 1);
  return Math.round(total * 100) / 100;
}

function chunks(list, size) {
  const out = [];
  const width = Math.max(1, size);
  for (let index = 0; index < list.length; index += width) out.push(list.slice(index, index + width));
  return out;
}

async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

function isPending(status) {
  const value = String(status ?? '').trim().toLowerCase();
  return value === 'not start' || value === '0' || value === '';
}

function sportyBody(legs) {
  return {
    selections: legs.map((leg) => ({
      eventId: leg.eventId,
      marketId: String(leg.marketId),
      specifier: leg.specifier || null,
      outcomeId: String(leg.outcomeId),
    })),
  };
}

async function sportyShare(legs, request) {
  if (!legs.length) return { code: null, status: 'empty' };
  const body = await request('POST', SPORTY_SHARE, { body: sportyBody(legs) });
  if (body?.bizCode !== 10000) return { code: null, status: publicError(body?.message || 'Share was refused') };
  const data = body.data || {};
  const bad = (data.outcomes || []).filter((outcome) => !isPending(outcome.matchStatus));
  return { code: data.shareCode || null, status: bad.length ? `${bad.length} not open` : 'ok' };
}

export { MIN_ODDS } from './oddsRange.mjs';

function keptRow(leg, odds) {
  const price = Number(odds);
  return { eventId: leg.eventId, market: leg.market, odds: Number.isFinite(price) ? Math.round(price * 100) / 100 : leg.odds };
}

function drop(leg, reason) {
  return { eventId: leg.eventId, market: leg.market || null, match: leg.match || '', reason };
}

function splitByRange(legs) {
  const priced = [];
  const dropped = [];
  for (const leg of legs) {
    if (priceInRange(leg.market, leg.odds, leg)) priced.push(leg);
    else dropped.push(drop(leg, rangeReason(leg.market, leg.odds)));
  }
  return { priced, dropped };
}

function legKey(eventId, marketId, specifier, outcomeId) {
  return `${eventId}|${String(marketId)}|${specifier || ''}|${String(outcomeId)}`;
}

function selKey(leg) {
  return legKey(leg.eventId, leg.marketId, leg.specifier, leg.outcomeId);
}

async function sportyTry(legs, request) {
  const { priced, dropped } = splitByRange(legs);
  const pack = (group, booked) =>
    booked?.code && booked.status === 'ok'
      ? {
          code: booked.code,
          totalOdds: product(group.map((leg) => leg.odds)),
          legs: group.length,
          matches: group.map((leg) => leg.eventId),
          kept: group.map((leg) => keptRow(leg, leg.odds)),
        }
      : null;
  if (!priced.length) return { booked: null, dropped };
  const direct = pack(priced, await sportyShare(priced, request));
  if (direct) return { booked: direct, dropped };
  const probed = await pool(priced, 5, async (leg) => ((await sportyShare([leg], request)).status === 'ok' ? leg : null));
  const open = probed.filter(Boolean);
  dropped.push(...priced.filter((leg, index) => !probed[index]).map((leg) => drop(leg, 'Not open on SportyBet (closed, started or suspended).')));
  if (!open.length) return { booked: null, dropped };
  const booked = pack(open, await sportyShare(open, request));
  return { booked, dropped: booked ? dropped : priced.map((leg) => drop(leg, 'SportyBet refused the slip.')) };
}

async function footballTry(legs, request) {
  const post = (group) => request('POST', FOOTBALL_SHARE, { body: sportyBody(group) });
  const ranged = splitByRange(legs.filter((leg) => leg.marketId && leg.outcomeId));
  const dropped = [...ranged.dropped, ...legs.filter((leg) => !leg.marketId || !leg.outcomeId).map((leg) => drop(leg, 'Market not supported on Football.com.'))];
  let group = ranged.priced;
  if (!group.length) return { booked: null, dropped };
  let body = await post(group);
  if (body?.bizCode !== 10000) {
    const probed = await pool(group, 5, async (leg) => ((await post([leg]))?.bizCode === 10000 ? leg : null));
    dropped.push(...group.filter((leg, index) => !probed[index]).map((leg) => drop(leg, 'Not open on Football.com (closed, started or suspended).')));
    group = probed.filter(Boolean);
    if (!group.length) return { booked: null, dropped };
    body = await post(group);
    if (body?.bizCode !== 10000) return { booked: null, dropped: legs.map((leg) => drop(leg, 'Football.com refused the slip.')) };
  }
  const code = body?.data?.shareCode;
  if (!code) return { booked: null, dropped: legs.map((leg) => drop(leg, 'Football.com returned no share code.')) };
  return {
    booked: {
      code,
      totalOdds: product(group.map((leg) => leg.odds)),
      legs: group.length,
      matches: group.map((leg) => leg.eventId),
      kept: group.map((leg) => keptRow(leg, leg.odds)),
    },
    dropped,
  };
}

function msportSelection(leg) {
  return {
    eventId: leg.eventId,
    marketId: String(leg.marketId || ''),
    specifier: leg.specifier || '',
    outcomeId: String(leg.outcomeId || ''),
  };
}

async function msportTry(legs, request) {
  const headers = { operid: '3' };
  const probed = await pool(legs, 5, async (leg) => {
    if (!leg.marketId || !leg.outcomeId) return null;
    const body = await request('POST', MSPORT_SHARE, { body: { selections: [msportSelection(leg)] }, headers });
    return body?.bizCode === 10000 ? leg : null;
  });
  const dropped = legs.filter((leg, index) => !probed[index]).map((leg) => drop(leg, 'Not open on MSport (closed, started or suspended).'));
  let open = probed.filter(Boolean);
  for (let round = 0; round < 2 && open.length; round += 1) {
    const booked = await request('POST', MSPORT_SHARE, { body: { selections: open.map(msportSelection) }, headers });
    if (booked?.bizCode !== 10000 || !booked?.data?.shareCode) {
      return { booked: null, dropped: [...dropped, ...open.map((leg) => drop(leg, 'MSport refused the slip.'))] };
    }
    const code = booked.data.shareCode;
    const confirmed = await request('GET', `${MSPORT_SHARE}/${code}`, { headers: { ...headers, 'Content-Type': 'application/json' } });
    const slip = confirmed?.data?.bettableBetSlip || [];
    const prices = new Map();
    for (const row of slip) {
      const price = Number(row?.outcome?.odds);
      if (!Number.isFinite(price)) continue;
      prices.set(legKey(row?.event?.eventId, row?.market?.id, row?.market?.specifiers, row?.outcome?.id), price);
    }
    const short = open.filter((leg) => {
      const price = prices.get(selKey(leg));
      return price != null && !priceInRange(leg.market, price, leg);
    });
    if (!short.length || round === 1) {
      if (short.length) {
        return { booked: null, dropped: [...dropped, ...open.map((leg) => drop(leg, 'MSport kept a price outside the odds range on this slip.'))] };
      }
      const kept = open
        .filter((leg) => priceInRange(leg.market, prices.get(selKey(leg)) ?? leg.odds, leg))
        .map((leg) => keptRow(leg, prices.get(selKey(leg)) ?? leg.odds));
      const totalOdds = slip.length ? product(slip.map((row) => row?.outcome?.odds)) : null;
      return { booked: { code, totalOdds, legs: kept.length || open.length, matches: open.map((leg) => leg.eventId), kept }, dropped };
    }
    dropped.push(...short.map((leg) => drop(leg, `MSport price ${rangeReason(leg.market, prices.get(selKey(leg)))}`)));
    open = open.filter((leg) => !short.includes(leg));
  }
  return { booked: null, dropped };
}

function betikaSelection(leg) {
  return {
    odd_key: '',
    outcome_id: String(leg.outcomeId || ''),
    special_bet_value: leg.specifier || '',
    parent_match_id: leg.eventId.split(':').pop(),
    sub_type_id: String(leg.marketId || ''),
    has_parent: null,
    parent_code: null,
  };
}

function betikaRowKey(row) {
  return legKey(`sr:match:${row.parent_match_id}`, row.sub_type_id, row.special_bet_value, row.outcome_id);
}

async function betikaTry(legs, request) {
  const dropped = [];
  const supported = [];
  for (const leg of legs) {
    if (!leg.marketId || !leg.outcomeId) {
      dropped.push(drop(leg, 'Market not supported on Betika.'));
      continue;
    }
    // Betika Ghana's prematch list has "1st half - total" (sub type 68) and no "2nd half - total".
    // Encode with sub type 90 answers "odds have expired" on matches that do sell the full-time total.
    if (leg.market === 'sh-over05' || String(leg.marketId) === '90') {
      dropped.push(drop(leg, 'Betika does not list second-half over 0.5.'));
      continue;
    }
    supported.push(leg);
  }
  let group = supported;
  if (!group.length) return { booked: null, dropped };
  const encode = (groupToBook) =>
    request('POST', `${BETIKA_SHARE}encode`, {
      body: {
        profile_id: 0,
        bet_id: null,
        token: null,
        src: 'MOBILE_WEB',
        product_type: 'PREMATCH',
        betslip: groupToBook.map(betikaSelection),
      },
    });
  let body = await encode(group);
  if (!body?.code) {
    const probed = await pool(group, 5, async (leg) => ((await encode([leg]))?.code ? leg : null));
    dropped.push(...group.filter((leg, index) => !probed[index]).map((leg) => drop(leg, 'Not open on Betika (closed, started or unlisted).')));
    group = probed.filter(Boolean);
    if (!group.length) return { booked: null, dropped };
    body = await encode(group);
  }
  for (let round = 0; round < 2; round += 1) {
    const code = body?.code;
    if (!code) return { booked: null, dropped: [...dropped, ...group.map((leg) => drop(leg, 'Betika refused the slip.'))] };
    const decoded = await request('GET', `${BETIKA_SHARE}decode?code=${encodeURIComponent(code)}&src=MOBILE_WEB`, {});
    const rows = decoded?.data || [];
    const valid = rows.filter((row) => String(row.valid) === '1');
    if (!valid.length) return { booked: null, dropped: [...dropped, ...group.map((leg) => drop(leg, 'Betika marked the slip invalid.'))] };
    const rowByKey = new Map(rows.map((row) => [betikaRowKey(row), row]));
    const invalid = group.filter((leg) => {
      const row = rowByKey.get(selKey(leg));
      return row && String(row.valid) !== '1';
    });
    const short = group.filter((leg) => {
      const row = rowByKey.get(selKey(leg));
      return row && String(row.valid) === '1' && !priceInRange(leg.market, row.odd_value, leg);
    });
    if (!short.length) {
      dropped.push(...invalid.map((leg) => drop(leg, 'Betika marked this selection invalid.')));
      dropped.push(...group.filter((leg) => !rowByKey.has(selKey(leg))).map((leg) => drop(leg, 'Betika left this selection off the slip (not offered).')));
      const keptRows = group.filter((leg) => {
        const row = rowByKey.get(selKey(leg));
        return row && String(row.valid) === '1' && priceInRange(leg.market, row.odd_value, leg);
      });
      return {
        booked: {
          code,
          totalOdds: product(keptRows.map((leg) => rowByKey.get(selKey(leg)).odd_value)),
          legs: keptRows.length,
          matches: [...new Set(keptRows.map((leg) => leg.eventId))].sort(),
          kept: keptRows.map((leg) => keptRow(leg, rowByKey.get(selKey(leg)).odd_value)),
        },
        dropped,
      };
    }
    if (round === 1) return { booked: null, dropped: [...dropped, ...group.map((leg) => drop(leg, 'Betika kept a price outside the odds range on this slip.'))] };
    dropped.push(...short.map((leg) => drop(leg, `Betika price ${rangeReason(leg.market, rowByKey.get(selKey(leg)).odd_value)}`)));
    group = group.filter((leg) => !short.includes(leg));
    if (!group.length) return { booked: null, dropped };
    body = await encode(group);
  }
  return { booked: null, dropped };
}

async function betpawaCall(method, path, request, body) {
  return request(method, BETPAWA + path, {
    headers: {
      'x-pawa-brand': 'betpawa-ghana',
      'x-pawa-language': 'en',
      devicetype: 'web',
    },
    body,
  });
}

const STOP_WORDS = new Set(['fc', 'club', 'cd', 'sc', 'ac', 'afc', 'cf', 'real', 'united', 'city', 'sporting', 'atletico', 'deportivo']);

function searchTerms(match) {
  const terms = [];
  for (const team of String(match || '').split(/\s+v(?:s)?\s+/i)) {
    const words = team.split(/\W+/).filter((word) => word.length > 2 && !STOP_WORDS.has(word.toLowerCase()));
    terms.push(team.trim(), ...words.sort((a, b) => b.length - a.length).slice(0, 2));
  }
  return [...new Set(terms.map((term) => term.trim()).filter(Boolean))];
}

async function findBetpawaEvent(leg, request) {
  const sr = leg.eventId.split(':').pop();
  const cached = cacheGet(eventCache, sr);
  if (cached !== undefined) return cached;
  let answered = false;
  for (const term of searchTerms(leg.match)) {
    const body = await betpawaCall('GET', `v3/search?name=${encodeURIComponent(term)}`, request);
    if (body && Array.isArray(body.events)) answered = true;
    for (const event of body?.events || []) {
      const widgets = event.widgets || [];
      if (widgets.some((widget) => widget.type === 'SPORTRADAR' && String(widget.id) === sr)) {
        cacheSet(eventCache, sr, event.id, BETPAWA_EVENT_TTL_MS);
        return event.id;
      }
    }
  }
  // Only a search betPawa answered counts as a miss. A failed call is asked again next time.
  if (answered) cacheSet(eventCache, sr, null, BETPAWA_MISS_TTL_MS);
  return null;
}

/** Why betPawa has no price for a leg. "does not list" means betPawa does not sell it, not a booking fault. */
export const BETPAWA_NO_EVENT = 'betPawa does not list this match.';
export const BETPAWA_NO_MARKET = 'betPawa does not list this market for this match.';
export const BETPAWA_CLOSED = 'Not open on betPawa.';

/** [priceId, odds] when betPawa sells the leg, otherwise { reason }. */
async function betpawaPrice(leg, request) {
  const market = BP_MARKETS[String(leg.marketId)];
  if (!market) return { reason: BETPAWA_NO_MARKET };
  const eventId = await findBetpawaEvent(leg, request);
  if (!eventId) return { reason: BETPAWA_NO_EVENT };
  let full = cacheGet(priceCache, eventId);
  if (full === undefined) {
    full = await betpawaCall('GET', `v4/events/${eventId}`, request);
    if (full && Array.isArray(full.markets)) cacheSet(priceCache, eventId, full, BETPAWA_PRICE_TTL_MS);
  }
  if (!full || !Array.isArray(full.markets)) return { reason: BETPAWA_CLOSED };
  const wanted = market[2][String(leg.outcomeId)];
  let handicap = null;
  if (market[1]) {
    const line = /total=([\d.]+)/.exec(leg.specifier || '');
    if (!line) return { reason: BETPAWA_NO_MARKET };
    handicap = Math.round(Number(line[1]) * 4);
  }
  let listed = false;
  for (const rowMarket of full.markets) {
    if (String(rowMarket.marketType?.id) !== market[0]) continue;
    listed = true;
    for (const row of rowMarket.row || []) {
      if (handicap != null && Number(row.handicap) !== handicap) continue;
      for (const price of row.prices || []) {
        if (price.name === wanted && !price.suspended && Number(price.odds) > 1) return [price.id, Number(price.odds)];
      }
    }
  }
  return { reason: listed ? BETPAWA_CLOSED : BETPAWA_NO_MARKET };
}

async function betpawaTry(legs, request) {
  const chosen = [];
  const dropped = [];
  const seen = new Set();
  let scanned = 0;
  for (const leg of legs) {
    if (chosen.length >= DESK_MAX.betpawa) break;
    scanned += 1;
    if (seen.has(leg.eventId)) {
      dropped.push(drop(leg, 'betPawa takes one selection per match on a shared slip.'));
      continue;
    }
    const price = await betpawaPrice(leg, request);
    if (!Array.isArray(price)) {
      dropped.push(drop(leg, price?.reason || BETPAWA_CLOSED));
      continue;
    }
    if (!priceInRange(leg.market, price[1], leg)) {
      dropped.push(drop(leg, `betPawa price ${rangeReason(leg.market, price[1])}`));
      continue;
    }
    seen.add(leg.eventId);
    chosen.push({ id: price[0], odds: price[1], eventId: leg.eventId, market: leg.market });
  }
  if (!chosen.length) return { booked: null, dropped, scanned };
  const booked = await betpawaCall('POST', 'v3/booking-number', request, {
    selections: { selections: [{ type: chosen.length > 1 ? 'COMBO' : 'SINGLE', selections: chosen.map((row) => row.id) }] },
  });
  const code = booked?.code;
  if (!code) return { booked: null, dropped: legs.slice(0, scanned).map((leg) => drop(leg, 'betPawa refused the slip.')), scanned };
  const view = await betpawaCall('GET', `v3/booking-number/${code}`, request);
  const count = (view?.items || []).reduce((sum, item) => sum + (item.selections || []).length, 0) || chosen.length;
  return {
    booked: {
      code,
      totalOdds: product(chosen.map((row) => row.odds)),
      legs: count,
      matches: chosen.map((row) => row.eventId),
      link: LINKS.betpawa(code),
      kept: chosen.map((row) => keptRow(row, row.odds)),
    },
    dropped,
    scanned,
  };
}

function wholeSlipRefused(result, group) {
  if (result?.booked?.code || group.length < 2) return false;
  const dropped = result?.dropped || [];
  return dropped.length >= group.length && dropped.every((row) => /refused the slip/i.test(String(row.reason || '')));
}

/** A desk that refuses a long slip is retried in halves instead of dropping the legs. */
function withoutKept(booked) {
  if (!booked) return { part: null, kept: [] };
  const { kept = [], ...part } = booked;
  return { part: part.code ? part : null, kept };
}

async function placeChunk(group, fn, max) {
  const result = await fn(group);
  if (!wholeSlipRefused(result, group) || group.length <= max) {
    const taken = withoutKept(result?.booked);
    return { parts: taken.part ? [taken.part] : [], dropped: result?.dropped || [], kept: taken.kept, scanned: result?.scanned || 0 };
  }
  const mid = Math.ceil(group.length / 2);
  const left = await placeChunk(group.slice(0, mid), fn, max);
  const right = await placeChunk(group.slice(mid), fn, max);
  return {
    parts: [...left.parts, ...right.parts],
    dropped: [...left.dropped, ...right.dropped],
    kept: [...left.kept, ...right.kept],
    scanned: (left.scanned || 0) + (right.scanned || 0),
  };
}

async function chunked(legs, fn, max) {
  const parts = [];
  const dropped = [];
  const kept = [];
  let scanned = 0;
  for (const chunk of chunks(legs, max)) {
    const placed = await placeChunk(chunk, fn, max);
    parts.push(...placed.parts);
    dropped.push(...placed.dropped);
    kept.push(...(placed.kept || []));
    scanned += placed.scanned || 0;
  }
  return { parts, dropped, kept, scanned };
}

function withLink(name, booked) {
  return {
    code: booked.code,
    link: booked.link || LINKS[name](booked.code),
    totalOdds: booked.totalOdds ?? null,
    legs: booked.legs,
    matches: booked.matches || [],
  };
}

export function publicError(value) {
  const text = String(value || 'Booking failed')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
  return text || 'Booking failed';
}

async function cachedIndex(request) {
  if (offerCache && offerCache.expires > Date.now()) return offerCache.value;
  try {
    const value = await loadOfferIndex(request);
    offerCache = { value, expires: Date.now() + 3 * 60 * 1000 };
    return value;
  } catch {
    return null;
  }
}

export async function bookAll(legs, request, onBook, only, opts = {}) {
  if (typeof request !== 'function') throw new Error('Booking needs an HTTP client.');
  const rawRequest = request;
  request = async (method, url, opts) => {
    let last;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      last = await rawRequest(method, url, opts);
      const shape = responseShape(last);
      if (shape.ok) return last;
      console.error(`[book] Response schema changed: ${shape.sample}`);
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
    }
    return last;
  };
  const mapped = [];
  const seen = new Set();
  for (const leg of legs.map(toSelection).filter(Boolean)) {
    const key = `${leg.eventId}|${leg.marketId}|${leg.specifier || ''}|${leg.outcomeId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    mapped.push(leg);
  }
  const interactive = Boolean(opts.interactive);
  const deadline = Number(opts.deadline) || 0;
  const deskMs = Number(opts.deskMs) > 0 ? Number(opts.deskMs) : 0;
  const timeoutMessage = 'This bookmaker took too long. Try again.';
  const allowed = Array.isArray(only) ? new Set(only) : null;
  const deskNames = ['sportybet', 'footballcom', 'msport', 'betika', 'betpawa'].filter((name) => !allowed || allowed.has(name));
  let index = null;
  try {
    index = mapped.length ? await withDeadline(cachedIndex(request), deadline, timeoutMessage) : null;
  } catch (error) {
    const failed = { parts: [], error: publicError(error?.message || error), dropped: [] };
    const books = {};
    for (const name of deskNames) {
      books[name] = { ...failed };
      onBook?.(name, books[name]);
    }
    return books;
  }
  const open = mapped.filter((leg) => stillOffered(index, leg));
  const closed = mapped.filter((leg) => !stillOffered(index, leg)).map((leg) => drop(leg, 'Closed or suspended in the latest price scan.'));
  const runners = [
    ['sportybet', (group) => chunked(group, (chunk) => sportyTry(chunk, request), DESK_MAX.sportybet)],
    ['footballcom', (group) => chunked(group, (chunk) => footballTry(chunk, request), DESK_MAX.footballcom)],
    ['msport', (group) => chunked(group, (chunk) => msportTry(chunk, request), DESK_MAX.msport)],
    ['betika', (group) => chunked(group, (chunk) => betikaTry(chunk, request), DESK_MAX.betika)],
    ['betpawa', (group) => chunked(group, (chunk) => betpawaTry(chunk, request), DESK_MAX.betpawa)],
  ].filter(([name]) => !allowed || allowed.has(name));
  const books = {};
  await Promise.all(
    runners.map(async ([name, run]) => {
      let result;
      try {
        const deskDeadline = deskMs ? Math.min(deadline || Number.POSITIVE_INFINITY, Date.now() + deskMs) : deadline;
        const done = await withDeadline(
          lane(name, interactive)(async () => (open.length ? await run(open) : { parts: [], dropped: [], kept: [] })),
          deskDeadline,
          timeoutMessage,
        );
        const parts = done.parts.map((part) => withLink(name, part));
        const dropped = [...closed, ...done.dropped];
        const kept = done.kept || [];
        result = parts.length ? { parts, error: null, dropped, kept } : { parts: [], error: 'No open selections on this bookmaker.', dropped, kept };
        if (done.scanned != null) result.scanned = done.scanned;
      } catch (error) {
        result = { parts: [], error: publicError(error?.message || error), dropped: closed };
      }
      books[name] = result;
      onBook?.(name, result);
    }),
  );
  return books;
}
