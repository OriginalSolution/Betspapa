/**
 * Occurrence is how often a market hit in recent real matches, not the price.
 * A line qualifies at 80% or better over the last 10 relevant games, with at
 * least 8 of those games scored. The hit rules match the app's settle().
 */
import { isSimulated } from './upcoming.mjs';

export const WINDOW = 10;
export const MIN_SAMPLE = 8;
export const THRESHOLD = 0.8;
/** Tie-break when two markets hit equally often: the price nearer a normal leg. */
export const SENSIBLE_ODDS = 1.8;
export const MIN_ODDS = 1.2;

const EVENT_ID = /^sr:match:\d+$/;

export function teamUid(value) {
  const match = String(value ?? '').match(/(\d+)\s*$/);
  if (!match) return null;
  const uid = Number(match[1]);
  return Number.isFinite(uid) ? uid : null;
}

export function isRealFixture(event) {
  if (!event || isSimulated(event)) return false;
  return !/\bSRL\b|simulated|virtual/i.test(`${event.home || ''} ${event.away || ''}`);
}

/** Today's remaining kickoffs, in UTC. Ghana is on UTC, which is the matchday the board uses. */
export function isOpenToday(event, now = new Date()) {
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const kick = new Date(event?.kickoff).getTime();
  return Number.isFinite(kick) && kick >= now.getTime() && kick >= start && kick < start + 86_400_000 && EVENT_ID.test(String(event?.eventId || ''));
}

function scores(row) {
  if (!Number.isFinite(row?.ftHome) || !Number.isFinite(row?.ftAway)) return null;
  const team = row.teamIsHome ? row.ftHome : row.ftAway;
  const opp = row.teamIsHome ? row.ftAway : row.ftHome;
  return { home: row.ftHome, away: row.ftAway, team, opp, total: row.ftHome + row.ftAway };
}

function half(row) {
  if (!Number.isFinite(row?.htHome) || !Number.isFinite(row?.htAway)) return null;
  const team = row.teamIsHome ? row.htHome : row.htAway;
  const opp = row.teamIsHome ? row.htAway : row.htHome;
  return { team, opp, total: row.htHome + row.htAway };
}

function cornerTotal(row) {
  if (!Number.isFinite(row?.cornersHome) || !Number.isFinite(row?.cornersAway)) return null;
  return row.cornersHome + row.cornersAway;
}

function cardTotal(row) {
  if (!Number.isFinite(row?.cardsHome) || !Number.isFinite(row?.cardsAway)) return null;
  return row.cardsHome + row.cardsAway;
}

function compare(row, which) {
  const score = scores(row);
  if (!score) return null;
  if (which === 'win') return score.team > score.opp;
  if (which === 'draw') return score.home === score.away;
  if (which === 'unbeaten') return score.team >= score.opp;
  if (which === 'not-draw') return score.home !== score.away;
  if (which === 'btts') return score.home > 0 && score.away > 0;
  if (which === 'btts-no') return !(score.home > 0 && score.away > 0);
  if (which === 'clean') return score.opp === 0;
  return null;
}

function lineHit(read, line, over) {
  return (row) => {
    const total = read(row);
    if (total == null) return null;
    return over ? total > line : total < line;
  };
}

function goalLine(line, over, scope) {
  const side = line === 0.5 && scope === 'home' ? 'Home team to score' : line === 0.5 && scope === 'away' ? 'Away team to score' : null;
  const verb = `${over ? 'Over' : 'Under'} ${line} goals`;
  const name = side || (scope === 'either' ? verb : `${scope === 'home' ? 'Home' : 'Away'} ${verb.charAt(0).toLowerCase()}${verb.slice(1)}`);
  return {
    id: side === 'Home team to score' ? 'home-score' : side === 'Away team to score' ? 'away-score' : `${scope === 'either' ? '' : scope === 'home' ? 'home-' : 'away-'}${over ? 'over' : 'under'}${String(line).replace('.', '')}`,
    label: name,
    oddsKey: scope === 'either' ? `${over ? 'over' : 'under'}-${String(line).replace('.', '')}` : `${scope}-${over ? 'over' : 'under'}-${String(line).replace('.', '')}`,
    scope: scope === 'either' ? 'either' : scope,
    hit: lineHit((row) => (scope === 'either' ? scores(row)?.total ?? null : scores(row)?.team ?? null), line, over),
  };
}

