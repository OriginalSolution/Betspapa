/**
 * Pure Banker rules. The feed turns fixtures into candidates; this file
 * decides the leg, or why the game is dropped. It never calls a bookmaker.
 */
import {
  AH_1UP_FROM,
  AH_MAX_INCL,
  AWAY_LAST_N,
  AWAY_SCORED_GAMES_MIN,
  AWAY_WINS_MIN,
  CAPPED_AH_O25_UNDER,
  CAPPED_CAP,
  DAILY_MAX_LEGS,
  FAV_1X2_SKIP_UNDER,
  GOLD_O25_UNDER,
  LADDER_FAV_TWO_PLUS,
  LADDER_LAST_N,
  LADDER_O25_MAX_EXCL,
  LADDER_O25_MIN,
  LADDER_WEAK_OFTEN,
  LADDER_WEAK_RARE_MAX,
  MAX_CODES_PER_MATCH,
  MIN_LEG,
  SHIELD_O25_MAX_EXCL,
  U45_FILTER_OVER,
  U45_LAST_N,
  U45_LEG_MAX,
  U45_MIN_GAMES,
  U45_O15_PUSH_UNDER,
  U45_O15_XG,
  U45_O25_XG,
  U45_PLUS_MIN,
  U45_REGULAR_SCORED,
  WEEK_MAX_LEGS,
} from './bankerConfig.mjs';
import { dropReason, strongAway, tableClash } from './bankerFilters.mjs';

function leg(candidate, pick, label) {
  if (!pick || !(pick.price >= MIN_LEG)) return { drop: 'under 1.20' };
  return {
    eventId: candidate.eventId,
    home: candidate.home,
    away: candidate.away,
    homeId: candidate.homeId || '',
    awayId: candidate.awayId || '',
    kickMs: candidate.kickMs,
    ah: candidate.ah.price,
    marketId: pick.mid,
    specifier: pick.spec || '',
    outcomeId: pick.oid,
    odds: pick.price,
    side: pick.side || candidate.ah.side,
    label,
  };
}

function winLeg(candidate, band) {
  if (band === '2up') {
    if (!candidate.up2) return { drop: 'no 2UP' };
    return leg(candidate, { ...candidate.up2, side: candidate.ah.side }, candidate.ah.side === 'A' ? 'Away 2UP' : 'Home 2UP');
  }
  if (!candidate.up1) return { drop: 'no 1UP' };
  return leg(candidate, { ...candidate.up1, side: candidate.ah.side }, candidate.ah.side === 'A' ? 'Away 1UP' : 'Home 1UP');
}

function o25(candidate) {
  if (!candidate.o25) return { drop: 'no Over 2.5' };
  return leg(candidate, { ...candidate.o25, side: '' }, 'Over 2.5');
}

function teamO15(candidate) {
  if (!candidate.teamO15) return { drop: 'no team Over 1.5' };
  return leg(candidate, { ...candidate.teamO15, side: candidate.ah.side }, candidate.ah.side === 'A' ? 'Away 2+' : 'Home 2+');
}

/** Last-10 expected goals. Each half is the average of one team's scoring and the other's concessions. */
export function under45Expected(home, away) {
  const values = [home?.scoredAvg, home?.concededAvg, away?.scoredAvg, away?.concededAvg].map(Number);
  if (values.some((value) => !Number.isFinite(value))) return null;
  const [homeFor, homeAgainst, awayFor, awayAgainst] = values;
  return (homeFor + awayAgainst) / 2 + (awayFor + homeAgainst) / 2;
}

/** Both teams scoring regularly: 7 of a last 10, or 70% when the sample is 8 or 9. */
export function under45Regular(sample) {
  const n = Number(sample?.n) || 0;
  const scored = Number(sample?.scoredGames) || 0;
  if (n < U45_MIN_GAMES) return false;
  const need = n >= U45_LAST_N ? U45_REGULAR_SCORED : Math.ceil(n * 0.7);
  return scored >= need;
}

