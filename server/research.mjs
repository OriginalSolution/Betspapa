/**
 * Background check that runs after the odds range and before a code is published.
 * Team records come from the same Sportradar last-X rows the trend already uses.
 * League reliability comes from those finished scores, grouped by competition,
 * plus any settled picks this engine has recorded. No extra API key.
 * server/leagueRisk.json is an optional override, not the source of the score.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { ODDS_RANGES } from './oddsRange.mjs';
import { WINDOW } from './occurrence.mjs';
import { gradeWithTeams, SUPPORT_RATE, TREND_RATE } from './teamGrade.mjs';
import { applyLeagueRisk, canonLeague, dangerousBand, leagueKeys } from './leagueRisk.mjs';

export const LEAGUE_MIN = 12;
export const LEAGUE_CAP = 40;
/** Block when the league hits this far less often than the price implies. */
export const IMPLIED_GAP = 0.12;
export const VOLATILE = 0.28;
export const WEAK_LEAGUE = 0.42;
const SETTLED_MIN = 8;

function round(value) {
  return Math.round(value * 100) / 100;
}

function textRate(hits, sample) {
  return `${hits}/${sample}`;
}

export function tournamentOf(match) {
  const tournament = [
    match?.tournament?.uniquetournament?.name,
    match?.tournament?.name,
    match?.season?.uniquetournament?.name,
    match?.uniquetournament?.name,
  ].find((name) => typeof name === 'string' && name.trim());
  const country = match?.tournament?.category?.name || match?.category?.name || '';
  return {
    tournament: tournament ? String(tournament).trim() : '',
    country: typeof country === 'string' ? country.trim() : '',
  };
}

function venue(rows, side) {
  return (rows || []).filter((row) => !row.neutral && (side === 'home' ? row.teamIsHome : !row.teamIsHome));
}

/** Unflipped games for the scoring profile. Home and away markets use that venue. */
export function profileRows(market, homeRows, awayRows) {
  if (market.scope === 'home' || market.scope === 'away' || market.scope === 'venue-either') {
    return { home: venue(homeRows, 'home'), away: venue(awayRows, 'away') };
  }
  return { home: homeRows || [], away: awayRows || [] };
}

export function scoringProfile(rows) {
  const judged = [];
  for (const row of (rows || []).slice(0, WINDOW)) {
    if (!Number.isFinite(row?.ftHome) || !Number.isFinite(row?.ftAway)) continue;
    const scored = row.teamIsHome ? row.ftHome : row.ftAway;
    const conceded = row.teamIsHome ? row.ftAway : row.ftHome;
    judged.push({
      scored,
      conceded,
      total: row.ftHome + row.ftAway,
      btts: row.ftHome > 0 && row.ftAway > 0,
      homeGame: Boolean(row.teamIsHome),
    });
  }
  if (judged.length < 8) return null;
  const count = judged.length;
  const avg = (key) => judged.reduce((sum, row) => sum + row[key], 0) / count;
  const share = (pick) => judged.filter(pick).length / count;
  const homeGames = judged.filter((row) => row.homeGame);
  const awayGames = judged.filter((row) => !row.homeGame);
  const split = (list, pick) => (list.length ? `${list.filter(pick).length}/${list.length}` : null);
  return {
    sample: count,
    scored: avg('scored'),
    conceded: avg('conceded'),
    total: avg('total'),
    over15: share((row) => row.total > 1.5),
    over25: share((row) => row.total > 2.5),
    over35: share((row) => row.total > 3.5),
    btts: share((row) => row.btts),
    homeOver: split(homeGames, (row) => row.total > 2.5),
    awayOver: split(awayGames, (row) => row.total > 2.5),
  };
}

function profileLine(side, stats, where) {
  if (!stats) return `${side} has no ${where} sample of 8 games.`;
  const split = [stats.homeOver ? `home games over 2.5 ${stats.homeOver}` : '', stats.awayOver ? `away games over 2.5 ${stats.awayOver}` : ''].filter(Boolean).join(', ');
  return `${side} ${where}: scored ${round(stats.scored)}, conceded ${round(stats.conceded)}, over 1.5 ${Math.round(stats.over15 * 100)}%, over 2.5 ${Math.round(stats.over25 * 100)}%, BTTS ${Math.round(stats.btts * 100)}%${split ? ` (${split})` : ''}.`;
}

