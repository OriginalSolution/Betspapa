/**
 * Shots from outside the penalty area, read off Sportradar match_timeline
 * coordinates. This feed has no named outside-box stat. Home shots attack
 * X=100 and away shots attack X=0 in both halves (the timeline is already
 * oriented that way). The 18-yard box is 16.5m deep and 40.32m wide on a
 * 105m by 68m pitch, scaled onto the 0–100 coordinate grid.
 *
 * Checked against published counts: Brentford 4–0 Everton (23 Nov 2026)
 * came out 4 and 2, the same as the public split. Everton 3–1 Coventry
 * (6 Nov 2026) came out 3 and 5 against a published 3 and 7; that timeline
 * is missing shots (11 events versus 15 reported), so the count can run low.
 */

export const PITCH_LENGTH_M = 105;
export const PITCH_WIDTH_M = 68;
export const BOX_DEPTH_M = 16.5;
export const BOX_WIDTH_M = 40.32;
export const OUTSIDE_MARKET = '800054';
export const OUTSIDE_PART = 50;
export const OUTSIDE_MIN_SAMPLE = 8;
export const OUTSIDE_LAST_N = 10;

const SHOTS = new Set(['shotontarget', 'shotofftarget', 'shotblocked']);
const TIER_RANK = { '100': 3, '90': 2, '80': 1 };

export function boxLimits() {
  const depth = (BOX_DEPTH_M / PITCH_LENGTH_M) * 100;
  const half = ((BOX_WIDTH_M / 2) / PITCH_WIDTH_M) * 100;
  return { depth, y0: 50 - half, y1: 50 + half };
}

/** True when the shot is outside the box, false when inside, null when the position cannot be read. */
export function shotOutsideBox(event) {
  const x = Number(event?.X);
  const y = Number(event?.Y);
  const team = event?.team;
  if (!Number.isFinite(x) || !Number.isFinite(y) || (team !== 'home' && team !== 'away')) return null;
  const { depth, y0, y1 } = boxLimits();
  const inWidth = y >= y0 && y <= y1;
  const inside = team === 'home' ? x >= 100 - depth && inWidth : x <= depth && inWidth;
  return !inside;
}

/** Match total of shots outside the box. A timeline with no shots, or a shot with no X/Y, is not a sample. Goals are not counted again; they repeat the shot. */
export function matchOutsideTotal(events) {
  const shots = (events || []).filter((event) => !event?.disabled && SHOTS.has(event?.type));
  if (!shots.length) return { valid: false, total: null };
  let total = 0;
  for (const shot of shots) {
    const outside = shotOutsideBox(shot);
    if (outside == null) return { valid: false, total: null };
    if (outside) total += 1;
  }
  return { valid: true, total };
}

/** 100 is 10/10 only. A shorter complete sample stays 90+ so it is not labelled 10/10. */
export function outsideTier(hits, n) {
  const games = Number(n) || 0;
  const made = Number(hits) || 0;
  if (games < OUTSIDE_MIN_SAMPLE) return '';
  if (made === 10 && games === 10) return '100';
  const rate = made / games;
  if (rate >= 0.9 - 1e-9) return '90';
  if (rate >= 0.8 - 1e-9) return '80';
  return '';
}

function lowerTier(left, right) {
  return (TIER_RANK[left] || 0) <= (TIER_RANK[right] || 0) ? left : right;
}

/**
 * Highest line at the best tier both teams reach.
 * A line counts only when each team hit it in at least 8 of a sample of at least 8.
 */
export function pickOutsideLine(lines, home, away) {
  if (!home || !away || home.n < OUTSIDE_MIN_SAMPLE || away.n < OUTSIDE_MIN_SAMPLE) return null;
  const qualified = [];
  for (const offer of lines || []) {
    const line = Number(offer?.line);
    const odds = Number(offer?.odds);
    if (!Number.isFinite(line) || !(odds > 1)) continue;
    const homeHits = (home.totals || []).filter((total) => total >= line).length;
    const awayHits = (away.totals || []).filter((total) => total >= line).length;
    const tier = lowerTier(outsideTier(homeHits, home.n), outsideTier(awayHits, away.n));
    if (!tier) continue;
    qualified.push({ ...offer, line, odds, tier, homeHits, awayHits, homeN: home.n, awayN: away.n });
  }
  if (!qualified.length) return null;
  const best = Math.max(...qualified.map((row) => TIER_RANK[row.tier] || 0));
  return qualified
    .filter((row) => (TIER_RANK[row.tier] || 0) === best)
    .sort((a, b) => b.line - a.line || a.odds - b.odds)[0];
}

export function outsideTierLabel(tier, play = false) {
  if (play) {
    if (tier === '100') return '10/10';
    if (tier === '90') return '9/10+';
    if (tier === '80') return '8/10+';
  }
  if (tier === '100') return '100';
  if (tier === '90') return '90+';
  if (tier === '80') return '80+';
  return '';
}

/** Last 10 finished competitive matches, newest first. Friendlies are not part of the sample. */
export function competitiveMatchIds(payload, limit = OUTSIDE_LAST_N) {
  const data = payload?.doc?.[0]?.data || {};
  const tournaments = data.tournaments || {};
  const ids = [];
  for (const match of data.matches || []) {
    if (match?.postponed || match?.walkover || match?.retired || match?.canceled) continue;
    const tournament = tournaments[String(match?._tid || '')] || {};
    if (tournament.friendly) continue;
    if (match?.result?.home == null || match?.result?.away == null) continue;
    if (!match?._id) continue;
    ids.push(String(match._id));
    if (ids.length >= limit) break;
  }
  return ids;
}
