/** No-login Ghana share booking. Betway is omitted because it needs a logged-in account. */
import { spawn } from 'node:child_process';
import { loadOfferIndex, stillOffered, toSelection } from './selection.mjs';

export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36';
const SPORTY_SHARE = 'https://www.sportybet.com/api/gh/orders/share';
const FOOTBALL_SHARE = 'https://www.football.com/api/gh/orders/share';
const MSPORT_SHARE = 'https://www.msport.com/api/gh/orders/real-sports/order/share';
const BETIKA_SHARE = 'https://api.betika.com.gh/v2/share/';
const BETPAWA = 'https://www.betpawa.com.gh/api/sportsbook/';
const CHUNK = 30;

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
};

const eventCache = new Map();
const priceCache = new Map();
let offerCache = null;

export function resetBookerCache() {
  eventCache.clear();
  priceCache.clear();
  offerCache = null;
}

export function requestJson(method, url, { body, headers = {}, timeout = 25 } = {}) {
  const headerList = { Accept: 'application/json', ...headers };
  if (body !== undefined) headerList['Content-Type'] = 'application/json';
  const args = ['-sS', '-m', String(timeout), '-A', UA, '-X', method];
  for (const [key, value] of Object.entries(headerList)) {
    if (value != null) args.push('-H', `${key}: ${value}`);
  }
  args.push(url);
  if (body !== undefined) args.push('-d', JSON.stringify(body));
  return new Promise((resolve) => {
    const child = spawn('curl', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (buf) => {
      out += buf;
    });
    const finish = () => {
      const text = out.trim();
      if (!text || !/^[{\[]/.test(text)) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch {
        resolve({});
      }
    };
    child.on('close', finish);
    child.on('error', () => resolve({}));
  });
}

function product(values) {
  const total = values.reduce((acc, value) => acc * (Number(value) || 1), 1);
  return Math.round(total * 100) / 100;
}

function chunks(list) {
  const out = [];
  for (let index = 0; index < list.length; index += CHUNK) out.push(list.slice(index, index + CHUNK));
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

async function sportyTry(legs, request) {
  const pack = (group, booked) =>
    booked?.code && booked.status === 'ok'
      ? { code: booked.code, totalOdds: product(group.map((leg) => leg.odds)), legs: group.length, matches: group.map((leg) => leg.eventId) }
      : null;
  const direct = pack(legs, await sportyShare(legs, request));
  if (direct) return direct;
  const probed = await pool(legs, 5, async (leg) => ((await sportyShare([leg], request)).status === 'ok' ? leg : null));
  const open = probed.filter(Boolean);
  if (!open.length) return null;
  return pack(open, await sportyShare(open, request));
}

async function footballTry(legs, request) {
  const post = (group) => request('POST', FOOTBALL_SHARE, { body: sportyBody(group) });
  let group = legs.filter((leg) => leg.marketId && leg.outcomeId);
  if (!group.length) return null;
  let body = await post(group);
  if (body?.bizCode !== 10000) {
    const probed = await pool(group, 5, async (leg) => ((await post([leg]))?.bizCode === 10000 ? leg : null));
    group = probed.filter(Boolean);
    if (!group.length) return null;
    body = await post(group);
    if (body?.bizCode !== 10000) return null;
  }
  const code = body?.data?.shareCode;
  if (!code) return null;
  return { code, totalOdds: product(group.map((leg) => leg.odds)), legs: group.length, matches: group.map((leg) => leg.eventId) };
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
  const open = probed.filter(Boolean);
  if (!open.length) return null;
  const booked = await request('POST', MSPORT_SHARE, { body: { selections: open.map(msportSelection) }, headers });
  if (booked?.bizCode !== 10000) return null;
  const code = booked?.data?.shareCode;
  if (!code) return null;
  const confirmed = await request('GET', `${MSPORT_SHARE}/${code}`, { headers: { ...headers, 'Content-Type': 'application/json' } });
  const slip = confirmed?.data?.bettableBetSlip || [];
  const totalOdds = slip.length ? product(slip.map((row) => row?.outcome?.odds)) : null;
  return { code, totalOdds, legs: slip.length || open.length, matches: open.map((leg) => leg.eventId) };
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

async function betikaTry(legs, request) {
  let group = legs.filter((leg) => leg.marketId && leg.outcomeId);
  if (!group.length) return null;
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
    group = probed.filter(Boolean);
    if (!group.length) return null;
    body = await encode(group);
  }
  const code = body?.code;
  if (!code) return null;
  const decoded = await request('GET', `${BETIKA_SHARE}decode?code=${encodeURIComponent(code)}&src=MOBILE_WEB`, {});
  const valid = (decoded?.data || []).filter((row) => String(row.valid) === '1');
  if (!valid.length) return null;
  return {
    code,
    totalOdds: product(valid.map((row) => row.odd_value)),
    legs: valid.length,
    matches: [...new Set(valid.map((row) => `sr:match:${row.parent_match_id}`))].sort(),
  };
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
  if (eventCache.has(sr)) return eventCache.get(sr);
  for (const term of searchTerms(leg.match)) {
    const body = await betpawaCall('GET', `v3/search?name=${encodeURIComponent(term)}`, request);
    for (const event of body?.events || []) {
      const widgets = event.widgets || [];
      if (widgets.some((widget) => widget.type === 'SPORTRADAR' && String(widget.id) === sr)) {
        eventCache.set(sr, event.id);
        return event.id;
      }
    }
  }
  eventCache.set(sr, null);
  return null;
}

async function betpawaPrice(leg, request) {
  const market = BP_MARKETS[String(leg.marketId)];
  if (!market) return null;
  const eventId = await findBetpawaEvent(leg, request);
  if (!eventId) return null;
  if (!priceCache.has(eventId)) priceCache.set(eventId, await betpawaCall('GET', `v4/events/${eventId}`, request));
  const full = priceCache.get(eventId) || {};
  const wanted = market[2][String(leg.outcomeId)];
  let handicap = null;
  if (market[1]) {
    const line = /total=([\d.]+)/.exec(leg.specifier || '');
    if (!line) return null;
    handicap = Math.round(Number(line[1]) * 4);
  }
  for (const rowMarket of full.markets || []) {
    if (String(rowMarket.marketType?.id) !== market[0]) continue;
    for (const row of rowMarket.row || []) {
      if (handicap != null && Number(row.handicap) !== handicap) continue;
      for (const price of row.prices || []) {
        if (price.name === wanted && !price.suspended && Number(price.odds) > 1) return [price.id, Number(price.odds)];
      }
    }
  }
  return null;
}

async function betpawaTry(legs, request) {
  const chosen = [];
  const seen = new Set();
  for (const leg of legs) {
    if (seen.has(leg.eventId)) continue;
    const price = await betpawaPrice(leg, request);
    if (!price) continue;
    seen.add(leg.eventId);
    chosen.push({ id: price[0], odds: price[1], eventId: leg.eventId });
  }
  if (!chosen.length) return null;
  const booked = await betpawaCall('POST', 'v3/booking-number', request, {
    selections: { selections: [{ type: chosen.length > 1 ? 'COMBO' : 'SINGLE', selections: chosen.map((row) => row.id) }] },
  });
  const code = booked?.code;
  if (!code) return null;
  const view = await betpawaCall('GET', `v3/booking-number/${code}`, request);
  const count = (view?.items || []).reduce((sum, item) => sum + (item.selections || []).length, 0) || chosen.length;
  return {
    code,
    totalOdds: product(chosen.map((row) => row.odds)),
    legs: count,
    matches: chosen.map((row) => row.eventId),
    link: LINKS.betpawa(code),
  };
}

async function chunked(legs, fn) {
  const parts = [];
  for (const chunk of chunks(legs)) {
    const booked = await fn(chunk);
    if (booked?.code) parts.push(booked);
  }
  return parts;
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

export async function bookAll(legs, request = requestJson, onBook) {
  const mapped = [];
  const seen = new Set();
  for (const leg of legs.map(toSelection).filter(Boolean)) {
    const key = `${leg.eventId}|${leg.marketId}|${leg.specifier || ''}|${leg.outcomeId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    mapped.push(leg);
  }
  const index = mapped.length ? await cachedIndex(request) : null;
  const open = mapped.filter((leg) => stillOffered(index, leg));
  const runners = [
    ['sportybet', (group) => chunked(group, (chunk) => sportyTry(chunk, request))],
    ['footballcom', (group) => chunked(group, (chunk) => footballTry(chunk, request))],
    ['msport', (group) => chunked(group, (chunk) => msportTry(chunk, request))],
    ['betika', (group) => chunked(group, (chunk) => betikaTry(chunk, request))],
    ['betpawa', (group) => chunked(group, (chunk) => betpawaTry(chunk, request))],
  ];
  const books = {};
  await Promise.all(
    runners.map(async ([name, run]) => {
      let result;
      try {
        const parts = open.length ? (await run(open)).map((part) => withLink(name, part)) : [];
        result = parts.length ? { parts, error: null } : { parts: [], error: 'No open selections on this bookmaker.' };
      } catch (error) {
        result = { parts: [], error: publicError(error?.message || error) };
      }
      books[name] = result;
      onBook?.(name, result);
    }),
  );
  return books;
}