function lineOf(marketId) {
  if (marketId === 'over15' || marketId === 'under15') return 1.5;
  if (marketId === 'over25' || marketId === 'under25') return 2.5;
  if (marketId === 'over35' || marketId === 'under35') return 3.5;
  return null;
}

/** A scoring or conceding pattern that fights the pick, even if a raw hit rate looks fine. */
export function profileContradiction(market, homeStats, awayStats) {
  if (!homeStats || !awayStats) return null;
  const id = market.id;
  const line = lineOf(id);
  const mean = (homeStats.total + awayStats.total) / 2;
  if (id.startsWith('over') && line != null && mean + 1e-9 < line - 0.35) {
    return `The two sides average ${round(mean)} goals a game, which does not support over ${line}.`;
  }
  if (id.startsWith('under') && line != null && mean > line + 0.35) {
    return `The two sides average ${round(mean)} goals a game, which does not support under ${line}.`;
  }
  if (id === 'btts' && (homeStats.btts + 1e-12 < SUPPORT_RATE || awayStats.btts + 1e-12 < SUPPORT_RATE)) {
    return 'Both-teams-to-score is under 60% for one of the sides.';
  }
  if (id === 'home' && (homeStats.scored + 1e-9 < homeStats.conceded || awayStats.scored > awayStats.conceded + 1e-9)) {
    return homeStats.scored + 1e-9 < homeStats.conceded
      ? 'The home side concedes more than it scores at home.'
      : 'The away side scores more than it concedes away.';
  }
  if (id === 'away' && (awayStats.scored + 1e-9 < awayStats.conceded || homeStats.scored > homeStats.conceded + 1e-9)) {
    return awayStats.scored + 1e-9 < awayStats.conceded
      ? 'The away side concedes more than it scores away.'
      : 'The home side scores more than it concedes at home.';
  }
  return null;
}

function hitOn(row, market) {
  const value = market.hit({ ...row, teamIsHome: true });
  return value == null ? null : Boolean(value);
}

function rateMatches(matches, market) {
  const judged = [];
  for (const row of matches) {
    const value = hitOn(row, market);
    if (value == null) continue;
    judged.push(value);
  }
  if (!judged.length) return null;
  const hits = judged.filter(Boolean).length;
  return { hits, sample: judged.length, rate: hits / judged.length };
}

export function oddsBand(marketId, odds) {
  const range = ODDS_RANGES[marketId];
  const price = Number(odds);
  if (!range || !Number.isFinite(price)) return { id: 'any', label: 'unlisted' };
  const span = Math.max(0.01, range.max - range.min);
  const pos = Math.min(2, Math.max(0, Math.floor(((price - range.min) / span) * 3)));
  const names = ['low', 'middle', 'high'];
  const start = range.min + (span / 3) * pos;
  const end = pos === 2 ? range.max : range.min + (span / 3) * (pos + 1);
  return { id: `${marketId}:${names[pos]}`, label: `${start.toFixed(2)}–${end.toFixed(2)}` };
}

/** Finished matches from every team's last-X, one row per match, newest first. */
export function indexLeagues(histories) {
  const byLeague = new Map();
  const lists = histories instanceof Map ? [...histories.values()] : Object.values(histories || {});
  for (const rows of lists) {
    for (const row of rows || []) {
      const key = canonLeague(row?.tournament);
      if (!key || row.neutral) continue;
      if (!Number.isFinite(row.ftHome) || !Number.isFinite(row.ftAway)) continue;
      const bucket = byLeague.get(key) || new Map();
      if (!bucket.has(row.matchId)) bucket.set(row.matchId, row);
      byLeague.set(key, bucket);
    }
  }
  const index = new Map();
  for (const [key, bucket] of byLeague) {
    index.set(key, [...bucket.values()].sort((a, b) => (b.uts || 0) - (a.uts || 0) || b.matchId - a.matchId).slice(0, LEAGUE_CAP));
  }
  return index;
}

