/**
 * One slip per 80%+ market, plus the master slip. Each distinct slip is booked
 * once and reused until its legs change. Codes only ever come from the bookmakers.
 */
import { labelFor } from './occurrence.mjs';
import { assertBookingRanges, legOpen, projectSlip, rangeViolations, strictInRange } from './oddsRange.mjs';
import { inspectBooks } from './quality.mjs';
import { selectionKey } from './selection.mjs';

export { MIN_ODDS } from './oddsRange.mjs';
const MAX_ATTEMPTS = 3;
const ATTEMPT_RESET_MS = 60 * 60 * 1000;
/** One code on the master and trends. Tier parts use PART_SIZE. */
export const CODE_LIMIT = 18;
/** SportyBet accepts 50 selections. Tier and market slips are booked in blocks of this size. */
export const PART_SIZE = 50;
export const SLIP_CONCURRENCY = 4;

export function bookableLegs(legs, now = new Date()) {
  const clock = now instanceof Date ? now.getTime() : Number(now);
  return (Array.isArray(legs) ? legs : []).filter(
    (leg) => legOpen(leg, clock) && leg.status !== 'bust' && strictInRange(leg.market, leg.odds),
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

function byConfidence(a, b) {
  return legRate(b) - legRate(a) || String(a.kickoff).localeCompare(String(b.kickoff)) || String(a.eventId).localeCompare(String(b.eventId)) || String(a.market).localeCompare(String(b.market));
}

/** The legs that go on one code. Strict published band only, then the cap. */
export function codeLegs(legs, limit = CODE_LIMIT) {
  return (Array.isArray(legs) ? legs : [])
    .filter((leg) => strictInRange(leg?.market, leg?.odds))
    .slice()
    .sort(byConfidence)
    .slice(0, limit);
}

/**
 * 90%+ leads with the 90–99% band, then 100%.
 * 80%+ leads with the 80–89% band, then the higher bands.
 * Inside a band the best hit rate comes first, then the earliest kickoff.
 */
export function orderForTier(legs, tier) {
  const rows = (Array.isArray(legs) ? legs : []).filter((leg) => strictInRange(leg?.market, leg?.odds));
  const bandMax = tier === '90' ? 0.995 : tier === '80' ? 0.9 : null;
  if (bandMax == null) return rows.slice().sort(byConfidence);
  const priority = [];
  const higher = [];
  for (const leg of rows) (legRate(leg) + 1e-12 < bandMax ? priority : higher).push(leg);
  priority.sort(byConfidence);
  higher.sort(byConfidence);
  return [...priority, ...higher];
}

/** Blocks of 50. Only the last block is shorter, when fewer than 50 legs remain. */
export function packGroups(legs, size = PART_SIZE) {
  const groups = [];
  const rows = Array.isArray(legs) ? legs : [];
  const width = Math.max(1, size);
  for (let index = 0; index < rows.length; index += width) groups.push(rows.slice(index, index + width));
  return groups;
}

/** Every in-range leg on a tier, in that tier's order, packed into bookable codes. */
export function codeGroups(legs, tier) {
  return packGroups(orderForTier(legs, tier));
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

function mergeBooks(list) {
  const out = {};
  for (const books of list) {
    for (const [desk, book] of Object.entries(books || {})) {
      if (!book || typeof book !== 'object') continue;
      const prev = out[desk] || { parts: [], dropped: [], kept: [], error: null };
      const parts = [...(prev.parts || []), ...(book.parts || [])];
      out[desk] = {
        parts,
        dropped: [...(prev.dropped || []), ...(book.dropped || [])],
        kept: [...(prev.kept || []), ...(book.kept || [])],
        error: parts.length ? null : book.error || prev.error || null,
      };
    }
  }
  return out;
}

function reasonSummary(rows) {
  const counts = new Map();
  for (const row of rows || []) {
    const reason = String(row?.reason || 'unknown').replace(/\s+/g, ' ').trim().slice(0, 100) || 'unknown';
    counts.set(reason, (counts.get(reason) || 0) + 1);
  }
  if (!counts.size) return 'no drop recorded';
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([reason, count]) => `${count} × ${reason}`)
    .join('; ');
}

export async function bookSlips({ slips, cache = {}, book, now = Date.now(), gapMs = 0, pause, log = () => {}, onProgress = null, concurrency = 1 }) {
  const nextCache = { ...cache };
  const inflight = new Map();
  const issues = [];
  const results = new Array(slips.length);
  let booked = 0;
  const clockOf = typeof now === 'function' ? now : () => now;
  const list = Array.isArray(slips) ? slips : [];

  async function bookSelection(legs, label, allow) {
    const key = selectionKey(legs);
    if (!key) return { key, books: {}, bookedAt: null };
    const clock = clockOf();
    let entry = nextCache[key] || { books: {}, attempts: {}, lastAttemptAt: 0, bookedAt: null };
    if (!cacheFresh(entry, legs)) entry = { books: {}, attempts: entry.attempts || {}, lastAttemptAt: 0, bookedAt: null };
    if (clock - (entry.lastAttemptAt || 0) > ATTEMPT_RESET_MS) entry = { ...entry, attempts: {} };
    const checked = inspectBooks(entry.books);
    for (const issue of checked.issues) issues.push(`${label}: ${issue}`);
    const desks = checked.retry.filter((desk) => (entry.attempts[desk] || 0) < MAX_ATTEMPTS && (!allow || allow.includes(desk)));
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
            const message = `${label}: no real code yet from ${missing.join(', ')}.`;
            issues.push(message);
            log('error', message);
          } else {
            log('log', `${label}: booked ${legs.length} legs on ${desks.join(', ')}.`);
          }
        } catch (error) {
          const message = `${label}: booking failed: ${error instanceof Error ? error.message : error}`;
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
    return entry;
  }

  function logPawa(label, books) {
    const bookP = books?.betpawa;
    if (!bookP) return;
    const keptN = (bookP.kept || []).length;
    const scanned = Number(bookP.scanned) || (bookP.kept || []).length + (bookP.dropped || []).length;
    if (!scanned && !keptN) return;
    log('log', `${label}: betPawa kept ${keptN} of ${scanned} looked at. ${reasonSummary(bookP.dropped)}`);
  }

  async function bookOne(slip, index) {
    const clock = clockOf();
    const open = bookableLegs(slip.legs, new Date(clock));
    const groups = slip.tier ? codeGroups(open, slip.tier) : [codeLegs(open)];
    const flat = groups.flat();
    const violations = rangeViolations(flat);
    if (violations.length) {
      const message = `${slip.name}: blocked, ${violations.length} legs outside the odds range.`;
      issues.push(message);
      log('error', message);
      results[index] = { ...slip, legs: open, key: '', books: {}, bookedAt: null };
      return;
    }
    try {
      assertBookingRanges(flat);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Range check blocked booking.';
      issues.push(`${slip.name}: ${message}`);
      log('error', message);
      results[index] = { ...slip, legs: open, key: '', books: {}, bookedAt: null };
      return;
    }
    if (!flat.length) {
      results[index] = { ...slip, legs: open, key: '', books: {}, bookedAt: null };
      return;
    }
    if (!slip.tier) {
      const entry = await bookSelection(groups[0], slip.name);
      results[index] = { ...slip, legs: open, key: entry.key, books: entry.books, bookedAt: entry.bookedAt };
      if (onProgress && hasCode(entry.books)) onProgress({ results: results.filter(Boolean), cache: { ...nextCache }, issues: issues.slice() });
      return;
    }
    const pieces = [];
    let bookedAt = null;
    for (let part = 0; part < groups.length; part += 1) {
      const label = groups.length > 1 ? `${slip.name} part ${part + 1}/${groups.length}` : slip.name;
      const entry = await bookSelection(groups[part], label);
      logPawa(label, entry.books);
      pieces.push(entry.books);
      if (entry.bookedAt) bookedAt = entry.bookedAt;
      const books = mergeBooks(pieces);
      results[index] = { ...slip, legs: open, key: selectionKey(groups[0]), books, bookedAt };
      if (onProgress && hasCode(books)) onProgress({ results: results.filter(Boolean), cache: { ...nextCache }, issues: issues.slice() });
    }
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
