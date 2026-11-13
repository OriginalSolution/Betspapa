import { describe, expect, it } from 'vitest';
import { parseEngine } from './engineSlips';
import { slipParts, tierSlip } from './pickCodes';
import { legsForTier } from './bookFollow';

const state = parseEngine({
  updatedAt: '2026-11-13T18:00:00.000Z',
  master: null,
  trends: [
    {
      id: '80:over15',
      label: 'Over 1.5',
      market: 'over15',
      legCount: 1,
      legs: [],
      books: { sportybet: { parts: [{ code: 'OLD15', link: 'https://www.sportybet.com/gh/?shareCode=OLD15', totalOdds: 1.4, legs: 1 }], error: null, dropped: [] } },
    },
  ],
  tiers: [
    {
      id: 'tier:90',
      label: '90%+ all picks',
      market: null,
      legCount: 2,
      legs: [],
      bookedAt: '2026-11-13T18:05:00.000Z',
      books: { sportybet: { parts: [{ code: 'NINETY', link: 'https://www.sportybet.com/gh/?shareCode=NINETY', totalOdds: 2.4, legs: 2 }], error: null, dropped: [] } },
    },
    {
      id: 'tier:90:over15',
      label: '90%+ Over 1.5',
      market: 'over15',
      legCount: 1,
      legs: [],
      books: { sportybet: { parts: [{ code: 'N15OK', link: 'https://www.sportybet.com/gh/?shareCode=N15OK', totalOdds: 1.3, legs: 1 }], error: null, dropped: [] } },
    },
  ],
});

describe('pick codes', () => {
  it('uses the tier slip and falls back to the 80% market code', () => {
    expect(slipParts(tierSlip(state, '90', null), 'sportybet').parts[0]?.code).toBe('NINETY');
    expect(slipParts(tierSlip(state, '90', 'over15'), 'sportybet').parts[0]?.code).toBe('N15OK');
    expect(slipParts(tierSlip(state, '80', 'over15'), 'sportybet').parts[0]?.code).toBe('OLD15');
    expect(tierSlip(state, '100', 'over15')).toBeNull();
  });

  it('keeps a followed leg only when it is still open and inside the tier', () => {
    const legs = [
      { eventId: 'sr:match:1', market: 'over15', odds: 1.3, kickoff: '2026-11-13T22:00:00.000Z', rate: 1 },
      { eventId: 'sr:match:2', market: 'over25', odds: 1.4, kickoff: '2026-11-13T22:00:00.000Z', rate: 0.8 },
      { eventId: 'sr:match:3', market: 'home', odds: 1.15, kickoff: '2026-11-13T22:00:00.000Z', rate: 1 },
      { eventId: 'sr:match:4', market: 'away', odds: 1.5, kickoff: '2026-11-13T12:00:00.000Z', rate: 1 },
    ];
    const now = Date.parse('2026-11-13T18:00:00.000Z');
    expect(legsForTier(legs, '100', null, now).map((leg) => leg.eventId)).toEqual(['sr:match:1']);
    expect(legsForTier(legs, '80', 'over25', now).map((leg) => leg.eventId)).toEqual(['sr:match:2']);
  });
});