export function matchesFor(index, event) {
  for (const key of leagueKeys(event)) {
    const rows = index.get(key);
    if (rows?.length) return { key, matches: rows };
  }
  return { key: canonLeague(event?.tournament), matches: [] };
}

function settledRate(rows) {
  const judged = (rows || []).filter((row) => row?.status === 'won' || row?.status === 'bust');
  if (!judged.length) return null;
  const hits = judged.filter((row) => row.status === 'won').length;
  return { hits, sample: judged.length, rate: hits / judged.length };
}

function fromRates(record, implied, label) {
  if (!record || record.sample < LEAGUE_MIN) {
    const count = record?.sample || 0;
    return { action: 'thin', reasons: [`${label}: ${count} finished matches, under ${LEAGUE_MIN}, so this league is not blocked yet.`] };
  }
  const landed = `${label} landed ${textRate(record.hits, record.sample)} (${Math.round(record.rate * 100)}%). Price implies ${Math.round(implied * 100)}%.`;
  if (record.rate + IMPLIED_GAP < implied || record.rate + 1e-12 < WEAK_LEAGUE) {
    return { action: 'block', reasons: [`${landed} That is too rare for this price, so the pick is blocked.`] };
  }
  return { action: 'pass', reasons: [landed] };
}

export function judgeLeague({ matches, market, odds, settled, leagueName }) {
  const implied = 1 / Number(odds);
  const recent = (matches || []).slice(0, LEAGUE_CAP);
  const overall = rateMatches(recent, market);
  const band = oddsBand(market.id, odds);
  const name = leagueName || 'This league';
  const reasons = [];
  let action = 'thin';
  const base = fromRates(overall, implied, name);
  action = base.action;
  reasons.push(...base.reasons);
  if (overall && overall.sample >= LEAGUE_MIN) {
    const mid = Math.floor(recent.length / 2);
    const newer = rateMatches(recent.slice(0, mid), market);
    const older = rateMatches(recent.slice(mid), market);
    if (newer && older && Math.abs(newer.rate - older.rate) + 1e-12 >= VOLATILE) {
      reasons.push(`Results swing from ${Math.round(older.rate * 100)}% to ${Math.round(newer.rate * 100)}% in the two halves of this sample.`);
      if (action === 'pass') action = 'penalise';
    }
  }
  const bandRows = (settled || []).filter((row) => canonLeague(row.league) === canonLeague(leagueName) && row.market === market.id && row.band === band.id);
  const bandRate = settledRate(bandRows);
  if (bandRate && bandRate.sample >= SETTLED_MIN) {
    const landed = `Settled ${band.label} prices in ${name} landed ${textRate(bandRate.hits, bandRate.sample)}.`;
    if (bandRate.rate + IMPLIED_GAP < implied || bandRate.rate + 1e-12 < WEAK_LEAGUE) {
      action = 'block';
      reasons.push(`${landed} That odds band is blocked.`);
    } else if (action !== 'block') {
      action = 'pass';
      reasons.push(`${landed} That odds band is reliable enough to keep.`);
    }
  } else {
    reasons.push(`No settled ${band.label} record for ${name} yet. The scoreline rate above is the measure.`);
  }
  return { action, reasons, band };
}

/**
 * Trend, then both teams' scoring records, then the league.
 * `publish` is true only when all three pass. A penalised league still publishes, capped at 90%.
 */
