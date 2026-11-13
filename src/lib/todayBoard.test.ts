import { describe, expect, it } from 'vitest';
import type { Follows, Match } from '../types';
import { onBoardDate } from './dates';
import { byLeague, isShownFixture, matchCountLabel, minuteProgress, partitionFollowed, weekDays } from './todayBoard';

function match(patch: Partial<Match> = {}): Match {
  return {
    id: 'sr:match:1',
    competition: { id: 'gha', name: 'Premier League', area: 'Ghana', code: 'GHA', priority: 4 },
    utcDate: '2026-11-13T15:00:00.000Z',
    status: 'scheduled',
    minute: null,
    injuryTime: null,
    home: { id: 'hearts', name: 'Hearts of Oak', shortName: 'Hearts', abbr: 'HOO', color: '#e11d2e' },
    away: { id: 'kotoko', name: 'Asante Kotoko', shortName: 'Kotoko', abbr: 'AK', color: '#f5c518' },
    homeScore: null,
    awayScore: null,
    htHome: null,
    htAway: null,
    events: [],
    venue: null,
    feed: 'sporty',
    ...patch,
  };
}

const follows: Follows = { matches: ['sr:match:2'], teams: [{ id: 'hearts', name: 'Hearts of Oak', shortName: 'Hearts', abbr: 'HOO', color: '#e11d2e' }] };

describe('today board', () => {
  it('builds a week around today and keeps a far selected day', () => {
    const days = weekDays('2026-11-13', '2026-11-13');
    expect(days[0]).toBe('2026-11-06');
    expect(days.at(-1)).toBe('2026-11-27');
    expect(days).toContain('2026-11-13');
    expect(weekDays('2026-11-13', '2026-12-01').at(-1)).toBe('2026-12-01');
  });

  it('pins followed matches and drops simulated or dummy ids', () => {
    const rows = [
      match({
        id: 'sr:match:3',
        utcDate: '2026-11-13T18:00:00.000Z',
        home: { id: 'alpha', name: 'Alpha', shortName: 'Alpha', abbr: 'AL', color: '#3d7eff' },
        away: { id: 'beta', name: 'Beta', shortName: 'Beta', abbr: 'BE', color: '#21a366' },
      }),
      match({ id: 'sr:match:2', utcDate: '2026-11-13T12:00:00.000Z', status: 'live', minute: 9 }),
      match(),
      match({
        id: 'sr:match:srl',
        competition: { id: 'srl', name: 'UEFA Nations League SRL', area: 'Simulated Reality League', code: 'SRL', priority: 9 },
        home: { id: 'and', name: 'Andorra SRL', shortName: 'Andorra', abbr: 'AND', color: '#333' },
        away: { id: 'gib', name: 'Gibraltar SRL', shortName: 'Gibraltar', abbr: 'GIB', color: '#999' },
      }),
      match({ id: 'dummy-match-1' }),
    ];
    expect(rows.filter(isShownFixture).map((item) => item.id)).toEqual(['sr:match:3', 'sr:match:2', 'sr:match:1']);
    const { followed, rest } = partitionFollowed(rows, follows);
    expect(followed.map((item) => item.id)).toEqual(['sr:match:2', 'sr:match:1']);
    expect(rest.map((item) => item.id)).toEqual(['sr:match:3']);
    expect(byLeague(rest).map((item) => item.id)).toEqual(['sr:match:3']);
  });

  it('draws the live ring from the minute and names the count', () => {
    expect(minuteProgress('scheduled', null)).toBeNull();
    expect(minuteProgress('halftime', 45)).toBe(0.5);
    expect(minuteProgress('live', 9)).toBeCloseTo(0.1);
    expect(minuteProgress('live', 99)).toBe(1);
    expect(minuteProgress('live', null)).toBe(0);
    expect(matchCountLabel(1)).toBe('1 match');
    expect(matchCountLabel(2)).toBe('2 matches');
  });

  it('keeps an in-play kickoff on its own local day', () => {
    expect(onBoardDate('2026-11-13T15:00:00.000Z', '2026-11-13')).toBe(true);
    expect(onBoardDate('2026-11-13T15:00:00.000Z', '2026-11-14')).toBe(false);
    expect(onBoardDate('not-a-date', '2026-11-13')).toBe(false);
  });
});
