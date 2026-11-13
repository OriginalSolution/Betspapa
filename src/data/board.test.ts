import { describe, expect, it } from 'vitest';
import { projectDemo } from './project';
import { applyShares, bookingCodes, buildPicks, listTrends, qualifying, rankLedger, seedLedger, settle, trendsFromPicks } from './board';
import type { Match } from '../types';

const t0 = Date.parse('2026-11-10T18:00:00Z');
const today = '2026-11-10';

function board(elapsed: number) {
  return projectDemo({ t0, now: t0 + elapsed, selectedDate: today, todayDate: today });
}

describe('trends and picks', () => {
  it('bookmarks only trends above 80% and keeps a developing one visible', () => {
    const trends = listTrends();
    expect(trends.find((trend) => trend.id === 'ars-over35')?.bookmarked).toBe(true);
    expect(trends.find((trend) => trend.id === 'tot-home')?.bookmarked).toBe(false);
    expect(trends.find((trend) => trend.id === 'bha-score')?.developing).toBe(true);
  });

  it('raises Arsenal over 3.5 because Liverpool concede, and softens Villa', () => {
    const picks = buildPicks(board(0));
    const arsenal = picks.find((pick) => pick.id === 'ars-liv:ars-over35');
    const villa = picks.find((pick) => pick.id === 'avl-bha:avl-home');
    expect(arsenal?.support).toBe(1);
    expect(arsenal?.confidence).toBeGreaterThan(0.8);
    expect(arsenal?.softened).toBe(false);
    expect(villa?.support).toBe(-1);
    expect(villa?.softened).toBe(true);
    expect(qualifying(picks).some((pick) => pick.id === villa?.id)).toBe(false);
  });

  it('gives qualifying picks distinct prices that can sort both ways', () => {
    const prices = qualifying(buildPicks(board(0))).map((pick) => pick.odds);
    expect(new Set(prices).size).toBeGreaterThan(1);
    const ascending = [...prices].sort((a, b) => a - b);
    const descending = [...prices].sort((a, b) => b - a);
    expect(ascending[0]).toBeLessThan(ascending[ascending.length - 1]);
    expect(descending[0]).toBeGreaterThan(descending[descending.length - 1]);
  });
});

describe('VAR settlement', () => {
  it('does not settle Over 3.5 during VAR and wins it only when the goal is confirmed', () => {
    const before = buildPicks(board(16_000)).find((pick) => pick.id === 'ars-liv:ars-over35');
    const during = buildPicks(board(24_000)).find((pick) => pick.id === 'ars-liv:ars-over35');
    const after = buildPicks(board(32_000)).find((pick) => pick.id === 'ars-liv:ars-over35');
    expect(before?.status).toBe('open');
    expect(during?.status).toBe('open');
    expect(after?.status).toBe('won');
  });

  it('busts the Ajax clean sheet when PSV score and wins Chelsea to score', () => {
    expect(buildPicks(board(0)).find((pick) => pick.id === 'aja-psv:aja-clean')?.status).toBe('open');
    expect(buildPicks(board(32_000)).find((pick) => pick.id === 'aja-psv:aja-clean')?.status).toBe('bust');
    expect(buildPicks(board(8_000)).find((pick) => pick.id === 'che-mci:che-score')?.status).toBe('open');
    expect(buildPicks(board(24_000)).find((pick) => pick.id === 'che-mci:che-score')?.status).toBe('won');
  });

  it('tracks the same won legs at each bookmaker until a real share code arrives', () => {
    const picks = qualifying(buildPicks(board(32_000)));
    const slip = picks.filter((pick) => pick.id === 'ars-liv:ars-over35' || pick.id === 'che-mci:che-score');
    const codes = bookingCodes(slip);
    expect(codes.map((code) => code.name)).toEqual(['SportyBet', 'Football.com', 'MSport', 'Betika', 'BetPawa']);
    for (const code of codes) {
      expect(code.bookingState).toBe('unavailable');
      expect(code.code).toBe('');
      expect(code.status).toBe('won');
      expect(code.legs.map((leg) => leg.market).sort()).toEqual(['home-score', 'over35']);
    }
    const live = applyShares(codes, {
      status: 'ready',
      books: {
        sportybet: { parts: [{ code: 'DPA1QE', link: 'https://www.sportybet.com/gh/?shareCode=DPA1QE', totalOdds: 1.04, legs: 1 }] },
        betika: { parts: [], error: 'No open selections on this bookmaker.' },
      },
    });
    expect(live.find((code) => code.id === 'sportybet')?.bookingState).toBe('ready');
    expect(live.find((code) => code.id === 'sportybet')?.code).toBe('DPA1QE');
    expect(live.find((code) => code.id === 'betika')?.bookingState).toBe('error');
    expect(live.find((code) => code.id === 'footballcom')?.bookingState).toBe('unavailable');
    expect(settle('over35', board(24_000).find((match) => match.id === 'ars-liv')!, true)).toBe('open');
  });
});

describe('occurrence on a real fixture', () => {
  const match = {
    id: 'sr:match:77',
    competition: { id: 'nations', name: 'Nations League', area: 'International', code: 'INT', priority: 4 },
    utcDate: '2026-11-13T19:45:00.000Z',
    status: 'scheduled',
    minute: null,
    injuryTime: null,
    home: { id: 'bulgaria', name: 'Bulgaria', shortName: 'Bulgaria', abbr: 'BUL', color: '#21a366' },
    away: { id: 'iceland', name: 'Iceland', shortName: 'Iceland', abbr: 'ISL', color: '#3d7eff' },
    homeScore: null,
    awayScore: null,
    htHome: null,
    htAway: null,
    events: [],
    venue: null,
    feed: 'sporty',
    odds: { home: 1.22, draw: 3.4, away: 4.2, 'over-15': 1.8, 'btts-yes': 1.9 },
    occurrence: [
      { market: 'home', hits: 4, sample: 10, rate: 0.4 },
      { market: 'over15', hits: 9, sample: 10, rate: 0.9 },
      { market: 'btts', hits: 8, sample: 10, rate: 0.8 },
    ],
  } as Match;

  it('bookmarks the record, not the short price, and shows the sample', () => {
    const picks = buildPicks([match]);
    const home = picks.find((pick) => pick.market === 'home');
    const over = picks.find((pick) => pick.market === 'over15');
    const both = picks.find((pick) => pick.market === 'btts');
    expect(home?.bookmarked).toBe(false);
    expect(over?.bookmarked).toBe(true);
    expect(over?.rate).toBeCloseTo(0.9);
    expect(both?.bookmarked).toBe(true);
    expect(qualifying(picks).map((pick) => pick.market).sort()).toEqual(['btts', 'over15']);
    const trend = trendsFromPicks(picks).find((row) => row.market === 'over15');
    expect(trend?.sample).toBe(10);
    expect(trend?.hits).toBe(9);
    expect(trend?.note).toBe('9 of the last 10 matches.');
  });
});

describe('rankings', () => {
  it('keeps week, month, and year windows distinct', () => {
    const now = Date.parse('2026-11-10T12:00:00Z');
    const ledger = seedLedger(now);
    const week = rankLedger(ledger, 'week', now, 'market');
    const year = rankLedger(ledger, 'year', now, 'team');
    expect(week.length).toBeGreaterThan(0);
    expect(year.reduce((sum, row) => sum + row.played, 0)).toBeGreaterThan(week.reduce((sum, row) => sum + row.played, 0));
  });
});
