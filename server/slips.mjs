/**
 * One slip per 80%+ market, plus the master slip. Each distinct slip is booked
 * once and reused until its legs change. Codes only ever come from the bookmakers.
 */
import { labelFor } from './occurrence.mjs';
import { assertBookingRanges, legOpen, priceInRange, priceNearRange, projectSlip, rangeViolations } from './oddsRange.mjs';
import { inspectBooks } from './quality.mjs';
import { selectionKey } from './selection.mjs';

export { MIN_ODDS } from './oddsRange.mjs';
const MAX_ATTEMPTS = 3;
const ATTEMPT_RESET_MS = 60 * 60 * 1000;
/** One usable code. The top legs by hit rate, then the earliest kickoff. */
export const CODE_LIMIT = 18;
export const SLIP_CONCURRENCY = 4;

export function bookableLegs(legs, now = new Date()) {
  const clock = now instanceof Date ? now.getTime() : Number(now);
  return (Array.isArray(legs) ? legs : []).filter(
    (leg) => legOpen(leg, clock) && leg.status !== 'bust' && (priceInRange(leg.market, leg.odds, leg) || priceNearRange(leg.market, leg.odds, leg)),
  );
}

function cacheFresh(entry, legs) {
  const ids = new Set(legs.map((leg) => leg.eventId));
  for (const book of Object.values(entry?.books || {})) {
    for (const part of book?.parts || []) {
      const matches = part?.matches || [];
      if (matches.some((id) => !ids.has(id))) return false;
      const count = Number(part?.legs);
      if (Number.isFinite(count) && count > legs.length) return false;
    }
  }
  return true;
}

/** The legs that go on one code. Strict range, or a real 10/10 exception, then the cap. */
export function codeLegs(legs, limit = CODE_LIMIT) {
  return (Array.isArray(legs) ? legs : [])
    .filter((leg) => priceInRange(leg?.market, leg?.odds, leg) && !rangeViolations([leg]).length)
    .slice()
    .sort((a, b) => legRate(b) - legRate(a) || String(a.kickoff).localeCompare(String(b.kickoff)) || String(a.eventId).localeCompare(String(b.eventId)) || String(a.market).localeCompare(String(b.market)))
    .slice(0, limit);
}

export function legRate(leg) {
  const rate = Number(leg?.rate);
  if (Number.isFinite(rate)) return rate > 1 ? rate / 100 : rate;
  const occurrence = Number(leg?.occurrence);
  if (!Number.isFinite(occurrence)) return 0;
  return occurrence > 1 ? occurrence / 100 : occurrence;
}

const TIERS = [
  { id: '100', min: 0.995, label: '100%' },
  { id: '90', min: 0.9, label: '90%+' },
  { id: '80', min: 0.8, label: '80%+' },
];

/** Every qualifying leg in a confidence band, plus one slip per market inside that band. */
export function tierSlips(legs) {
  const slips = [];
  for (const tier of TIERS) {
    const rows = (legs || []).filter((leg) => legRate(leg) + 1e-12 >= tier.min);
    if (!rows.length) continue;
    const ordered = rows.slice().sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.eventId.localeCompare(b.eventId) || a.market.localeCompare(b.market));
    slips.push({
      id: `tier:${tier.id}`,
      tier: tier.id,
      market: null,
      name: `${tier.label} all picks`,
      label: `${tier.label} all picks`,
      legs: ordered,
    });
    for (const group of trendGroups(ordered)) {
      const title = `${tier.label} ${labelFor(group.market)}`;
      slips.push({
        id: `tier:${tier.id}:${group.market}`,
        tier: tier.id,
        market: group.market,
        name: title,
        label: title,
        legs: group.legs,
      });
    }
  }
  return slips;
}

/** One trend per market with at least one qualifying leg, biggest first. */
export function trendGroups(legs) {
  const byMarket = new Map();
  for (const leg of legs) {
    if (!byMarket.has(leg.market)) byMarket.set(leg.market, []);
    byMarket.get(leg.market).push(leg);
  }
  return [...byMarket.entries()]
    .map(([market, rows]) => ({
      id: `80:${market}`,
      market,
      label: `80%+ ${labelFor(market)}`,
      legs: rows.slice().sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.eventId.localeCompare(b.eventId)),
    }))
    .sort((a, b) => b.legs.length - a.legs.length || a.label.localeCompare(b.label));
}

function legView(leg) {
  const form = Array.isArray(leg.form) ? leg.form.filter((mark) => mark === 'W' || mark === 'D' || mark === 'L').slice(0, 5) : [];
  return {
    eventId: leg.eventId,
    market: leg.market,
    match: leg.match,
    kickoff: leg.kickoff,
    odds: leg.odds,
    occurrence: leg.occurrence ?? null,
    sample: leg.sample ?? null,
    form: form.length ? form : null,
    opponentHeld: leg.opponentHeld === true ? true : null,
    opponentSample: leg.opponentSample || null,
    exception: leg.exception === true ? true : null,
    inRangeDesks: Array.isArray(leg.inRangeDesks) ? leg.inRangeDesks : null,
  };
}

