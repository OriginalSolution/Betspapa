/**
 * Alert wording. Every match alert names both clubs in full, the way the feed
 * spells them ("GOAL! Arsenal 1-0 Chelsea"), with the scorer and minute when the
 * feed has them. The phone's own watcher (watch-core NoteCopy.java) and the
 * in-app watcher (src/lib/signals.ts) build the same strings.
 */

const HOME = 'Home team';
const AWAY = 'Away team';

export function teamName(value, fallback = '') {
  const name = String(value ?? '').replace(/\s+/g, ' ').trim();
  return name || fallback;
}

function sides(match) {
  return { home: teamName(match?.home, HOME), away: teamName(match?.away, AWAY) };
}

function goals(value) {
  const number = Number(value);
  return Number.isFinite(number) && value !== '' && value != null ? number : 0;
}

export function minuteMark(minute) {
  if (minute == null || minute === '') return '';
  const number = Number(minute);
  return Number.isFinite(number) && number >= 0 ? `${Math.round(number)}′` : '';
}

/** "Arsenal 1-0 Chelsea". */
export function scoreLine(match, homeScore = match?.homeScore, awayScore = match?.awayScore) {
  const { home, away } = sides(match);
  return `${home} ${goals(homeScore)}-${goals(awayScore)} ${away}`;
}

/** "Arsenal vs Chelsea". */
export function fixtureLine(match) {
  const { home, away } = sides(match);
  return `${home} vs ${away}`;
}

/** The named side's club, or '' when the feed did not say which side it was. */
function sideTeam(match, side) {
  const { home, away } = sides(match);
  return side === 'away' ? away : side === 'home' ? home : '';
}

/** "Saka 54′ · Arsenal", "54′ · Arsenal" or "Arsenal". */
function who(player, minute, team) {
  const lead = [teamName(player), minuteMark(minute)].filter(Boolean).join(' ');
  return [lead, team].filter(Boolean).join(' · ');
}

function tail(match) {
  return teamName(match?.competition);
}

export function kickoffCopy(match) {
  return { title: `Kick-off: ${fixtureLine(match)}`, body: tail(match) ? `${tail(match)} · underway` : 'Underway now' };
}

export function goalCopy(match, side, { player = '', minute = match?.minute } = {}) {
  const team = sideTeam(match, side);
  const scorer = teamName(player);
  return {
    title: `GOAL! ${scoreLine(match)}`,
    body: scorer ? who(scorer, minute, team) : who('', minute, team ? `${team} score` : 'Goal'),
  };
}

export function disallowedCopy(match, side, { minute = match?.minute } = {}) {
  const team = sideTeam(match, side);
  return { title: `GOAL DISALLOWED! ${scoreLine(match)}`, body: who('', minute, team ? `VAR rules out the ${team} goal` : 'VAR rules the goal out') };
}

export function varReviewCopy(match, side, { player = '', minute = match?.minute } = {}) {
  const team = sideTeam(match, side);
  return {
    title: `VAR CHECK: ${scoreLine(match)}`,
    body: who(player, minute, team ? `${team} goal under review` : 'Goal under review'),
  };
}

export function incidentCopy(match, type, side, { player = '', minute = '' } = {}) {
  const team = sideTeam(match, side);
  const head = type === 'red' ? 'RED CARD!' : type === 'penalty' ? 'PENALTY!' : 'VAR CHECK:';
  return { title: `${head} ${scoreLine(match)}`, body: who(player, minute, team) };
}

export function halfTimeCopy(match, htHome = match?.homeScore, htAway = match?.awayScore) {
  return { title: `Half-time: ${scoreLine(match, htHome, htAway)}`, body: tail(match) || 'Half-time score' };
}

export function fullTimeCopy(match) {
  return { title: `Full-time: ${scoreLine(match)}`, body: tail(match) || 'Final score' };
}

export function trendCopy(match, label) {
  return { title: `Trend hit · ${label}`, body: `${scoreLine(match)} · ${label}` };
}

/** "Arsenal v Chelsea" for a slip or code leg; one name alone when the other is missing. */
export function legFixture(leg) {
  const home = teamName(leg?.home);
  const away = teamName(leg?.away);
  if (home && away) return `${home} v ${away}`;
  return home || away;
}

/** "Arsenal 2-1 Chelsea" for a settled leg, falling back to the fixture without a score. */
export function legScore(leg, score = leg?.score || leg?.ft || '') {
  const home = teamName(leg?.home);
  const away = teamName(leg?.away);
  const result = String(score || '').replace(/\s+/g, '').replace(/[–—:]/g, '-');
  if (!home || !away) return [home || away, result].filter(Boolean).join(' ');
  return result ? `${home} ${result} ${away}` : `${home} v ${away}`;
}

/** "Arsenal v Chelsea, Real Madrid v Getafe and 2 more". */
export function legList(legs, text = legFixture, limit = 2) {
  const rows = (legs || []).map((leg) => text(leg)).filter(Boolean);
  if (!rows.length) return '';
  if (rows.length <= limit) return rows.length === 2 ? `${rows[0]} and ${rows[1]}` : rows[0];
  const more = rows.length - limit;
  return `${rows.slice(0, limit).join(', ')} and ${more} more`;
}

/** A slip's own name, or "" for the generic labels older builds sent ("Slip", "Tracked slip"). */
export function slipCallName(label) {
  const name = String(label || '').trim();
  if (!name || name === 'Slip' || name === 'Tracked slip') return '';
  return name;
}

/**
 * One leg of a belled slip settled. With a slip name the title says which slip:
 * "Leg won · Slip 2 · SportyBet ABC123", and the market moves to the body.
 */
export function bellLegCopy({ won, slip, label, score, odds, settled, total }) {
  const word = won ? 'Leg won' : 'Leg lost';
  const name = slipCallName(slip);
  const price = odds ? ` · ${odds}` : '';
  const count = ` · ${settled} of ${total} settled`;
  if (!name) return { title: `${word} · ${label}`, body: `${score}${price}${count}` };
  return { title: `${word} · ${name}`, body: `${label} · ${score}${price}${count}` };
}

/** "Slip 2 · SportyBet ABC123 won · 5 of 5 legs", or the plain "Slip won · …" without a name. */
export function slipVerdictTitle(slip, won, played, lost) {
  const name = slipCallName(slip) || 'Slip';
  return lost ? `${name} lost · ${won} of ${played} legs won` : `${name} won · ${won} of ${played} legs`;
}
