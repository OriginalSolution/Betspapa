import { describe, expect, it } from 'vitest';
import type { EngineState } from './engineSlips';
import { slipFromPublishedCode } from './trackedSlips';

const state = {
  updatedAt: '2026-11-27T08:00:00.000Z',
  master: null,
  trends: [
    {
      id: '80:dc-12',
      label: '80%+ Double chance 12',
      market: 'dc-12',
      legCount: 1,
      sameAsMaster: false,
      bookedAt: '2026-11-27T07:00:00.000Z',
      legs: [
        {
          eventId: 'sr:match:77065630',
          market: 'dc-12',
          match: 'Broadmeadow Magic FC vs Lions FC',
          kickoff: '2026-11-27T08:30:00.000Z',
          odds: 1.23,
          occurrence: 10,
          sample: '10/10',
          homeCrest: null,
          awayCrest: null,
        },
      ],
      books: {
        sportybet: {
          parts: [{ code: 'B2PJ62', link: 'https://www.sportybet.com/gh/?shareCode=B2PJ62', totalOdds: 28.13, legs: 1, matches: ['sr:match:77065630'] }],
          error: null,
          dropped: [],
        },
      },
    },
  ],
} as EngineState;

describe('published code import', () => {
  it('tracks the real legs of a code the engine published', () => {
    const slip = slipFromPublishedCode(state, 'b2pj62');
    expect(slip?.label).toBe('80%+ Double chance 12');
    expect(slip?.parts[0]?.code).toBe('B2PJ62');
    expect(slip?.legs.map((leg) => leg.home)).toEqual(['Broadmeadow Magic FC']);
  });

  it('does not invent a slip for a code that was not published', () => {
    expect(slipFromPublishedCode(state, 'ZZZZZZ')).toBeNull();
  });
});