function goalsLeg(candidate, pick, label) {
  if (!pick || !(pick.price > 1) || pick.price > U45_LEG_MAX + 1e-9) return { drop: `${label} over ${U45_LEG_MAX.toFixed(2)} or missing` };
  return {
    eventId: candidate.eventId,
    home: candidate.home,
    away: candidate.away,
    homeId: candidate.homeId || '',
    awayId: candidate.awayId || '',
    league: candidate.league || '',
    tournamentId: candidate.tournamentId || '',
    country: candidate.country || '',
    kickMs: candidate.kickMs,
    ah: candidate.u45?.price ?? 0,
    marketId: pick.mid,
    specifier: pick.spec || '',
    outcomeId: pick.oid,
    odds: pick.price,
    side: '',
    label,
  };
}

/**
 * Under 4.5 is the filter. The leg is Over 1.5 or Over 2.5 from last-10
 * goal averages. The general odds table and the AH pool do not apply.
 */
export function pickUnder45(candidate, band = {}) {
  const name = dropReason(candidate?.country, candidate?.league, candidate?.home, candidate?.away);
  if (name) return { drop: name };
  if (candidate?.blacklisted) return { drop: 'blacklisted' };
  if (candidate?.open === false) return { drop: 'already started' };
  if (!candidate?.hpos || !candidate?.apos || !candidate?.tableN) return { drop: 'no league table' };
  const clash = tableClash(candidate.hpos, candidate.apos, candidate.tableN);
  if (clash) return { drop: clash };
  if (!(candidate?.u45 && candidate.u45.price > U45_FILTER_OVER)) return { drop: 'Under 4.5 not above 1.25' };
  const home = candidate.homeGoals;
  const away = candidate.awayGoals;
  if (!home || !away || home.n < U45_MIN_GAMES || away.n < U45_MIN_GAMES) return { drop: 'no last-10 goal averages' };
  const expected = under45Expected(home, away);
  if (expected == null) return { drop: 'no last-10 goal averages' };
  const regular = under45Regular(home) && under45Regular(away);
  const over25Bar = expected + 1e-9 >= U45_O25_XG && regular;
  const over15Bar = expected + 1e-9 >= U45_O15_XG;
  const floor = band.min;
  const over25 = () => {
    if (!candidate.o25) return { drop: 'no Over 2.5' };
    if (floor != null && candidate.o25.price < floor) return { drop: 'Over 2.5 under 1.29' };
    if (candidate.o25.price > U45_LEG_MAX + 1e-9) return { drop: 'Over 2.5 over 1.50' };
    return goalsLeg(candidate, candidate.o25, 'Over 2.5');
  };
  if (over25Bar) return over25();
  if (!over15Bar) return { drop: `expected goals ${expected.toFixed(2)} under 2.00` };
  if (!candidate.o15) return { drop: 'no Over 1.5' };
  const pushUnder = floor != null ? floor : U45_O15_PUSH_UNDER;
  if (candidate.o15.price < pushUnder) {
    // A short Over 1.5 moves up only when the Over 2.5 bar was already met.
    if (over25Bar) return over25();
    return { drop: floor != null ? 'Over 1.5 under 1.29 and goal stats miss Over 2.5' : 'Over 1.5 under 1.17 and goal stats miss Over 2.5' };
  }
  if (candidate.o15.price > U45_LEG_MAX + 1e-9) return { drop: 'Over 1.5 over 1.50' };
  return goalsLeg(candidate, candidate.o15, 'Over 1.5');
}

