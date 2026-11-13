/** Checks stored share codes and settlement, and says what to rebook. Never mints a code. */

export const DESKS = ['sportybet', 'footballcom', 'msport', 'betika', 'betpawa'];

const CODE = /^[A-Za-z0-9]{4,16}$/;
const HOSTS = {
  sportybet: 'https://www.sportybet.com/',
  footballcom: 'https://www.football.com/',
  msport: 'https://www.msport.com/',
  betika: 'https://betika.com/',
  betpawa: 'https://www.betpawa.com.gh/',
};

export function validPart(desk, part) {
  if (!part || typeof part.code !== 'string' || !CODE.test(part.code)) return false;
  const link = String(part.link || '');
  const host = HOSTS[desk];
  return Boolean(host) && link.startsWith(host);
}

export function inspectBooks(books) {
  const retry = [];
  const issues = [];
  const clean = {};
  for (const desk of DESKS) {
    const book = books?.[desk];
    const parts = (book?.parts || []).filter((part) => validPart(desk, part));
    const dropped = (book?.parts || []).length - parts.length;
    if (dropped) issues.push(`${desk} had ${dropped} invalid code(s) removed.`);
    if (!parts.length) {
      retry.push(desk);
      clean[desk] = { parts: [], error: book?.error || 'No valid share code.', dropped: Array.isArray(book?.dropped) ? book.dropped : [] };
    } else {
      clean[desk] = { parts, error: null, dropped: Array.isArray(book?.dropped) ? book.dropped : [] };
    }
  }
  if (books && 'betway' in books) issues.push('Betway is not a no-login desk and was ignored.');
  return { books: clean, retry, issues };
}

function scoreLeg(market, home, away, finished) {
  const total = home + away;
  if (market === 'over15') return total >= 2 ? 'won' : finished ? 'bust' : 'open';
  if (market === 'over25') return total >= 3 ? 'won' : finished ? 'bust' : 'open';
  if (market === 'over35') return total >= 4 ? 'won' : finished ? 'bust' : 'open';
  if (market === 'under25') return total >= 3 ? 'bust' : finished ? 'won' : 'open';
  if (market === 'btts') return home > 0 && away > 0 ? 'won' : finished ? 'bust' : 'open';
  if (market === 'btts-no') return home > 0 && away > 0 ? 'bust' : finished ? 'won' : 'open';
  if (market === 'home-score') return home > 0 ? 'won' : finished ? 'bust' : 'open';
  if (market === 'away-score') return away > 0 ? 'won' : finished ? 'bust' : 'open';
  if (market === 'home') return finished ? (home > away ? 'won' : 'bust') : 'open';
  if (market === 'away') return finished ? (away > home ? 'won' : 'bust') : 'open';
  if (market === 'draw') return finished ? (home === away ? 'won' : 'bust') : 'open';
  return 'open';
}

export function slipStatus(legs) {
  if (!legs.length) return 'open';
  if (legs.some((leg) => leg.status === 'bust')) return 'bust';
  if (legs.every((leg) => leg.status === 'won')) return 'won';
  return 'open';
}

/** Correct a stored won/lost mark when the scores say otherwise. Leaves a leg open when there is no score. */
export function repairSettlement(legs) {
  const issues = [];
  const next = (Array.isArray(legs) ? legs : []).map((leg) => {
    const home = Number(leg?.homeScore);
    const away = Number(leg?.awayScore);
    if (!Number.isFinite(home) || !Number.isFinite(away)) return { ...leg };
    const status = scoreLeg(leg.market, home, away, Boolean(leg.finished));
    if (status !== 'open' && leg.status !== status) {
      issues.push(`${leg.match || leg.eventId} ${leg.market} was ${leg.status || 'unset'} and is ${status}.`);
      return { ...leg, status };
    }
    if ((leg.status === 'won' || leg.status === 'bust') && status === 'open') {
      issues.push(`${leg.match || leg.eventId} ${leg.market} was ${leg.status} without a finished score.`);
      return { ...leg, status: 'open' };
    }
    return { ...leg, status: leg.status || 'open' };
  });
  return { legs: next, issues, status: slipStatus(next), changed: issues.length > 0 };
}
