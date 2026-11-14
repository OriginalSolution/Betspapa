/**
 * One odds table for every pick, tip, slip, flyer, notification, and booked leg.
 * Ranges are inclusive. A market that is not listed is not shown and not booked.
 * A 100% record whose opponent also agrees may use a ceiling of 1.60.
 */

export const PERFECT_CEILING = 1.6;
/** How far a catalogue price may sit outside the band before other books are not asked. */
const NEAR_SLACK = 0.12;

export const DESKS = ['sportybet', 'footballcom', 'msport', 'betika', 'betpawa'];

/** Catalogue desks quote the same price the engine already stored on the leg. */
const CATALOGUE_DESKS = new Set(['sportybet', 'footballcom']);

export const ODDS_RANGES = {
  home: { min: 1.2, max: 1.49 },
  away: { min: 1.2, max: 1.49 },
  'home-over15': { min: 1.2, max: 1.49 },
  'away-over15': { min: 1.2, max: 1.49 },
  'dnb-home': { min: 1.2, max: 1.33 },
  'dnb-away': { min: 1.2, max: 1.33 },
  'dc-1x': { min: 1.2, max: 1.33 },
  'dc-x2': { min: 1.2, max: 1.33 },
  over15: { min: 1.2, max: 1.3 },
  under15: { min: 1.2, max: 1.3 },
  over25: { min: 1.2, max: 1.49 },
  under25: { min: 1.2, max: 1.49 },
  over35: { min: 1.2, max: 1.6 },
  under35: { min: 1.2, max: 1.6 },
  btts: { min: 1.2, max: 1.49 },
  'btts-no': { min: 1.2, max: 1.49 },
  'home-score': { min: 1.18, max: 1.3 },
  'away-score': { min: 1.18, max: 1.3 },
  'fh-over05': { min: 1.18, max: 1.25 },
  'fh-over15': { min: 1.2, max: 1.8, maxExclusive: true },
  'sh-over05': { min: 1.18, max: 1.25 },
  'dc-12': { min: 1.18, max: 1.25 },
};

/** Lowest listed floor. */
export const MIN_ODDS = Math.min(...Object.values(ODDS_RANGES).map((range) => range.min));

export function listedMarket(market) {
  return Object.prototype.hasOwnProperty.call(ODDS_RANGES, String(market || ''));
}

/** 100% on the backed side, and the opponent's recent record agrees. */
export function perfectRecord(leg) {
  if (!leg || leg.opponentHeld !== true) return false;
  const sample = String(leg.sample || '').match(/^(\d+)\s*\/\s*(\d+)$/);
  if (sample && Number(sample[2]) > 0 && Number(sample[1]) === Number(sample[2])) return true;
  const rate = Number(leg.rate);
  if (Number.isFinite(rate) && (rate > 1 ? rate / 100 : rate) + 1e-12 >= 0.995) return true;
  const occurrence = Number(leg.occurrence);
  if (Number.isFinite(occurrence) && occurrence + 1e-9 >= 99.5) return true;
  return false;
}

function ceiling(range, leg) {
  if (range.max == null) return { max: null, exclusive: false };
  if (perfectRecord(leg) && range.max < PERFECT_CEILING) return { max: PERFECT_CEILING, exclusive: false };
  return { max: range.max, exclusive: Boolean(range.maxExclusive) };
}

export function priceInRange(market, price, leg) {
  const range = ODDS_RANGES[String(market || '')];
  if (!range) return false;
  const value = Number(price);
  if (!Number.isFinite(value) || value <= 1) return false;
  if (value + 1e-9 < range.min) return false;
  const cap = ceiling(range, leg);
  if (cap.max == null) return true;
  if (cap.exclusive) return value < cap.max - 1e-9;
  return value <= cap.max + 1e-9;
}

/** Close enough that another book might still price the leg inside the band. */
export function priceNearRange(market, price, leg) {
  if (priceInRange(market, price, leg)) return false;
  const range = ODDS_RANGES[String(market || '')];
  if (!range) return false;
  const value = Number(price);
  if (!Number.isFinite(value) || value <= 1) return false;
  const cap = ceiling(range, leg);
  const max = (cap.max ?? range.max) + NEAR_SLACK;
  return value + 1e-9 >= range.min - NEAR_SLACK && value <= max + 1e-9;
}

