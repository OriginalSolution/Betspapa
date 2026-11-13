import { describe, expect, it } from 'vitest';
import type { EngineState } from './engineSlips';
import { marketCodeCards, masterParts, shortMarket } from './trendDesk';

function state(): EngineState {
  return {
    updatedAt: '2026-11-13T16:57:00.000Z',
    master: {
      id: 'master',
      label: '80%+ Master Slip',
      market: null,
      legCount: 2,
      legs: [
        { eventId: 'sr:match:1', market: 'over15', match: 'Nigeria vs Tanzania', kickoff: '2026-11-13T19:00:00.000Z', odds: 1.21, occurrence: 92, sample: '9/10' },
        { eventId: 'sr:match:2', market: 'home', match: 'Alpha SRL vs Beta SRL', kickoff: '2026-11-13T19:00:00.000Z', odds: 1.4, occurrence: 80, sample: '8/10' },
        { eventId: 'sr:match:3', market: 'btts', match: 'Hearts vs Kotoko', kickoff: '2026-11-13T20:00:00.000Z', odds: 1.08, occurrence: 90, sample: '9/10' },
      ],
      sameAsMaster: false,
      bookedAt: '2026-11-13T16:57:00.000Z',
      books: {
        sportybet: {
          parts: [
            { code: 'REAL1042', link: 'https://www.sportybet.com/gh/?shareCode=REAL1042', totalOdds: 3.84, legs: 8 },
            { code: 'REAL1043', link: 'https://www.sportybet.com/gh/?shareCode=REAL1043', totalOdds: 2.1, legs: 4 },
          ],
          error: null,
          dropped: [],
        },
        betika: { parts: [], error: 'No open selections on this bookmaker.', dropped: [] },
      },
    },
    trends: [
      {
        id: '80:over15',
        label: '80%+ Over 1.5 goals',
        market: 'over15',
        legCount: 1,
        legs: [{ eventId: 'sr:match:1', market: 'over15', match: 'Nigeria vs Tanzania', kickoff: '2026-11-13T19:00:00.000Z', odds: 1.21, occurrence: 92, sample: '9/10' }],
        sameAsMaster: false,
        bookedAt: '2026-11-13T16:57:00.000Z',
        books: {
          sportybet: {
            parts: [{ code: 'OVR1588', link: 'https://www.sportybet.com/gh/?shareCode=OVR1588', totalOdds: 2.41, legs: 6 }],
            error: null,
            dropped: [],
          },
        },
      },
    ],
  };
}

describe('trend desk codes', () => {
  it('uses a real master code and numbers a split slip', () => {
    const face = masterParts(state(), 'sportybet');
    expect(face.parts.map((part) => part.code)).toEqual(['REAL1042', 'REAL1043']);
    expect(face.parts[0]).toMatchObject({ index: 1, total: 2, odds: '3.84', legs: 8 });
    expect(face.legs.map((leg) => leg.eventId)).toEqual(['sr:match:1']);
    expect(face.bookedAt).toBe('2026-11-13T16:57:00.000Z');
  });

  it('does not invent a code when the desk has none this cycle', () => {
    expect(masterParts(state(), 'betika').parts).toEqual([]);
    expect(masterParts(null, 'msport').parts).toEqual([]);
  });

  it('builds a market card from that desk and leaves the code empty when the desk missed it', () => {
    expect(shortMarket('over15')).toBe('Over 1.5');
    expect(shortMarket('btts')).toBe('BTTS yes');
    const sporty = marketCodeCards(state(), 'sportybet');
    expect(sporty).toEqual([{ id: '80:over15', market: 'over15', label: 'Over 1.5', codes: ['OVR1588'], legs: 6, odds: '2.41' }]);
    expect(marketCodeCards(state(), 'betpawa')[0]?.codes).toEqual([]);
  });
});
