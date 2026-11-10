import { describe, expect, it } from 'vitest';
import { applyFilter } from './group';
import { mergeBoard, parseLivePayload, promoteIfStarted } from './liveBoard';
import type { Match } from '../types';

function match(patch: Partial<Match> = {}): Match {
  return {
    id: 'sr:match:1',
    competition: { id: 'cup', name: 'Cup', area: 'Egypt', code: 'EGY', priority: 12 },
    utcDate: '2026-11-10T16:00:00.000Z',
    status: 'scheduled',
    minute: null,
    injuryTime: null,
    home: { id: 'al-astiklal', name: 'Al Astiklal', shortName: 'Al Astiklal', abbr: 'AA', color: '#e11d2e', crest: 'https://example.com/crest.svg' },
    away: { id: 'nashama', name: 'Nashama Al-Mustaqbal', shortName: 'Nashama', abbr: 'NAM', color: '#111' },
    homeScore: null,
    awayScore: null,
    htHome: null,
    htAway: null,
    events: [],
    venue: null,
    odds: { home: 2.1, draw: 3.2, away: 3.4 },
    feed: 'sporty',
    ...patch,
  };
}

describe('live board', () => {
  it('puts a match past kick-off under Live and keeps a later score on the crest', () => {
    const kick = Date.parse('2026-11-10T16:00:00.000Z');
    const started = promoteIfStarted(match(), kick + 10 * 60 * 1000);
    expect(applyFilter([started], 'live').map((item) => item.id)).toEqual(['sr:match:1']);
    expect(started.home.crest).toBe('https://example.com/crest.svg');

    const scored = mergeBoard(
      [match()],
      [match()],
      [
        match({
          status: 'live',
          minute: 76,
          homeScore: 1,
          awayScore: 0,
          htHome: 0,
          htAway: 0,
          home: { ...match().home, crest: null },
        }),
      ],
      kick + 80 * 60 * 1000,
    );
    expect(scored[0]?.status).toBe('live');
    expect(scored[0]?.homeScore).toBe(1);
    expect(scored[0]?.awayScore).toBe(0);
    expect(scored[0]?.home.crest).toBe('https://example.com/crest.svg');
    expect(scored).toHaveLength(1);
  });

  it('reads an in-play score and adds the match when the upcoming list has already dropped it', () => {
    const parsed = parseLivePayload({
      data: [
        {
          categoryName: 'Jordan',
          name: 'Pro League, Women',
          events: [
            {
              eventId: 'sr:match:76484472',
              homeTeamName: 'Al Astiklal',
              awayTeamName: 'Nashama Al-Mustaqbal',
              estimateStartTime: Date.parse('2026-11-10T16:00:00.000Z'),
              status: 1,
              matchStatus: 'H2',
              period: '2',
              playedSeconds: '76:12',
              setScore: '1:0',
              gameScore: ['0:0', '1:0'],
              markets: [
                { id: '1', outcomes: [{ id: '1', odds: '4.25' }, { id: '2', odds: '3.10' }, { id: '3', odds: '1.90' }] },
                { id: '18', specifier: 'total=0.5', outcomes: [{ id: '12', odds: '1.65' }, { id: '13', odds: '2.10' }] },
              ],
            },
          ],
        },
      ],
    });
    expect(parsed[0]?.status).toBe('live');
    expect(parsed[0]?.homeScore).toBe(1);
    expect(parsed[0]?.htHome).toBe(0);
    expect(parsed[0]?.odds?.['over-05']).toBe(1.65);
    const board = mergeBoard([], [match({ id: 'sr:match:later', utcDate: '2026-11-10T20:00:00.000Z' })], parsed, Date.parse('2026-11-10T17:20:00.000Z'));
    expect(applyFilter(board, 'live').map((item) => item.home.shortName)).toEqual(['Al Astiklal']);
    expect(applyFilter(board, 'upcoming')).toHaveLength(1);
  });
});