/**
 * Every major market the board can explain from a full-time score, a half-time
 * score, or a corner/card count. Corner and card lines stay quiet when that
 * count was not on the match.
 */
export const OCCURRENCE_MARKETS = [
  { id: 'home', label: 'Home win', oddsKey: 'home', scope: 'home', hit: (row) => compare(row, 'win') },
  { id: 'draw', label: 'Draw', oddsKey: 'draw', scope: 'venue-either', hit: (row) => compare(row, 'draw') },
  { id: 'away', label: 'Away win', oddsKey: 'away', scope: 'away', hit: (row) => compare(row, 'win') },
  { id: 'dc-1x', label: 'Double chance 1X', oddsKey: 'dc-1x', scope: 'home', hit: (row) => compare(row, 'unbeaten') },
  { id: 'dc-12', label: 'Double chance 12', oddsKey: 'dc-12', scope: 'venue-either', hit: (row) => compare(row, 'not-draw') },
  { id: 'dc-x2', label: 'Double chance X2', oddsKey: 'dc-x2', scope: 'away', hit: (row) => compare(row, 'unbeaten') },
  { id: 'dnb-home', label: 'Draw no bet home', oddsKey: 'home-dnb', scope: 'home', hit: (row) => compare(row, 'win') },
  { id: 'dnb-away', label: 'Draw no bet away', oddsKey: 'away-dnb', scope: 'away', hit: (row) => compare(row, 'win') },
  goalLine(0.5, true, 'either'),
  goalLine(1.5, true, 'either'),
  goalLine(2.5, true, 'either'),
  goalLine(3.5, true, 'either'),
  goalLine(1.5, false, 'either'),
  goalLine(2.5, false, 'either'),
  goalLine(3.5, false, 'either'),
  { id: 'btts', label: 'Both teams to score', oddsKey: 'btts-yes', scope: 'either', hit: (row) => compare(row, 'btts') },
  { id: 'btts-no', label: 'Both teams not to score', oddsKey: 'btts-no', scope: 'either', hit: (row) => compare(row, 'btts-no') },
  goalLine(0.5, true, 'home'),
  goalLine(0.5, true, 'away'),
  goalLine(1.5, true, 'home'),
  goalLine(2.5, true, 'home'),
  goalLine(1.5, false, 'home'),
  goalLine(1.5, true, 'away'),
  goalLine(2.5, true, 'away'),
  goalLine(1.5, false, 'away'),
  { id: 'home-clean', label: 'Home clean sheet', oddsKey: 'home-clean', scope: 'home', hit: (row) => compare(row, 'clean') },
  { id: 'away-clean', label: 'Away clean sheet', oddsKey: 'away-clean', scope: 'away', hit: (row) => compare(row, 'clean') },
  { id: 'fh-home', label: 'First-half home win', oddsKey: 'fh-home', scope: 'home', hit: (row) => { const ht = half(row); return ht ? ht.team > ht.opp : null; } },
  { id: 'fh-draw', label: 'First-half draw', oddsKey: 'fh-draw', scope: 'venue-either', hit: (row) => { const ht = half(row); return ht ? ht.team === ht.opp : null; } },
  { id: 'fh-away', label: 'First-half away win', oddsKey: 'fh-away', scope: 'away', hit: (row) => { const ht = half(row); return ht ? ht.team > ht.opp : null; } },
  { id: 'fh-over05', label: 'First-half over 0.5', oddsKey: 'fh-over-05', scope: 'either', hit: lineHit((row) => half(row)?.total ?? null, 0.5, true) },
  { id: 'fh-over15', label: 'First-half over 1.5', oddsKey: 'fh-over-15', scope: 'either', hit: lineHit((row) => half(row)?.total ?? null, 1.5, true) },
  { id: 'corners-over75', label: 'Over 7.5 corners', oddsKey: 'corners-over-75', scope: 'either', hit: lineHit(cornerTotal, 7.5, true) },
  { id: 'corners-over85', label: 'Over 8.5 corners', oddsKey: 'corners-over-85', scope: 'either', hit: lineHit(cornerTotal, 8.5, true) },
  { id: 'corners-over95', label: 'Over 9.5 corners', oddsKey: 'corners-over-95', scope: 'either', hit: lineHit(cornerTotal, 9.5, true) },
  { id: 'corners-over105', label: 'Over 10.5 corners', oddsKey: 'corners-over-105', scope: 'either', hit: lineHit(cornerTotal, 10.5, true) },
  { id: 'corners-under95', label: 'Under 9.5 corners', oddsKey: 'corners-under-95', scope: 'either', hit: lineHit(cornerTotal, 9.5, false) },
  { id: 'corners-under105', label: 'Under 10.5 corners', oddsKey: 'corners-under-105', scope: 'either', hit: lineHit(cornerTotal, 10.5, false) },
  { id: 'cards-over35', label: 'Over 3.5 cards', oddsKey: 'cards-over-35', scope: 'either', hit: lineHit(cardTotal, 3.5, true) },
  { id: 'cards-over45', label: 'Over 4.5 cards', oddsKey: 'cards-over-45', scope: 'either', hit: lineHit(cardTotal, 4.5, true) },
];