export function rangeReason(market, price) {
  const range = ODDS_RANGES[String(market || '')];
  const shown = Number.isFinite(Number(price)) ? Number(price).toFixed(2) : 'missing';
  if (!range) return `${shown} is on a market that is not priced.`;
  const top = range.maxExclusive ? `under ${range.max.toFixed(2)}` : range.max.toFixed(2);
  return `${shown} is outside ${range.min.toFixed(2)}–${top}.`;
}

export function legOpen(leg, now = Date.now()) {
  const clock = now instanceof Date ? now.getTime() : Number(now);
  const kick = Date.parse(leg?.kickoff || '');
  return Number.isFinite(kick) && kick >= clock;
}

function keptPrices(slip, leg) {
  const rows = [];
  for (const desk of DESKS) {
    const book = slip?.books?.[desk];
    const kept = (book?.kept || []).find((item) => item?.eventId === leg.eventId && item?.market === leg.market);
    const price = Number(kept?.odds);
    if (Number.isFinite(price) && priceInRange(leg.market, price, leg)) rows.push({ desk, odds: Math.round(price * 100) / 100 });
  }
  return rows;
}

function shownLeg(slip, leg) {
  const kept = keptPrices(slip, leg);
  if (priceInRange(leg.market, leg.odds, leg)) {
    const dropped = new Set();
    for (const desk of DESKS) {
      const book = slip?.books?.[desk];
      if ((book?.dropped || []).some((item) => item?.eventId === leg.eventId && (item.market == null || item.market === leg.market))) dropped.add(desk);
    }
    const desks = DESKS.filter((desk) => {
      if (dropped.has(desk)) return false;
      if (kept.some((row) => row.desk === desk)) return true;
      return CATALOGUE_DESKS.has(desk);
    });
    return { ...leg, odds: Math.round(Number(leg.odds) * 100) / 100, inRangeDesks: desks };
  }
  if (!kept.length) return null;
  return { ...leg, odds: kept[0].odds, inRangeDesks: kept.map((row) => row.desk) };
}

/** Legs and codes a reader is allowed to see at this moment. */
export function projectSlip(slip, now = Date.now()) {
  if (!slip) return slip;
  const clock = now instanceof Date ? now.getTime() : Number(now);
  const legs = [];
  for (const leg of slip.legs || []) {
    if (!legOpen(leg, clock)) continue;
    const shown = shownLeg(slip, leg);
    if (shown) legs.push(shown);
  }
  const openIds = new Set(legs.map((leg) => leg.eventId));
  const removed = legs.length !== (slip.legs || []).length;
  const books = {};
  for (const [desk, book] of Object.entries(slip.books || {})) {
    if (!book || typeof book !== 'object') continue;
    const parts = (book.parts || []).filter((part) => {
      const matches = Array.isArray(part?.matches) ? part.matches : null;
      if (matches && matches.length) return matches.every((id) => openIds.has(id));
      const count = Number(part?.legs);
      if (Number.isFinite(count) && count > legs.length) return false;
      if (removed) return false;
      return true;
    });
    books[desk] = {
      ...book,
      parts,
      error: parts.length ? null : book.error || null,
      dropped: Array.isArray(book.dropped) ? book.dropped : [],
      kept: Array.isArray(book.kept) ? book.kept : [],
    };
  }
  return { ...slip, legs, legCount: legs.length, books };
}

export function projectBoard(state, now = Date.now()) {
  if (!state) return state;
  const clock = now instanceof Date ? now.getTime() : Number(now);
  return {
    ...state,
    master: projectSlip(state.master, clock),
    trends: (state.trends || []).map((slip) => projectSlip(slip, clock)),
    tiers: (state.tiers || []).map((slip) => projectSlip(slip, clock)),
  };
}

function slipList(state) {
  return [state?.master, ...(state?.trends || []), ...(state?.tiers || [])].filter(Boolean);
}

/** True when the stored board still has a kicked-off or out-of-range leg, or a code that contains one. */
export function boardDirty(state, now = Date.now()) {
  const clock = now instanceof Date ? now.getTime() : Number(now);
  for (const slip of slipList(state)) {
    const next = projectSlip(slip, clock);
    if ((next?.legs || []).length !== (slip.legs || []).length) return true;
    for (const desk of DESKS) {
      const before = slip.books?.[desk]?.parts?.length || 0;
      const after = next?.books?.[desk]?.parts?.length || 0;
      if (before !== after) return true;
    }
  }
  return false;
}