/** Shared pool. A string is the drop reason. */
export function poolDrop(candidate) {
  if (!candidate?.ah || !(candidate.ah.price <= AH_MAX_INCL)) return 'AH −1 over 2.00 or missing';
  const name = dropReason(candidate.country, candidate.league, candidate.home, candidate.away);
  if (name) return name;
  if (candidate.kickMs && candidate.kickMs <= Date.now() && candidate.started !== false && candidate.open === false) return 'already started';
  if (candidate.fav1x2 != null && candidate.fav1x2 < FAV_1X2_SKIP_UNDER) return 'favourite under 1.30 on 1X2';
  if (candidate.ah.side === 'A' && !strongAway(candidate.awayForm, { wins: AWAY_WINS_MIN, scored: AWAY_SCORED_GAMES_MIN, n: AWAY_LAST_N })) {
    return 'away favourite without strong away form';
  }
  if (!candidate.cup) {
    if (candidate.hpos == null || candidate.apos == null || !candidate.tableN) return 'no league table';
    const clash = tableClash(candidate.hpos, candidate.apos, candidate.tableN);
    if (clash) return clash;
  }
  if (candidate.busy && !candidate.capable) return 'busy day, league not on the Sportradar list';
  return '';
}

function classicBand(candidate) {
  if (candidate.ah.price < AH_1UP_FROM) return '2up';
  if (candidate.ah.price <= AH_MAX_INCL) return '1up';
  return '';
}

function cappedMain(candidate) {
  if (candidate.ah.price < CAPPED_AH_O25_UNDER) return o25(candidate);
  if (candidate.ah.price < AH_MAX_INCL) return winLeg(candidate, '2up');
  return { drop: 'AH −1 at 2.00 or more' };
}

function underCap(picked, cap) {
  return picked && !picked.drop && picked.odds <= cap + 1e-9;
}

export function pickLeg(strategy, candidate, config = {}) {
  if (strategy === 'under45') return pickUnder45(candidate);
  if (strategy === 'under45plus') return pickUnder45(candidate, { min: U45_PLUS_MIN });
  const pool = poolDrop(candidate);
  if (pool) return { drop: pool };
  if (strategy === 'classic') {
    const band = classicBand(candidate);
    return band ? winLeg(candidate, band) : { drop: 'AH −1 outside Classic' };
  }
  if (strategy === 'gold') {
    const band = classicBand(candidate);
    if (!band) return { drop: 'AH −1 outside Classic' };
    if (!(candidate.o25 && candidate.o25.price < GOLD_O25_UNDER)) return { drop: 'Over 2.5 not under 1.40' };
    return winLeg(candidate, band);
  }
  if (strategy === 'shield') {
    const defence = candidate.defence;
    if (!defence || defence.missing || defence.found === false) return { drop: 'no defence data' };
    if (defence.good) {
      const band = classicBand(candidate);
      return band ? winLeg(candidate, band) : { drop: 'AH −1 outside Shield' };
    }
    const over = o25(candidate);
    if (over.drop) return over;
    if (!(over.odds < SHIELD_O25_MAX_EXCL)) return { drop: 'Over 2.5 at 1.60 or more' };
    return over;
  }
  if (strategy === 'capped') {
    const cap = Number(config.cap) || CAPPED_CAP;
    const main = cappedMain(candidate);
    if (underCap(main, cap)) return main;
    const fallback = teamO15(candidate);
    if (underCap(fallback, cap)) return fallback;
    return { drop: main.drop && main.drop !== 'under 1.20' ? main.drop : `over the ${cap.toFixed(2)} cap` };
  }
  if (strategy === 'ladder') {
    const weak = candidate.weakScored;
    const favTwo = candidate.favScored2;
    if (weak == null || candidate.weakN == null || candidate.weakN < LADDER_LAST_N) return { drop: 'no last-10 scoring' };
    if (weak >= LADDER_WEAK_OFTEN) {
      const over = o25(candidate);
      if (!over.drop && over.odds >= LADDER_O25_MIN && over.odds < LADDER_O25_MAX_EXCL) return over;
      if (!over.drop && over.odds >= LADDER_O25_MAX_EXCL) {
        const fallback = winLeg(candidate, '2up');
        return fallback.drop ? { drop: 'Over 2.5 at 1.60 or more, and 2UP does not qualify' } : fallback;
      }
      return over.drop ? over : { drop: 'Over 2.5 outside 1.20 to under 1.60' };
    }
    if (weak <= LADDER_WEAK_RARE_MAX && favTwo != null && favTwo >= LADDER_FAV_TWO_PLUS) {
      const team = teamO15(candidate);
      if (!team.drop) return team;
    }
    return winLeg(candidate, '2up');
  }
  return { drop: 'unknown strategy' };
}