const byId = new Map(OCCURRENCE_MARKETS.map((market) => [market.id, market]));

export function labelFor(market) {
  return byId.get(market)?.label || market;
}

/** Last 10 rows, ignoring games that cannot answer this market. Needs 8 answers. */
export function rateOf(rows, hit) {
  const judged = [];
  for (const row of (rows || []).slice(0, WINDOW)) {
    const value = hit(row);
    if (value == null) continue;
    judged.push(Boolean(value));
  }
  if (judged.length < MIN_SAMPLE) return null;
  const hits = judged.filter(Boolean).length;
  return { hits, sample: judged.length, rate: hits / judged.length };
}

function venue(rows, side) {
  return rows.filter((row) => !row.neutral && (side === 'home' ? row.teamIsHome : !row.teamIsHome));
}

function better(left, right) {
  if (!left) return right || null;
  if (!right) return left;
  if (right.rate !== left.rate) return right.rate > left.rate ? right : left;
  return right.sample > left.sample ? right : left;
}

export function measureMarket(market, homeRows, awayRows) {
  if (market.scope === 'home') return rateOf(venue(homeRows, 'home'), market.hit);
  if (market.scope === 'away') return rateOf(venue(awayRows, 'away'), market.hit);
  if (market.scope === 'either') return better(rateOf(homeRows, market.hit), rateOf(awayRows, market.hit));
  return better(rateOf(venue(homeRows, 'home'), market.hit), rateOf(venue(awayRows, 'away'), market.hit));
}

function asSide(row, teamIsHome) {
  return { ...row, teamIsHome };
}

/** Last five results, oldest on the left. Empty history stays null so the app can hide the strip. */
export function lastForm(rows) {
  const marks = [];
  for (const row of rows || []) {
    const score = scores(row);
    if (!score) continue;
    marks.push(score.team > score.opp ? 'W' : score.team < score.opp ? 'L' : 'D');
    if (marks.length === 5) break;
  }
  if (!marks.length) return null;
  return marks.reverse();
}

function formRowsFor(market, homeRows, awayRows) {
  if (market.scope === 'home') return venue(homeRows, 'home');
  if (market.scope === 'away') return venue(awayRows, 'away');
  const homeList = market.scope === 'venue-either' ? venue(homeRows, 'home') : homeRows;
  const awayList = market.scope === 'venue-either' ? venue(awayRows, 'away') : awayRows;
  const homeRate = rateOf(homeList, market.hit);
  const awayRate = rateOf(awayList, market.hit);
  if (!homeRate) return awayList;
  if (!awayRate) return homeList;
  if (awayRate.rate > homeRate.rate + 1e-12) return awayList;
  if (homeRate.rate > awayRate.rate + 1e-12) return homeList;
  return awayRate.sample > homeRate.sample ? awayList : homeList;
}

/**
 * Form is the backed side's real last five. The opponent check passes only when
 * the other side's recent matches also clear 80% for this market. A short sample
 * is null, which the app hides instead of inventing a chip.
 */
