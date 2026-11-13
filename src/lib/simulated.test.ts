import { describe, expect, it } from 'vitest';
import { mapSportyEvents } from '../data/sporty';
import { isDummyEventId, isSimulatedFixture } from './simulated';

describe('simulated fixtures', () => {
  it('drops Simulated Reality League, virtual, and eSoccer, and keeps a real SRL club', () => {
    expect(
      isSimulatedFixture({
        country: 'Simulated Reality League',
        tournament: 'UEFA Nations League SRL',
        home: 'Andorra SRL',
        away: 'Gibraltar SRL',
      }),
    ).toBe(true);
    expect(isSimulatedFixture({ country: 'Esports', tournament: 'eSoccer Battle', home: 'Alpha', away: 'Beta' })).toBe(true);
    expect(isSimulatedFixture({ country: 'Virtual', tournament: 'Virtual Euro', home: 'A', away: 'B' })).toBe(true);
    expect(
      isSimulatedFixture({
        country: 'Italy',
        tournament: 'Serie C, Group C',
        home: 'Barletta Calcio',
        away: "Altamura Societa' Sportiva SRL",
      }),
    ).toBe(false);
    expect(isSimulatedFixture({ tournament: 'Premier League', country: 'England', home: 'Arsenal', away: 'Chelsea' })).toBe(false);
    expect(isDummyEventId('sr:match:111111114672527')).toBe(true);
    expect(isDummyEventId('dummy-match-1')).toBe(true);
    expect(isDummyEventId('sr:match:75803688')).toBe(false);
  });

  it('leaves simulated events out of the upcoming board', () => {
    const matches = mapSportyEvents(
      [
        {
          eventId: 'sr:match:srl',
          home: 'Andorra SRL',
          away: 'Gibraltar SRL',
          kickoff: '2026-11-13T16:00:00.000Z',
          tournament: 'UEFA Nations League SRL',
          country: 'Simulated Reality League',
        },
        {
          eventId: 'sr:match:real',
          home: 'Barletta Calcio',
          away: "Altamura Societa' Sportiva SRL",
          kickoff: '2026-11-13T16:00:00.000Z',
          tournament: 'Serie C, Group C',
          country: 'Italy',
        },
      ],
      '2026-11-13T00:00:00.000Z',
      '2026-11-14T00:00:00.000Z',
    );
    expect(matches.map((match) => match.id)).toEqual(['sr:match:real']);
  });
});
