/**
 * Team-to-score, draw-no-bet, and double chance 1X/X2 back the side that is
 * higher on the league table. A missing or level table skips the leg.
 * Strategy codes do not use this module. A green light does not keep a weaker side.
 */

/** Lower position number is higher on the table. Level or missing positions do not pick a side. */
export function strongerSide(homePos, awayPos) {
  const home = Number(homePos);
  const away = Number(awayPos);
  if (!Number.isInteger(home) || !Number.isInteger(away) || home < 1 || away < 1) return null;
  if (home === away) return null;
  return home < away ? 'home' : 'away';
}

const SIDE = {
  'home-score': 'home',
  'away-score': 'away',
  'home-over15': 'home',
  'away-over15': 'away',
  'home-over25': 'home',
  'away-over25': 'away',
  'dnb-home': 'home',
  'dnb-away': 'away',
  'dc-1x': 'home',
  'dc-x2': 'away',
};

export function backedSide(market) {
  return SIDE[String(market || '')] || null;
}

/**
 * Match lines stay. A side line stays only when that side is strictly higher
 * on the table. `greenlit` is ignored.
 */
export function sideAllowed(market, homePos, awayPos, flags = {}) {
  void flags?.greenlit;
  const side = backedSide(market);
  if (!side) return { keep: true, side: null, reason: '' };
  const stronger = strongerSide(homePos, awayPos);
  if (!stronger) return { keep: false, side, reason: 'no league table, so the side was not guessed' };
  if (side !== stronger) return { keep: false, side, reason: `${stronger} is higher on the table` };
  return { keep: true, side, reason: '' };
}

/** Both-agree rows that describe one side. dcx2 here is "failed to win", so it is not offered. */
const AGREE_SIDE = {
  dc1x: { home: 'Double chance 1X', away: 'Double chance X2' },
  dnb: { home: 'Draw no bet · home', away: 'Draw no bet · away' },
  team15: { home: 'Home over 1.5', away: 'Away over 1.5' },
  scored: { home: 'Home to score', away: 'Away to score' },
};

const AGREE_ENGINE = {
  dc1x: { home: 'dc-1x', away: 'dc-x2' },
  dnb: { home: 'dnb-home', away: 'dnb-away' },
  team15: { home: 'home-over15', away: 'away-over15' },
  scored: { home: 'home-score', away: 'away-score' },
};

export function agreeEngineMarket(id, side) {
  return AGREE_ENGINE[id]?.[side] || null;
}

export function agreeSideOffers(markets, side) {
  const out = [];
  for (const market of markets || []) {
    const names = AGREE_SIDE[market?.id];
    if (!names) {
      if (market?.id === 'dcx2') continue;
      out.push(market);
      continue;
    }
    if (side !== 'home' && side !== 'away') continue;
    out.push({ ...market, label: names[side], side });
  }
  return out;
}
