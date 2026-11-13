/**
 * One slip per 80%+ market, plus the master slip. Each distinct slip is booked
 * once and reused until its legs change. Codes only ever come from the bookmakers.
 */
import { labelFor } from './occurrence.mjs';
import { inspectBooks } from './quality.mjs';
import { selectionKey } from './selection.mjs';

export const MIN_ODDS = 1.2;
const MAX_ATTEMPTS = 3;
const ATTEMPT_RESET_MS = 60 * 60 * 1000;

export function bookableLegs(legs, now = new Date()) {
  return (Array.isArray(legs) ? legs : []).filter(
    (leg) => new Date(leg.kickoff).getTime() >= now.getTime() && Number(leg.odds) >= MIN_ODDS && leg.status !== 'bust',
  );
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
  };
}

/**
 * Book any slip whose desks are missing a valid code. Slips are keyed by their exact
 * selections, so a trend identical to the master slip shares its codes and is never
 * booked twice. A desk that keeps failing is retried at most MAX_ATTEMPTS times per hour.
 */
export async function bookSlips({ slips, cache = {}, book, now = Date.now(), gapMs = 0, pause, log = () => {} }) {
  const nextCache = {};
  const issues = [];
  const results = [];
  let booked = 0;
  for (const slip of slips) {
    const key = selectionKey(slip.legs);
    if (!key) {
      results.push({ ...slip, key, books: {}, bookedAt: null });
      continue;
    }
    let entry = nextCache[key] || cache[key] || { books: {}, attempts: {}, lastAttemptAt: 0, bookedAt: null };
    if (now - (entry.lastAttemptAt || 0) > ATTEMPT_RESET_MS) entry = { ...entry, attempts: {} };
    const checked = inspectBooks(entry.books);
    for (const issue of checked.issues) issues.push(`${slip.name}: ${issue}`);
    const desks = checked.retry.filter((desk) => (entry.attempts[desk] || 0) < MAX_ATTEMPTS);
    let books = checked.books;
    if (desks.length && !nextCache[key]) {
      if (booked > 0 && gapMs && pause) await pause(gapMs);
      booked += 1;
      try {
        const fresh = await book(slip.legs, desks);
        const again = inspectBooks({ ...books, ...fresh });
        books = again.books;
        const attempts = { ...entry.attempts };
        for (const desk of desks) attempts[desk] = again.retry.includes(desk) ? (attempts[desk] || 0) + 1 : 0;
        entry = { books, attempts, lastAttemptAt: now, bookedAt: new Date(now).toISOString() };
        const missing = again.retry.filter((desk) => desks.includes(desk));
        if (missing.length) {
          const message = `${slip.name}: no real code yet from ${missing.join(', ')}.`;
          issues.push(message);
          log('error', message);
        } else {
          log('log', `${slip.name}: booked ${slip.legs.length} legs on ${desks.join(', ')}.`);
        }
      } catch (error) {
        const message = `${slip.name}: booking failed: ${error instanceof Error ? error.message : error}`;
        issues.push(message);
        log('error', message);
        entry = { ...entry, lastAttemptAt: now };
      }
    } else {
      entry = { ...entry, books };
    }
    nextCache[key] = entry;
    results.push({ ...slip, key, books: entry.books, bookedAt: entry.bookedAt });
  }
  return { results, cache: nextCache, issues };
}

export function slipView(slip, masterKey) {
  const legs = (slip.legs || []).filter((leg) => Number(leg.odds) >= MIN_ODDS);
  return {
    id: slip.id,
    name: slip.name,
    market: slip.market || null,
    label: slip.label || slip.name,
    legCount: legs.length,
    legs: legs.map(legView),
    sameAsMaster: Boolean(masterKey && slip.key === masterKey && slip.id !== 'master'),
    bookedAt: slip.bookedAt || null,
    books: slip.books,
  };
}