export function reviewPick({ market, trend, records, homeRows, awayRows, odds, event, leagueIndex, settled, leagueTable }) {
  const graded = gradeWithTeams({ trend, home: records?.home, away: records?.away });
  const trendPass = Boolean(trend) && trend.rate + 1e-12 >= TREND_RATE;
  const teamAgree = graded?.agreement === 'agree';
  if (!trendPass && !teamAgree) return null;

  const rows = profileRows(market, homeRows, awayRows);
  const homeStats = scoringProfile(rows.home);
  const awayStats = scoringProfile(rows.away);
  const where = market.scope === 'home' || market.scope === 'away' || market.scope === 'venue-either' ? 'in that venue' : 'in recent games';
  const reasons = [];
  reasons.push(trend ? `Trend ${market.label} is ${textRate(trend.hits, trend.sample)}${trendPass ? '' : ', under 80%'}.` : `No trend sample for ${market.label}.`);
  reasons.push(profileLine('Home', homeStats, where));
  reasons.push(profileLine('Away', awayStats, where));

  const contradiction = teamAgree ? profileContradiction(market, homeStats, awayStats) : null;
  let teamPass = graded?.agreement === 'agree' || graded?.agreement === 'unknown';
  if (contradiction) {
    teamPass = false;
    reasons.push(contradiction);
  } else if (graded?.agreement === 'agree') {
    reasons.push(`Both teams support ${market.label}: home ${graded.homeSample}, away ${graded.awaySample}. The grade is the weaker record.`);
  } else if (graded?.agreement === 'unknown') {
    reasons.push('One side has no sample of 8, so the trend stands for the team check.');
  } else {
    teamPass = false;
    reasons.push(`The two teams do not both support ${market.label}${graded?.homeSample || records?.home ? ` (home ${records?.home ? textRate(records.home.hits, records.home.sample) : 'n/a'}, away ${records?.away ? textRate(records.away.hits, records.away.sample) : 'n/a'})` : ''}.`);
  }

  const found = matchesFor(leagueIndex || new Map(), event);
  const league = judgeLeague({ matches: found.matches, market, odds, settled, leagueName: found.key || event?.tournament });
  reasons.push(...league.reasons);

  const override = dangerousBand(leagueTable, event, market.id, odds);
  let action = league.action;
  if (override?.action === 'exclude') {
    action = 'block';
    reasons.push(`Owner override excludes ${market.label} at this price in this league.`);
  } else if (override?.action === 'penalise' && action !== 'block') {
    action = 'penalise';
    reasons.push('Owner override marks this league price down from a sure grade.');
  }

  const blocked = action === 'block';
  const publish = Boolean(trendPass && teamPass && !blocked);
  let rate = graded?.rate ?? null;
  let hits = graded?.hits ?? null;
  let sample = graded?.sample ?? null;
  let leagueRisk = null;
  if (publish && action === 'penalise' && rate != null) {
    const marked = applyLeagueRisk({ rate, hits, sample, keptBy: graded?.keptBy }, { action: 'penalise' });
    rate = marked.rate;
    leagueRisk = 'penalise';
    if (marked.keptBy === 'markdown') reasons.push('Published at 90% because this league price is marked down.');
  }
  if (!trendPass && teamAgree) reasons.push('Both teams support the pick, but the trend is under 80%, so it is not on a booking code.');
  if (trendPass && teamPass && blocked) reasons.push('Left off the code because the league check blocked it.');
  if (trendPass && !teamPass) reasons.push('Left off the code because the team check did not support it.');

  return {
    publish,
    trendPass,
    teamPass,
    leagueAction: action,
    rate,
    hits,
    sample,
    teamsAgree: teamAgree && !contradiction,
    agreement: contradiction ? 'profile' : graded?.agreement || 'split',
    homeSample: graded?.homeSample || (records?.home ? textRate(records.home.hits, records.home.sample) : null),
    awaySample: graded?.awaySample || (records?.away ? textRate(records.away.hits, records.away.sample) : null),
    leagueRisk,
    reasons,
  };
}

export function loadSettled(file) {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSettled(file, rows) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(rows));
}

export function rememberSettled(existing, legs) {
  const next = new Map((existing || []).filter((row) => row?.key).map((row) => [row.key, row]));
  for (const leg of legs || []) {
    if (leg?.status !== 'won' && leg?.status !== 'bust') continue;
    const league = canonLeague(leg.tournament || leg.league);
    if (!league || !leg.eventId || !leg.market) continue;
    const band = oddsBand(leg.market, leg.odds);
    const key = `${leg.eventId}|${leg.market}`;
    next.set(key, { key, league, market: leg.market, odds: Number(leg.odds), band: band.id, status: leg.status });
  }
  return [...next.values()].slice(-4000);
}
