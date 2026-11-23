/** Read a Ghana share code back. Booking is a separate, opt-in call. */
import { BOOK_MARKETS, FOOTBALL_SHARE, SPORTY_SHARE } from './bankerConfig.mjs';
import { gradeKey, isOpenStatus, marketLabel, sideOf } from './bankerMarkets.mjs';
import { bookResult } from './bankerGrade.mjs';

export function crestUrl(id) {
  const found = String(id || '').match(/(\d+)$/);
  return found ? `https://api.betspapa.com/crests/id/${found[1]}.png` : '';
}

export function selectionKey(leg) {
  return `${leg.eventId}|${leg.marketId}|${leg.specifier || ''}|${leg.outcomeId}`;
}

export function sameSelections(left, right) {
  if (!left?.length || left.length !== right?.length) return false;
  const keys = new Set(left.map(selectionKey));
  if (keys.size !== left.length) return false;
  return right.every((leg) => keys.has(selectionKey(leg)));
}

function scoreText(value) {
  const text = String(value || '');
  const found = text.match(/(\d+)\s*[:\-]\s*(\d+)/);
  return found ? `${found[1]}-${found[2]}` : '';
}

export function parseShare(code, body) {
  const data = body?.data || {};
  const share = String(data.shareCode || '');
  const legs = [];
  for (const event of data.outcomes || []) {
    const status = String(event.matchStatus || event.status || '');
    const home = event.homeTeamName || '';
    const away = event.awayTeamName || '';
    const kickMs = Number(event.estimateStartTime) || 0;
    for (const market of event.markets || []) {
      const marketId = String(market.id || market.marketId || '');
      for (const outcome of market.outcomes || []) {
        const odds = Number(outcome.odds);
        const side = sideOf(outcome.desc, outcome.id);
        const winning = bookResult(outcome.isWinning);
        legs.push({
          eventId: String(event.eventId || ''),
          home,
          away,
          homeId: event.homeTeamId || '',
          awayId: event.awayTeamId || '',
          homeCrest: crestUrl(event.homeTeamId),
          awayCrest: crestUrl(event.awayTeamId),
          marketId,
          specifier: market.specifier || '',
          outcomeId: String(outcome.id || ''),
          label: marketLabel(marketId, outcome.desc, side),
          side,
          grade: gradeKey(marketId, side),
          odds: Number.isFinite(odds) ? odds : 0,
          status,
          open: isOpenStatus(status) && outcome.isActive !== 0 && odds > 1,
          kickMs,
          score: scoreText(event.setScore),
          bookResult: winning,
        });
      }
    }
  }
  const allowed = legs.length > 0 && legs.every((leg) => BOOK_MARKETS.has(leg.marketId) && leg.grade);
  const matched = share.toUpperCase() === String(code || '').toUpperCase();
  return {
    ok: body?.bizCode === 10000 && matched && allowed,
    bizCode: body?.bizCode ?? null,
    code: matched ? share : '',
    legs,
    reason: body?.bizCode !== 10000 ? 'readback refused' : !matched ? 'code mismatch' : !legs.length ? 'no legs' : !allowed ? 'market not in the Banker list' : '',
  };
}

export function shareUrl(base, code) {
  const stamp = Date.now();
  return `${base}/${encodeURIComponent(code)}?_t=${stamp}`;
}

export async function readDesk(request, base, code) {
  if (base !== SPORTY_SHARE && base !== FOOTBALL_SHARE) return parseShare(code, {});
  return parseShare(code, await request('GET', shareUrl(base, code)));
}

export async function readCode(request, code) {
  const sporty = parseShare(code, await request('GET', shareUrl(SPORTY_SHARE, code)));
  let football = null;
  if (sporty.ok) {
    const other = parseShare(code, await request('GET', shareUrl(FOOTBALL_SHARE, code)));
    if (other.ok && sameSelections(sporty.legs, other.legs)) football = { code: other.code, ok: true };
  }
  return { sporty, football };
}

export function bookBody(legs) {
  return {
    selections: legs.map((leg) => ({
      eventId: leg.eventId,
      marketId: String(leg.marketId),
      specifier: leg.specifier || null,
      outcomeId: String(leg.outcomeId),
    })),
  };
}

/** POST one share code. Only the two Ghana desks. Never a stake, never another book. */
export async function bookShare(request, base, legs) {
  if (base !== SPORTY_SHARE && base !== FOOTBALL_SHARE) return { code: '', status: 'desk not used for Banker codes' };
  if (!legs.length) return { code: '', status: 'empty' };
  if (legs.length > 50) return { code: '', status: 'over 50 legs' };
  if (legs.some((leg) => !BOOK_MARKETS.has(String(leg.marketId)))) return { code: '', status: 'market not allowed' };
  const body = await request('POST', base, { body: bookBody(legs) });
  if (body?.bizCode !== 10000 || !body?.data?.shareCode) return { code: '', status: body?.message || 'refused' };
  return { code: String(body.data.shareCode), status: 'ok' };
}
