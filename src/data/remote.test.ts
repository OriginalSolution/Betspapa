import { describe, expect, it } from 'vitest';
import { dayRangeIso } from '../lib/dates';
import { fetchSportyBoard, FIXTURE_FEED, type FixtureResult, type FixtureTransport } from './remote';
import type { SportyEvent } from './sporty';

function event(kickoff: string): SportyEvent {
  return {
    eventId: 'sr:match:72221406',
    home: 'Man City',
    away: 'Fulham',
    kickoff,
    tournament: 'Premier League',
    country: 'England',
    odds: { home: 1.45, over15: 1.14 },
  };
}

function kickoffOn(date: string): string {
  const { from } = dayRangeIso(date);
  return new Date(new Date(from).getTime() + 60_000).toISOString();
}

function transport(partial: Partial<FixtureTransport> & Pick<FixtureTransport, 'native'>): FixtureTransport {
  return {
    local: async () => {
      throw new Error('local should not be called');
    },
    direct: async () => {
      throw new Error('direct should not be called');
    },
    ...partial,
  };
}

describe('fixture loading', () => {
  it('reads the official feed on Android without the website proxy', async () => {
    let localCalls = 0;
    let directUrl = '';
    const matches = await fetchSportyBoard(
      '2026-11-10',
      transport({
        native: true,
        local: async () => {
          localCalls += 1;
          return { status: 500, body: {} };
        },
        direct: async (url) => {
          directUrl = url;
          return { status: 200, body: { source: 'sportybet', events: [event(kickoffOn('2026-11-10'))] } };
        },
      }),
    );
    expect(localCalls).toBe(0);
    expect(directUrl).toBe(FIXTURE_FEED);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.home.name).toBe('Man City');
    expect(matches[0]?.feed).toBe('sporty');
    expect(matches[0]?.odds?.home).toBe(1.45);
  });

  it('keeps a real empty day empty', async () => {
    const matches = await fetchSportyBoard(
      '2026-11-10',
      transport({
        native: true,
        direct: async () => ({ status: 200, body: { events: [event('2026-12-01T15:00:00.000Z')] } }),
      }),
    );
    expect(matches).toEqual([]);
  });

  it('uses the same-origin proxy in the browser and does not call the direct feed', async () => {
    let directCalls = 0;
    const matches = await fetchSportyBoard(
      '2026-11-10',
      transport({
        native: false,
        local: async () => ({ status: 200, body: { events: [event(kickoffOn('2026-11-10'))] } }),
        direct: async () => {
          directCalls += 1;
          return { status: 200, body: { events: [] } };
        },
      }),
    );
    expect(directCalls).toBe(0);
    expect(matches).toHaveLength(1);
  });

  it('reports the API rejection and does not invent matches', async () => {
    const rejected: FixtureResult = { status: 403, body: { message: 'Origin not allowed by CORS: https://localhost' } };
    await expect(
      fetchSportyBoard(
        '2026-11-10',
        transport({
          native: true,
          direct: async () => rejected,
        }),
      ),
    ).rejects.toThrow('Origin not allowed by CORS: https://localhost');
  });
});
