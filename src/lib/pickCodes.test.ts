import { describe, expect, it } from 'vitest';
import { parseEngine } from './engineSlips';
import { playTierPhrase, showsInTier, slipParts, tierLabel, tierSlip } from './pickCodes';
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
  it('keeps percent tiers on the website and form tiers in the Play build', () => {
    expect(tierLabel('100', false)).toBe('100%');
    expect(tierLabel('90', false)).toBe('90%+');
    expect(tierLabel('80', false)).toBe('80%+');
    expect(tierLabel('100', true)).toBe('10/10');
    expect(tierLabel('90', true)).toBe('9/10+');
    expect(tierLabel('80', true)).toBe('8/10+');
    expect(playTierPhrase('80%+ Over 1.5 goals', false)).toBe('80%+ Over 1.5 goals');
    expect(playTierPhrase('100% all picks', true)).toBe('10/10 all picks');
    expect(playTierPhrase('90%+ Over 1.5', true)).toBe('9/10+ Over 1.5');
    expect(playTierPhrase('Every 80%+ pick, graded from the full-time score', true)).toBe('Every 8/10+ pick, graded from the full-time score');
    expect(playTierPhrase('The Betspapa record: every published 80%+ pick, graded from the full-time score.', true)).toBe(
      'The Betspapa record: every published 8/10+ pick, graded from the full-time score.',
    );
  });

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
    const agreed = { eventId: 'sr:match:5', market: 'over15', odds: 1.25, kickoff: '2026-11-13T22:00:00.000Z', rate: 0.6, teamsAgree: true };
    expect(legsForTier([agreed], '80', null, now)).toEqual([]);
    expect(legsForTier([agreed], '90', null, now)).toEqual([]);
    expect(showsInTier(0.6, '80', true)).toBe(false);
    expect(showsInTier(0.6, '100', true)).toBe(false);
    expect(showsInTier(1, '100', false)).toBe(true);
  });
});
