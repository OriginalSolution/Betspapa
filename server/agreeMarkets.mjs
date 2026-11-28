/**
 * A market agrees when both teams' last-10 rates clear 80% on at least 8 games.
 * The tier is the lower rate. 100% is a perfect 10 from 10. A green light does
 * not waive the odds band, and markets that are not the same priced line are
 * not booked.
 */
import { priceInRange } from './oddsRange.mjs';

export const AGREE_MIN_SAMPLE = 8;

const TIER_RANK = { '100': 3, '90': 2, '80': 1 };

/**
 * Priced lines whose definition matches the last-10 row.
 * Team 1X is that team's win or draw, so it is not home 1X.
 * Double chance 12 is a winner either side, which is the priced 12 line.
 */
const BOOKABLE = {
  over15: 'over15',
  over25: 'over25',
  over35: 'over35',
  btts: 'btts',
  dc12: 'dc-12',
  '1h05': 'fh-over05',
  '1h15': 'fh-over15',
};

const ODDS_KEY = {
  over15: 'over-15',
  over25: 'over-25',
  over35: 'over-35',
  btts: 'btts-yes',
  'dc-12': 'dc-12',
  'fh-over05': 'fh-over-05',
  'fh-over15': 'fh-over-15',
  'dc-1x': 'dc-1x',
  'dc-x2': 'dc-x2',
  'dnb-home': 'home-dnb',
  'dnb-away': 'away-dnb',
  'home-score': 'home-over-05',
  'away-score': 'away-over-05',
  'home-over15': 'home-over-15',
  'away-over15': 'away-over-15',
  'home-over25': 'home-over-25',
  'away-over25': 'away-over-25',
};

export function pricedMarket(marketId) {
  return BOOKABLE[String(marketId || '')] || null;
}

/** A priced engine market, only when the catalogue price is inside that market's band. */
export function quotePriced(market, odds) {
  const id = String(market || '');
  const key = ODDS_KEY[id];
  const value = Number(key ? odds?.[key] : NaN);
  if (!key || !priceInRange(id, value)) return null;
  return { market: id, odds: value };
}
export function quoteFor(marketId, odds) {
  const market = pricedMarket(marketId);
  const key = market ? ODDS_KEY[market] : '';
  const value = Number(key ? odds?.[key] : NaN);
  if (!market || !bookableAgreed({ marketId, odds: value })) return null;
  return { market, odds: value };
}

export function rateTier(hit, n) {
  const hits = Number(hit);
  const sample = Number(n);
  if (!Number.isFinite(hits) || !Number.isFinite(sample) || sample < AGREE_MIN_SAMPLE) return null;
  const rate = hits / sample;
  if (rate + 1e-12 < 0.8) return null;
  if (sample >= 10 && hits === sample) return '100';
  if (rate + 1e-12 >= 0.9) return '90';
  return '80';
}

function lowerTier(left, right) {
  const home = rateTier(left?.hit, left?.n);
  const away = rateTier(right?.hit, right?.n);
  if (!home || !away) return null;
  return TIER_RANK[home] <= TIER_RANK[away] ? home : away;
}

function byId(markets) {
  return new Map((markets || []).map((market) => [market.id, market]));
}

/** Agreed markets, strongest tier first, then the lower rate, then table order. */
export function agreedRows(homeMarkets, awayMarkets) {
  const away = byId(awayMarkets);
  const found = [];
  (homeMarkets || []).forEach((left, index) => {
    const right = away.get(left.id);
    const tier = lowerTier(left, right);
    if (!tier) return;
    const homeRate = left.hit / left.n;
    const awayRate = right.hit / right.n;
    found.push({
      id: left.id,
      label: left.label,
      tier,
      lower: Math.min(homeRate, awayRate),
      order: index,
      home: { hit: left.hit, n: left.n },
      away: { hit: right.hit, n: right.n },
    });
  });
  found.sort((a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier] || b.lower - a.lower || a.order - b.order);
  return found.map(({ order, ...row }) => row);
}

/** The closest market that one team clears and the other does not. */
export function nearestMiss(homeMarkets, awayMarkets) {
  const away = byId(awayMarkets);
  let best = null;
  for (const left of homeMarkets || []) {
    const right = away.get(left.id);
    if (!right || left.n < AGREE_MIN_SAMPLE || right.n < AGREE_MIN_SAMPLE) continue;
    if (lowerTier(left, right)) continue;
    const homeRate = left.hit / left.n;
    const awayRate = right.hit / right.n;
    const top = Math.max(homeRate, awayRate);
    const low = Math.min(homeRate, awayRate);
    if (top + 1e-12 < 0.8) continue;
    const candidate = {
      id: left.id,
      label: left.label,
      home: { hit: left.hit, n: left.n },
      away: { hit: right.hit, n: right.n },
      low,
    };
    if (!best || candidate.low > best.low) best = candidate;
  }
  if (!best) return null;
  return { id: best.id, label: best.label, home: best.home, away: best.away };
}

/**
 * An agreed row can be booked only when it is the same priced market and the
 * price is inside that market's band. Greenlit does not override a miss.
 */
export function bookableAgreed(row) {
  if (row?.blocked) return false;
  const market = BOOKABLE[String(row?.marketId || '')];
  if (!market) return false;
  return priceInRange(market, row?.odds, { market, sample: row?.sample, opponentSample: row?.opponentSample });
}