/**
 * Book any slip whose desks are missing a valid code. Slips are keyed by their exact
 * selections, so a trend identical to the master slip shares its codes and is never
 * booked twice. A desk that keeps failing is retried at most MAX_ATTEMPTS times per hour.
 */
async function pool(jobs, limit) {
  const queue = jobs.slice();
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) await queue.shift()();
  });
  await Promise.all(workers);
}

function hasCode(books) {
  return Object.values(books || {}).some((book) => (book?.parts || []).some((part) => part?.code));
}

export async function bookSlips({ slips, cache = {}, book, now = Date.now(), gapMs = 0, pause, log = () => {}, onProgress = null, concurrency = 1 }) {
  const nextCache = { ...cache };
  const inflight = new Map();
  const issues = [];
  const results = new Array(slips.length);
  let booked = 0;
  const clockOf = typeof now === 'function' ? now : () => now;
  const list = Array.isArray(slips) ? slips : [];

  async function bookOne(slip, index) {
    const clock = clockOf();
    const open = bookableLegs(slip.legs, new Date(clock));
    const legs = codeLegs(open);
    const violations = rangeViolations(legs);
    if (violations.length) {
      const message = `${slip.name}: blocked, ${violations.length} legs outside the odds range.`;
      issues.push(message);
      log('error', message);
      results[index] = { ...slip, legs: open, key: '', books: {}, bookedAt: null };
      return;
    }
    try {
      assertBookingRanges(legs);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Range check blocked booking.';
      issues.push(`${slip.name}: ${message}`);
      log('error', message);
      results[index] = { ...slip, legs: open, key: '', books: {}, bookedAt: null };
      return;
    }
    const key = selectionKey(legs);
    if (!key) {
      results[index] = { ...slip, legs: open, key, books: {}, bookedAt: null };
      return;
    }
    let entry = nextCache[key] || { books: {}, attempts: {}, lastAttemptAt: 0, bookedAt: null };
    if (!cacheFresh(entry, legs)) entry = { books: {}, attempts: entry.attempts || {}, lastAttemptAt: 0, bookedAt: null };
    if (clock - (entry.lastAttemptAt || 0) > ATTEMPT_RESET_MS) entry = { ...entry, attempts: {} };
    const checked = inspectBooks(entry.books);
    for (const issue of checked.issues) issues.push(`${slip.name}: ${issue}`);
    const desks = checked.retry.filter((desk) => (entry.attempts[desk] || 0) < MAX_ATTEMPTS);
    if (desks.length && !inflight.has(key)) {
      booked += 1;
      const run = (async () => {
        if (booked > 1 && gapMs && pause && concurrency <= 1) await pause(gapMs);
        let books = checked.books;
        try {
          const fresh = await book(legs, desks);
          const again = inspectBooks({ ...books, ...fresh });
          books = again.books;
          const attempts = { ...entry.attempts };
          for (const desk of desks) attempts[desk] = again.retry.includes(desk) ? (attempts[desk] || 0) + 1 : 0;
          entry = { books, attempts, lastAttemptAt: clock, bookedAt: new Date(clock).toISOString() };
          const missing = again.retry.filter((desk) => desks.includes(desk));
          if (missing.length) {
            const message = `${slip.name}: no real code yet from ${missing.join(', ')}.`;
            issues.push(message);
            log('error', message);
          } else {
            log('log', `${slip.name}: booked ${legs.length} legs on ${desks.join(', ')}.`);
          }
        } catch (error) {
          const message = `${slip.name}: booking failed: ${error instanceof Error ? error.message : error}`;
          issues.push(message);
          log('error', message);
          entry = { ...entry, lastAttemptAt: clock };
        }
        nextCache[key] = entry;
        return entry;
      })();
      inflight.set(key, run);
      entry = await run;
    } else if (inflight.has(key)) {
      entry = await inflight.get(key);
    } else {
      entry = { ...entry, books: checked.books };
      nextCache[key] = entry;
    }
    results[index] = { ...slip, legs: open, key, books: entry.books, bookedAt: entry.bookedAt };
    if (onProgress && hasCode(entry.books)) onProgress({ results: results.filter(Boolean), cache: { ...nextCache }, issues: issues.slice() });
  }

  await pool(list.map((slip, index) => () => bookOne(slip, index)), Math.max(1, concurrency));
  return { results, cache: nextCache, issues };
}

export function slipView(slip, masterKey, now = Date.now()) {
  const projected = projectSlip(slip, now);
  const legs = projected?.legs || [];
  return {
    id: slip.id,
    name: slip.name,
    market: slip.market || null,
    label: slip.label || slip.name,
    legCount: legs.length,
    legs: legs.map(legView),
    sameAsMaster: Boolean(masterKey && slip.key === masterKey && slip.id !== 'master'),
    bookedAt: slip.bookedAt || null,
    books: projected?.books || slip.books,
  };
}
