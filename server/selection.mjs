/** SportyBet GH / Betradar selection ids used by the no-login share route. */
import { CATALOGUE_MARKETS } from './upcoming.mjs';

export const SELECTIONS = {
  home: { marketId: '1', outcomeId: '1', specifier: null },
  draw: { marketId: '1', outcomeId: '2', specifier: null },
  away: { marketId: '1', outcomeId: '3', specifier: null },
  'dc-1x': { marketId: '10', outcomeId: '9', specifier: null },
  'dc-12': { marketId: '10', outcomeId: '10', specifier: null },
  'dc-x2': { marketId: '10', outcomeId: '11', specifier: null },
  'dnb-home': { marketId: '11', outcomeId: '4', specifier: null },
  'dnb-away': { marketId: '11', outcomeId: '5', specifier: null },
  over05: { marketId: '18', outcomeId: '12', specifier: 'total=0.5' },
  over15: { marketId: '18', outcomeId: '12', specifier: 'total=1.5' },
  over25: { marketId: '18', outcomeId: '12', specifier: 'total=2.5' },
  over35: { marketId: '18', outcomeId: '12', specifier: 'total=3.5' },
  under15: { marketId: '18', outcomeId: '13', specifier: 'total=1.5' },
  under25: { marketId: '18', outcomeId: '13', specifier: 'total=2.5' },
  under35: { marketId: '18', outcomeId: '13', specifier: 'total=3.5' },
  btts: { marketId: '29', outcomeId: '74', specifier: null },
  'btts-no': { marketId: '29', outcomeId: '76', specifier: null },
  'home-score': { marketId: '19', outcomeId: '12', specifier: 'total=0.5' },
  'away-score': { marketId: '20', outcomeId: '12', specifier: 'total=0.5' },
  'home-over15': { marketId: '19', outcomeId: '12', specifier: 'total=1.5' },
  'home-over25': { marketId: '19', outcomeId: '12', specifier: 'total=2.5' },
  'home-under15': { marketId: '19', outcomeId: '13', specifier: 'total=1.5' },
  'away-over15': { marketId: '20', outcomeId: '12', specifier: 'total=1.5' },
  'away-over25': { marketId: '20', outcomeId: '12', specifier: 'total=2.5' },
  'away-under15': { marketId: '20', outcomeId: '13', specifier: 'total=1.5' },
  'home-clean': { marketId: '31', outcomeId: '74', specifier: null },
  'away-clean': { marketId: '32', outcomeId: '74', specifier: null },
  'fh-home': { marketId: '60', outcomeId: '1', specifier: null },
  'fh-draw': { marketId: '60', outcomeId: '2', specifier: null },
  'fh-away': { marketId: '60', outcomeId: '3', specifier: null },
  'fh-over05': { marketId: '68', outcomeId: '12', specifier: 'total=0.5' },
  'fh-over15': { marketId: '68', outcomeId: '12', specifier: 'total=1.5' },
  'sh-over05': { marketId: '90', outcomeId: '12', specifier: 'total=0.5' },
  'corners-over75': { marketId: '166', outcomeId: '12', specifier: 'total=7.5' },
  'corners-over85': { marketId: '166', outcomeId: '12', specifier: 'total=8.5' },
  'corners-over95': { marketId: '166', outcomeId: '12', specifier: 'total=9.5' },
  'corners-over105': { marketId: '166', outcomeId: '12', specifier: 'total=10.5' },
  'corners-under95': { marketId: '166', outcomeId: '13', specifier: 'total=9.5' },
  'corners-under105': { marketId: '166', outcomeId: '13', specifier: 'total=10.5' },
  'cards-over35': { marketId: '800063', outcomeId: '800063:00000004', specifier: null },
  'cards-over45': { marketId: '800063', outcomeId: '800063:00000005', specifier: null },
};

const EVENT_ID = /^sr:match:\d+$/;

export function toSelection(leg) {
  if (!leg || !EVENT_ID.test(String(leg.eventId || ''))) return null;
  const mapped = SELECTIONS[leg.market];
  if (!mapped) return null;
  const odds = Number(leg.odds);
  const match = String(leg.match || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  return {
    eventId: String(leg.eventId),
    marketId: mapped.marketId,
    outcomeId: mapped.outcomeId,
    specifier: mapped.specifier,
    market: String(leg.market),
    odds: Number.isFinite(odds) && odds > 1 ? odds : 1,
    match,
    sample: leg.sample,
    rate: leg.rate,
    occurrence: leg.occurrence,
    opponentHeld: leg.opponentHeld === true,
  };
}

export function selectionKey(legs) {
  return legs
    .map(toSelection)
    .filter(Boolean)
    .map((leg) => `${leg.eventId}|${leg.marketId}|${leg.specifier || ''}|${leg.outcomeId}`)
    .sort()
    .join('\n');
}

export function offerKey(leg) {
  return `${leg.eventId}|${leg.marketId}|${leg.specifier || ''}|${leg.outcomeId}`;
}

/**
 * Keep a leg when the scan has not seen the match, or when that exact outcome is active.
 * A market the list never returns (corners, cards) is left for the bookmaker to accept or refuse.
 */
export function stillOffered(index, leg) {
  if (!index || index.events.size === 0 || !index.events.has(leg.eventId)) return true;
  if (index.markets && !index.markets.has(String(leg.marketId))) return true;
  return index.keys.has(offerKey(leg));
}

const UPCOMING = `https://www.sportybet.com/api/gh/factsCenter/pcUpcomingEvents?sportId=sr%3Asport%3A1&marketId=${encodeURIComponent(CATALOGUE_MARKETS)}&pageSize=100&pageNum=`;

export async function loadOfferIndex(request) {
  const keys = new Set();
  const events = new Set();
  const markets = new Set();
  for (let page = 1; page <= 20; page += 1) {
    const body = await request('GET', `${UPCOMING}${page}&option=1`, {});
    const data = body?.data || {};
    const list = (data.tournaments || []).flatMap((tournament) => tournament.events || []);
    if (!list.length) break;
    for (const event of list) {
      if (!event?.eventId) continue;
      events.add(event.eventId);
      for (const market of event.markets || []) {
        markets.add(String(market.id));
        const specifier = market.specifier || '';
        for (const outcome of market.outcomes || []) {
          if (outcome.isActive === 0) continue;
          keys.add(`${event.eventId}|${String(market.id)}|${specifier}|${String(outcome.id)}`);
        }
      }
    }
    if (events.size >= Number(data.totalNum || 0)) break;
  }
  return { keys, events, markets };
}