export function maxLegs(slot) {
  return slot === 'daily' ? DAILY_MAX_LEGS : WEEK_MAX_LEGS;
}

/** Lowest AH −1 first. Overlap is counted inside one strategy only. */
export function assemble(strategy, candidates, { slot = 'week', cap, counts = new Map() } = {}) {
  if (strategy === 'ladder' && slot === 'week') {
    return { legs: [], dropped: [], closest: null, note: 'Ladder has dailies only' };
  }
  const dropped = [];
  const kept = [];
  for (const candidate of candidates) {
    const used = counts.get(candidate.eventId) || 0;
    if (used >= MAX_CODES_PER_MATCH) {
      dropped.push({ eventId: candidate.eventId, match: `${candidate.home} v ${candidate.away}`, reason: 'already on 2 codes in this strategy', ah: candidate.ah?.price ?? null });
      continue;
    }
    const picked = pickLeg(strategy, candidate, { cap });
    if (picked.drop) {
      dropped.push({ eventId: candidate.eventId, match: `${candidate.home} v ${candidate.away}`, reason: picked.drop, ah: candidate.u45?.price ?? candidate.ah?.price ?? null });
      continue;
    }
    kept.push(picked);
  }
  if (strategy === 'under45' || strategy === 'under45plus') {
    kept.sort((a, b) => a.kickMs - b.kickMs || String(a.eventId).localeCompare(String(b.eventId)));
    const misses = dropped.filter((row) => row.ah != null && row.reason !== 'already on 2 codes in this strategy');
    misses.sort((a, b) => a.ah - b.ah);
    return { legs: kept, dropped, closest: misses[0] || null };
  }
  kept.sort((a, b) => a.ah - b.ah || a.kickMs - b.kickMs);
  const limit = maxLegs(slot);
  const cut = kept.slice(limit);
  const legs = kept.slice(0, limit);
  for (const row of cut) dropped.push({ eventId: row.eventId, match: `${row.home} v ${row.away}`, reason: `cut to ${limit}, higher AH −1`, ah: row.ah });
  const misses = dropped.filter((row) => row.ah != null && row.reason !== 'already on 2 codes in this strategy');
  misses.sort((a, b) => a.ah - b.ah);
  return { legs, dropped, closest: misses[0] || null };
}

export function productOdds(legs) {
  const total = legs.reduce((acc, leg) => acc * (Number(leg.odds) || 1), 1);
  return Math.round(total * 100) / 100;
}

/** A read-back price has left the strategy's own rule. Classic and Gold have no extra cap. */
export function priceStillOk(strategy, leg, cap = CAPPED_CAP) {
  const odds = Number(leg?.odds);
  if (strategy === 'under45') {
    if (!(odds > 1) || odds > U45_LEG_MAX + 1e-9) return false;
    const line = String(leg?.specifier || '');
    if (line.includes('1.5') && odds < U45_O15_PUSH_UNDER) return false;
    return true;
  }
  if (strategy === 'under45plus') {
    return odds >= U45_PLUS_MIN - 1e-9 && odds <= U45_LEG_MAX + 1e-9;
  }
  if (!(odds >= MIN_LEG)) return false;
  if (strategy === 'capped' && odds > cap + 1e-9) return false;
  if ((strategy === 'ladder' || strategy === 'shield') && String(leg?.marketId) === '18' && !(odds < SHIELD_O25_MAX_EXCL)) return false;
  return true;
}
