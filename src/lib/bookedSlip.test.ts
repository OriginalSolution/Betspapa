import { describe, expect, it } from 'vitest';
import { coverageLine, desksFromBooking, partSummary } from './bookedSlip';

describe('booked slip coverage', () => {
  it('says when a bookmaker missed legs and keeps only returned codes', () => {
    expect(coverageLine(75, 75, 2)).toBe('75 of 75 legs · 2 codes');
    expect(coverageLine(41, 75, 5)).toBe('41 of 75 legs · 34 not booked · 5 codes');
    const desks = desksFromBooking(
      3,
      [[{ eventId: 'a', kickoff: '2026-11-23T10:00:00.000Z' }, { eventId: 'b', kickoff: '2026-11-23T12:00:00.000Z' }]],
      [{
        books: {
          sportybet: { parts: [{ code: 'D9A890', legs: 2, matches: ['a', 'b'] }] },
          betpawa: { parts: [{ code: 'PNS1K6', legs: 1, matches: ['a'] }], error: null },
          msport: { parts: [], error: 'No open selections' },
        },
      }],
    );
    expect(desks.map((desk) => desk.desk)).toEqual(['sportybet', 'msport', 'betpawa']);
    expect(desks[0].missed).toBe(1);
    expect(desks[0].parts[0].matches).toBe(2);
    expect(partSummary(desks[0].parts[0])).toContain('2 legs · 2 matches');
    expect(desks[2].bookedLegs).toBe(1);
    expect(desks[2].missed).toBe(2);
  });
});
