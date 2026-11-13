import { describe, expect, it } from 'vitest';
import { bookingForPick, deskBook, engineHasCodes, parseEngine, preferEngine, showOdds, visibleLegs } from './engineSlips';

const payload = {
  updatedAt: '2026-11-13T07:58:55.651Z',
  master: {
    id: 'master',
    label: 'Master slip',
    market: null,
    legCount: 2,
    legs: [
      { eventId: 'sr:match:1', market: 'over15', match: 'Alpha vs Beta', kickoff: '2026-11-13T16:00:00.000Z', odds: 1.2, occurrence: 90, sample: '9/10' },
      { eventId: 'sr:match:2', market: 'home', match: 'Gamma vs Delta', kickoff: '2026-11-13T18:00:00.000Z', odds: 1.15 },
    ],
    sameAsMaster: false,
    bookedAt: '2026-11-13T07:57:26.279Z',
    books: {
      sportybet: {
        parts: [{ code: 'FMS75V', link: 'https://www.sportybet.com/gh/?shareCode=FMS75V', totalOdds: 2.4, legs: 2 }],
        error: null,
        dropped: [],
      },
      footballcom: {
        parts: [{ code: '867CAR', link: 'https://www.football.com/gh/?shareCode=867CAR', totalOdds: 1.2, legs: 1 }],
        error: null,
        dropped: [{ eventId: 'sr:match:2', market: 'home', match: 'Gamma vs Delta', reason: 'Not open on Football.com.' }],
      },
      betika: { parts: [], error: 'No open selections on this bookmaker.', dropped: [] },
      msport: { parts: [{ code: 'nope', link: 'https://evil.example/nope', totalOdds: 9, legs: 1 }], error: null, dropped: [] },
    },
  },
  trends: [
    {
      id: 'price:over15',
      label: 'Over 1.5 goals',
      market: 'over15',
      legCount: 1,
      legs: [{ eventId: 'sr:match:1', market: 'over15', match: 'Alpha vs Beta', kickoff: '2026-11-13T16:00:00.000Z', odds: 1.2 }],
      sameAsMaster: false,
      bookedAt: '2026-11-13T07:57:26.279Z',
      books: {
        sportybet: {
          parts: [{ code: '89ANH4', link: 'https://www.sportybet.com/gh/?shareCode=89ANH4', totalOdds: 1.2, legs: 1 }],
          error: null,
          dropped: [],
        },
      },
    },
  ],
};

describe('engine slips', () => {
  it('keeps real codes and drops a code that is not from a bookmaker link', () => {
    const state = parseEngine(payload);
    expect(state.master?.books.sportybet?.parts[0]?.code).toBe('FMS75V');
    expect(state.trends[0]?.id).toBe('price:over15');
    expect(deskBook(state.master, 'msport').parts).toEqual([]);
    expect(deskBook(state.master, 'betika').parts).toEqual([]);
    expect(deskBook(state.master, 'betika').error).toBe('No open selections on this bookmaker.');
    expect(deskBook(state.master, 'footballcom').dropped).toHaveLength(1);
    expect(deskBook(state.master, 'betpawa').parts).toEqual([]);
  });

  it('hides prices under 1.20 and prefers the trend code for a leg', () => {
    const state = parseEngine(payload);
    expect(showOdds(1.2)).toBe('1.20');
    expect(showOdds(1.19)).toBeNull();
    expect(visibleLegs(state.master).map((leg) => leg.eventId)).toEqual(['sr:match:1']);
    expect(visibleLegs(state.master)[0]?.occurrence).toBe(90);
    expect(visibleLegs(state.master)[0]?.sample).toBe('9/10');
    expect(bookingForPick(state, 'sr:match:1', 'over15')).toEqual({ bookId: 'sportybet', code: '89ANH4' });
    expect(bookingForPick(state, 'sr:match:9', 'over15')).toBeNull();
  });

  it('keeps a cached booked board when the feed comes back empty', () => {
    const cached = parseEngine(payload);
    const empty = parseEngine({ updatedAt: null, master: null, trends: [] });
    expect(engineHasCodes(cached)).toBe(true);
    expect(engineHasCodes(empty)).toBe(false);
    const kept = preferEngine(empty, cached);
    expect(kept.showingCached).toBe(true);
    expect(kept.master?.books.sportybet?.parts[0]?.code).toBe('FMS75V');
    expect(kept.updatedAt).toBe(cached.updatedAt);
    expect(preferEngine(cached, empty).showingCached).toBeUndefined();
  });
});
