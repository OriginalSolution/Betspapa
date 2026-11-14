/**
 * Books a caller's own selection list. Codes come only from the share endpoints.
 * The same legs reuse a cached code. A burst of different lists is refused.
 */
import { bookAll } from './bookers.mjs';
import { selectionKey } from './selection.mjs';
import { legOpen, priceInRange } from './oddsRange.mjs';

const MAX_LEGS = 40;
const MAX_GROUPS = 12;
const CACHE_MS = 6 * 60 * 60 * 1000;
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 8;

const cache = new Map();
const hits = new Map();

export function resetBookingLimits() {
  cache.clear();
  hits.clear();
}

export function prepareLegs(rows, now = new Date()) {
  const out = [];
  const seen = new Set();
  const clock = now instanceof Date ? now.getTime() : new Date(now).getTime();
  for (const row of Array.isArray(rows) ? rows : []) {
    const eventId = String(row?.eventId || '');
    const market = String(row?.market || '');
    const odds = Number(row?.odds);
    const kick = Date.parse(row?.kickoff || '');
    if (!/^sr:match:\d+$/.test(eventId) || !market) continue;
    if (!Number.isFinite(odds) || !priceInRange(market, odds, row)) continue;
    if (!legOpen({ kickoff: row?.kickoff }, clock)) continue;
    const key = `${eventId}|${market}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      eventId,
      market,
      odds,
      kickoff: new Date(kick).toISOString(),
      match: String(row?.match || '').replace(/\s+/g, ' ').trim().slice(0, 80),
    });
    if (out.length >= MAX_LEGS) break;
  }
  return out;
}

export function allowBooking(ip, now = Date.now()) {
  const key = String(ip || 'local');
  const recent = (hits.get(key) || []).filter((at) => now - at < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

function remember(key, value) {
  cache.set(key, { value, expires: Date.now() + CACHE_MS });
  return value;
}

export async function bookGroups(groups, request, now = new Date(), ip = 'local') {
  const rows = (Array.isArray(groups) ? groups : []).slice(0, MAX_GROUPS);
  const booked = [];
  for (const group of rows) {
    const legs = prepareLegs(group?.legs, now);
    const key = selectionKey(legs);
    if (!key) {
      booked.push({ id: String(group?.id || ''), key: '', books: {}, bookedAt: null, legCount: 0 });
      continue;
    }
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) {
      booked.push({ ...hit.value, id: String(group?.id || '') });
      continue;
    }
    const clock = now instanceof Date ? now.getTime() : Date.now();
    if (!allowBooking(ip, clock)) {
      const error = new Error('Too many booking requests. Try again in a minute.');
      error.status = 429;
      throw error;
    }
    const books = await bookAll(legs, request);
    booked.push(remember(key, { id: String(group?.id || ''), key, books, bookedAt: new Date().toISOString(), legCount: legs.length }));
  }
  return { groups: booked };
}
