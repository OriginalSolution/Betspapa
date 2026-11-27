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

/** The short pick name on a card: "Over 1.5", "Home win". */
export function pickName(label) {
  const text = String(label || '').replace(/\s+/g, ' ').trim();
  const named = {
    'full-time home win': 'Home win',
    'full-time away win': 'Away win',
    'full-time draw': 'Draw',
    'over 0.5 goals': 'Over 0.5',
    'over 1.5 goals': 'Over 1.5',
    'over 2.5 goals': 'Over 2.5',
    'over 3.5 goals': 'Over 3.5',
    'under 1.5 goals': 'Under 1.5',
    'under 2.5 goals': 'Under 2.5',
    'under 3.5 goals': 'Under 3.5',
    'both teams to score': 'Both teams to score',
    'both teams not to score': 'Both teams not to score',
    'home team to score': 'Home to score',
    'away team to score': 'Away to score',
  };
  if (named[text.toLowerCase()]) return named[text.toLowerCase()];
  return text.replace(/ goals$/i, '') || 'Pick';
}

/** FT when the match is over, otherwise the minute. */
export function settleClock(match) {
  if (!match) return '';
  if (match.status === 'finished') return 'FT';
  if (match.status === 'halftime') return 'HT';
  return minuteMark(match.minute);
}

/** True when the text is only the words "Trend hit", with optional trailing punctuation. */
export function bareTrend(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim().replace(/[.!]+$/g, '').trim();
  return text.toLowerCase() === 'trend hit';
}

/** The pick after a middle dot, or '' when the title has none. "Trend hit" is not a pick. */
export function afterMark(title) {
  const text = String(title || '');
  const cut = Math.max(text.indexOf('·'), text.indexOf('\u00b7'));
  if (cut < 0) return '';
  const rest = text.slice(cut + 1).replace(/\s+/g, ' ').trim();
  return rest && !bareTrend(rest) ? rest : '';
}

/** "Arsenal 2-1 Chelsea FT". The clock is left off when the score already contains it. */
export function scoreWithClock(score, clock) {
  const line = String(score || '').replace(/\s+/g, ' ').trim();
  const mark = String(clock || '').replace(/\s+/g, ' ').trim();
  if (!line) return mark;
  if (!mark || line.includes(mark)) return line;
  return `${line} ${mark}`;
}

/** One line of the detail a settle card must keep. Empty pieces are left out. "Trend hit" alone is never a piece. */
export function settleText(parts) {
  const seen = new Set();
  const rows = [];
  for (const part of parts) {
    const text = String(part || '').replace(/\s+/g, ' ').trim();
    if (!text || bareTrend(text) || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    rows.push(text);
  }
  return rows.join(' · ');
}

/**
 * The text under a settle title. Structured pieces win over a body that is only "Trend hit".
 * A shorter written body is kept only when it already carries the score.
 */
export function settleBody({ written = '', score = '', clock = '', market = '', tier = '', odds = '', slip = '', code = '', progress = '' } = {}) {
  const line = settleText([scoreWithClock(score, clock), market, tier, odds, slip, code, progress]);
  const body = String(written || '').replace(/\s+/g, ' ').trim();
  if (line && (bareTrend(body) || !body || line.length > body.length)) return line;
  if (body && !bareTrend(body)) return body;
  return line || 'Pick settled';
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