export function explainTip(market, homeRows, awayRows) {
  const form = lastForm(formRowsFor(market, homeRows, awayRows));
  let opponentHeld = null;
  if (market.scope === 'home') {
    const check = rateOf(venue(awayRows, 'away').map((row) => asSide(row, true)), market.hit);
    if (check && check.rate + 1e-12 >= THRESHOLD) opponentHeld = true;
  } else if (market.scope === 'away') {
    const check = rateOf(venue(homeRows, 'home').map((row) => asSide(row, false)), market.hit);
    if (check && check.rate + 1e-12 >= THRESHOLD) opponentHeld = true;
  } else {
    const homeList = market.scope === 'venue-either' ? venue(homeRows, 'home') : homeRows;
    const awayList = market.scope === 'venue-either' ? venue(awayRows, 'away') : awayRows;
    const homeRate = rateOf(homeList, market.hit);
    const awayRate = rateOf(awayList, market.hit);
    if (homeRate && awayRate && homeRate.rate + 1e-12 >= THRESHOLD && awayRate.rate + 1e-12 >= THRESHOLD) opponentHeld = true;
  }
  return { form, opponentHeld };
}

function rowsOf(histories, uid) {
  const rows = histories instanceof Map ? histories.get(uid) : histories?.[uid];
  return Array.isArray(rows) ? rows : [];
}

function percent(rate) {
  return Math.round(rate * 1000) / 10;
}

/**
 * One leg per open fixture per market at or above 80%, with a price of at least 1.20.
 * `byEvent` also keeps cooler measured rates so the app can show the same record.
 */
export function buildOccurrenceBoard(events, histories, now = new Date()) {
  const legs = [];
  const byEvent = {};
  let skippedNoTeam = 0;
  const unpriced = new Map();
  for (const event of Array.isArray(events) ? events : []) {
    if (!isRealFixture(event) || !isOpenToday(event, now)) continue;
    const homeUid = teamUid(event.homeId);
    const awayUid = teamUid(event.awayId);
    if (homeUid == null || awayUid == null) {
      skippedNoTeam += 1;
      continue;
    }
    const homeRows = rowsOf(histories, homeUid);
    const awayRows = rowsOf(histories, awayUid);
    if (!homeRows.length && !awayRows.length) continue;
    const measured = [];
    for (const market of OCCURRENCE_MARKETS) {
      const rate = measureMarket(market, homeRows, awayRows);
      if (!rate) continue;
      measured.push({ market: market.id, hits: rate.hits, sample: rate.sample, rate: rate.hits / rate.sample });
      if (rate.rate + 1e-12 < THRESHOLD) continue;
      const price = Number(event.odds?.[market.oddsKey]);
      if (!Number.isFinite(price) || price < MIN_ODDS) {
        unpriced.set(market.id, (unpriced.get(market.id) || 0) + 1);
        continue;
      }
      const explained = explainTip(market, homeRows, awayRows);
      legs.push({
        eventId: String(event.eventId),
        market: market.id,
        odds: Math.round(price * 100) / 100,
        match: `${event.home} vs ${event.away}`.replace(/\s+/g, ' ').trim(),
        kickoff: new Date(event.kickoff).toISOString(),
        status: 'open',
        homeScore: null,
        awayScore: null,
        finished: false,
        occurrence: percent(rate.rate),
        sample: `${rate.hits}/${rate.sample}`,
        hits: rate.hits,
        played: rate.sample,
        rate: rate.rate,
        form: explained.form,
        opponentHeld: explained.opponentHeld,
      });
    }
    if (measured.length) byEvent[String(event.eventId)] = measured;
  }
  const notes = [];
  if (skippedNoTeam) notes.push(`${skippedNoTeam} real fixtures had no team id, so occurrence could not be computed.`);
  if (unpriced.size) {
    const detail = [...unpriced.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 8)
      .map(([id, count]) => `${labelFor(id)} ${count}`)
      .join(', ');
    const total = [...unpriced.values()].reduce((sum, count) => sum + count, 0);
    notes.push(`${total} lines were at 80%+ but had no price at or above 1.20 (${detail}).`);
  }
  return { legs, byEvent, notes };
}

function prefers(next, current) {
  if (next.rate !== current.rate) return next.rate > current.rate;
  const nextGap = Math.abs(Number(next.odds) - SENSIBLE_ODDS);
  const currentGap = Math.abs(Number(current.odds) - SENSIBLE_ODDS);
  if (Math.abs(nextGap - currentGap) > 1e-9) return nextGap < currentGap;
  return String(next.market) < String(current.market);
}

/** One leg per match: the highest occurrence, then the price closest to 1.80. */
export function masterPick(legs) {
  const best = new Map();
  for (const leg of legs || []) {
    const current = best.get(leg.eventId);
    if (!current || prefers(leg, current)) best.set(leg.eventId, leg);
  }
  return [...best.values()].sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.eventId.localeCompare(b.eventId));
}
