/** SportyBet market walkers. Outcome ids are copied from the live object. */

const OPEN = new Set(['not start', 'not started', '', '0']);

export function walkMarkets(data) {
  const out = [];
  const seen = new Set();
  const walk = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    if (seen.has(obj)) return;
    seen.add(obj);
    if (!Array.isArray(obj) && Array.isArray(obj.outcomes) && (obj.id != null || obj.marketId != null)) out.push(obj);
    for (const value of Object.values(obj)) {
      if (value && typeof value === 'object') walk(value);
    }
  };
  try {
    walk(data);
  } catch {
    /* one cyclic event must not stop the book */
  }
  return out;
}

function hcpVal(spec) {
  const found = String(spec || '').match(/hcp=([+-]?\d+(?:\.\d+)?)/i);
  return found ? Number(found[1]) : null;
}

function priceOf(outcome) {
  const price = Number(outcome?.odds);
  return Number.isFinite(price) ? price : 0;
}

function live(outcome) {
  return outcome && outcome.isActive !== 0 && priceOf(outcome) > 1;
}

export function findAhMinus1(data) {
  const found = [];
  for (const market of walkMarkets(data)) {
    if (String(market.id ?? market.marketId) !== '16') continue;
    const hcp = hcpVal(market.specifier || '');
    for (const outcome of market.outcomes || []) {
      if (!live(outcome)) continue;
      const desc = String(outcome.desc || '').trim();
      const lower = desc.toLowerCase();
      const odds = priceOf(outcome);
      const lineInText = /(?:^|\s)-1(?:\.0)?(?:\s|$)/.test(desc) && !/-1\.[25]/.test(desc);
      if ((hcp != null && Math.abs(hcp - -1) < 1e-9 && lower.startsWith('home')) || (lineInText && lower.startsWith('home'))) {
        found.push({ side: 'H', price: odds, market, outcome });
      }
      if ((hcp != null && Math.abs(hcp - 1) < 1e-9 && lower.startsWith('away')) || (lineInText && lower.startsWith('away'))) {
        found.push({ side: 'A', price: odds, market, outcome });
      }
    }
  }
  if (!found.length) return null;
  found.sort((a, b) => a.price - b.price);
  const best = found[0];
  return {
    side: best.side,
    price: best.price,
    spec: best.market.specifier || '',
    oid: String(best.outcome.id),
    desc: best.outcome.desc || '',
  };
}

function findMkt(data, mid, spec, pred) {
  for (const market of walkMarkets(data)) {
    if (String(market.id ?? market.marketId) !== String(mid)) continue;
    const mspec = market.specifier || '';
    if (spec != null && mspec !== spec) continue;
    for (const outcome of market.outcomes || []) {
      if (!live(outcome)) continue;
      const desc = outcome.desc || '';
      if (pred && !pred(desc)) continue;
      return {
        mid: String(mid),
        spec: mspec,
        oid: String(outcome.id),
        desc,
        price: priceOf(outcome),
      };
    }
  }
  return null;
}

function sidePred(side) {
  const word = side === 'H' ? 'home' : 'away';
  return (desc) => String(desc || '').toLowerCase().startsWith(word);
}

export function find1x2(data, side) {
  const pred = sidePred(side);
  return findMkt(data, '1', '', pred) || findMkt(data, '1', null, pred);
}

export function find2up(data, side) {
  const pred = sidePred(side);
  return findMkt(data, '60100', '', pred) || findMkt(data, '60100', null, pred);
}

export function find1up(data, side) {
  const pred = sidePred(side);
  return findMkt(data, '60200', '', pred) || findMkt(data, '60200', null, pred);
}

export function findO25(data) {
  return findMkt(data, '18', 'total=2.5', (desc) => String(desc || '').toLowerCase().startsWith('over'));
}

export function findOver15(data) {
  return findMkt(data, '18', 'total=1.5', (desc) => String(desc || '').toLowerCase().startsWith('over'));
}

export function findUnder45(data) {
  return findMkt(data, '18', 'total=4.5', (desc) => String(desc || '').toLowerCase().startsWith('under'));
}

export function findTeamO15(data, side) {
  const mid = side === 'H' ? '19' : '20';
  return findMkt(data, mid, 'total=1.5', (desc) => String(desc || '').toLowerCase().startsWith('over'));
}

export function isOpenStatus(status) {
  return OPEN.has(String(status ?? '').trim().toLowerCase());
}

export function marketLabel(marketId, desc, side, specifier = '') {
  const id = String(marketId);
  const who = side === 'A' ? 'Away' : side === 'H' ? 'Home' : '';
  const line = String(specifier || '');
  if (id === '60100') return `${who} 2UP`.trim();
  if (id === '60200') return `${who} 1UP`.trim();
  if (id === '18' && line.includes('1.5')) return 'Over 1.5';
  if (id === '18' && line.includes('4.5')) return String(desc || '').toLowerCase().startsWith('under') ? 'Under 4.5' : 'Over 4.5';
  if (id === '18') return 'Over 2.5';
  if (id === '19') return 'Home 2+';
  if (id === '20') return 'Away 2+';
  if (id === '16') return `${who} AH −1`.trim();
  if (id === '800054') {
    const line = String(desc || '').trim();
    return line ? `${line} outside box` : 'Shots outside box';
  }
  return desc || id;
}

export function sideOf(desc, outcomeId) {
  const lower = String(desc || '').toLowerCase();
  if (lower.startsWith('home')) return 'H';
  if (lower.startsWith('away')) return 'A';
  if (String(outcomeId) === '1') return 'H';
  if (String(outcomeId) === '3') return 'A';
  return '';
}

/** Grade key used by the results tracker. Empty when this is not a Banker market. */
export function gradeKey(marketId, side, specifier = '') {
  const id = String(marketId);
  const line = String(specifier || '');
  if (id === '60100') return side === 'A' ? '2up-away' : '2up-home';
  if (id === '60200') return side === 'A' ? '1up-away' : '1up-home';
  if (id === '18' && line.includes('1.5')) return 'over15';
  if (id === '18') return 'over25';
  if (id === '19') return 'home-over15';
  if (id === '20') return 'away-over15';
  if (id === '16') return side === 'A' ? 'ah-1-away' : 'ah-1-home';
  if (id === '800054') return 'outside-box';
  return '';
}
