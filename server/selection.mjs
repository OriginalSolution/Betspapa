/** SportyBet GH / Betradar selection ids used by the no-login share route.
 * Confirmed against factsCenter markets: 1 = 1X2, 18 = totals, 19/20 = team totals, 29 = both teams to score.
 */

export const SELECTIONS = {
  home: { marketId: '1', outcomeId: '1', specifier: null },
  draw: { marketId: '1', outcomeId: '2', specifier: null },
  away: { marketId: '1', outcomeId: '3', specifier: null },
  over15: { marketId: '18', outcomeId: '12', specifier: 'total=1.5' },
  over25: { marketId: '18', outcomeId: '12', specifier: 'total=2.5' },
  over35: { marketId: '18', outcomeId: '12', specifier: 'total=3.5' },
  under25: { marketId: '18', outcomeId: '13', specifier: 'total=2.5' },
  btts: { marketId: '29', outcomeId: '74', specifier: null },
  'btts-no': { marketId: '29', outcomeId: '76', specifier: null },
  'home-score': { marketId: '19', outcomeId: '12', specifier: 'total=0.5' },
  'away-score': { marketId: '20', outcomeId: '12', specifier: 'total=0.5' },
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
    odds: Number.isFinite(odds) && odds > 1 ? odds : 1,
    match,
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

/** Keep a leg when the scan has not seen the match, or when that exact outcome is active. */
export function stillOffered(index, leg) {
  if (!index || index.events.size === 0 || !index.events.has(leg.eventId)) return true;
  return index.keys.has(offerKey(leg));
}

const UPCOMING = 'https://www.sportybet.com/api/gh/factsCenter/pcUpcomingEvents?sportId=sr%3Asport%3A1&marketId=1%2C18%2C19%2C20%2C29&pageSize=100&pageNum=';

export async function loadOfferIndex(request) {
  const keys = new Set();
  const events = new Set();
  for (let page = 1; page <= 20; page += 1) {
    const body = await request('GET', `${UPCOMING}${page}&option=1`, {});
    const data = body?.data || {};
    const list = (data.tournaments || []).flatMap((tournament) => tournament.events || []);
    if (!list.length) break;
    for (const event of list) {
      if (!event?.eventId) continue;
      events.add(event.eventId);
      for (const market of event.markets || []) {
        const specifier = market.specifier || '';
        for (const outcome of market.outcomes || []) {
          if (outcome.isActive === 0) continue;
          keys.add(`${event.eventId}|${String(market.id)}|${specifier}|${String(outcome.id)}`);
        }
      }
    }
    if (events.size >= Number(data.totalNum || 0)) break;
  }
  return { keys, events };
}
