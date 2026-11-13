import { describe, expect, it } from 'vitest';
import { buildPicks, qualifying, trendsFromPicks } from '../data/board';
import { trendHitNotices } from './alerts';
import { publishableOdds } from './oddsFloor';
import type { Match } from '../types';

function match(): Match {
  return {
    id: 'sr:match:10',
    competition: { id: 'cup', name: 'Cup', area: 'Ghana', code: 'GHA', priority: 12 },
    utcDate: '2026-11-12T18:00:00.000Z',
    status: 'scheduled',
    minute: null,
    injuryTime: null,
    home: { id: 'alpha', name: 'Alpha', shortName: 'Alpha', abbr: 'ALP', color: '#e11d2e' },
    away: { id: 'beta', name: 'Beta', shortName: 'Beta', abbr: 'BET', color: '#111' },
    homeScore: null,
    awayScore: null,
    htHome: null,
    htAway: null,
    events: [],
    venue: null,
    odds: { home: 1.19, draw: 3.4, away: 4.2, 'over-15': 1.08, 'over-25': 1.2, 'over-35': 1.22 },
    feed: 'sporty',
  };
}

describe('odds floor', () => {
  it('keeps 1.20 and drops anything shorter from picks, trends, slips, and hit alerts', () => {
    expect(publishableOdds(1.2)).toBe(true);
    expect(publishableOdds(1.199)).toBe(false);
    expect(publishableOdds(1.01)).toBe(false);
    expect(publishableOdds(1.04)).toBe(false);
    expect(publishableOdds(1.08)).toBe(false);
    const picks = buildPicks([match()]);
    expect(picks.length).toBeGreaterThan(0);
    expect(picks.every((pick) => pick.odds >= 1.2)).toBe(true);
    expect(picks.some((pick) => pick.market === 'over25' && pick.odds === 1.2)).toBe(true);
    expect(picks.some((pick) => pick.market === 'over15' || pick.market === 'home')).toBe(false);
    const heavy = match();
    heavy.id = 'sr:match:pesh';
    heavy.home = { ...heavy.home, shortName: 'AL Peshmerga' };
    heavy.away = { ...heavy.away, shortName: 'Al-Qasim SC' };
    heavy.odds = { home: 1.01, draw: 8, away: 12 };
    const other = match();
    other.id = 'sr:match:short';
    other.odds = { home: 1.04, draw: 6, away: 9 };
    const priced = buildPicks([heavy, other, match()]);
    expect(priced.some((pick) => pick.odds < 1.2)).toBe(false);
    expect(priced.some((pick) => pick.label.includes('AL Peshmerga') && pick.market === 'home')).toBe(false);
    expect(priced.some((pick) => pick.odds === 1.04)).toBe(false);
    const trends = trendsFromPicks(picks);
    expect(trends.every((trend) => picks.some((pick) => pick.id === trend.id && pick.odds >= 1.2))).toBe(true);
    expect(qualifying(picks).every((pick) => pick.odds >= 1.2)).toBe(true);
    const followed = picks.map((pick) => pick.id);
    const short = { ...picks[0], id: 'sr:match:10:over15', odds: 1.08, status: 'won' as const };
    const notes = trendHitNotices([short, ...picks], [short.id, ...followed], new Set(), Date.now());
    expect(notes.some((note) => note.id.includes('over15'))).toBe(false);
    expect(notes.every((note) => note.id !== 'trend:sr:match:10:over15:hit')).toBe(true);
  });
});
