import { describe, expect, it } from 'vitest';
import { faceForFollow, splitFollowId } from './trendFace';
import type { EngineState } from './engineSlips';
import type { Match } from '../types';

const match = {
  id: 'sr:match:68823468',
  competition: { id: 'gha', name: 'Premier League', area: 'Ghana', code: 'GHA', priority: 4 },
  utcDate: '2026-11-14T16:00:00.000Z',
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
} satisfies Match;

describe('followed trend names', () => {
  it('splits a follow id into the match and the market', () => {
    expect(splitFollowId('sr:match:68823468:home-score')).toEqual({ matchId: 'sr:match:68823468', market: 'home-score' });
    expect(splitFollowId('sr:match:75802242:over15')).toEqual({ matchId: 'sr:match:75802242', market: 'over15' });
    expect(splitFollowId('not-a-match')).toBeNull();
  });

  it('uses the fixture for team names, crests and kickoff instead of the raw id', () => {
    const face = faceForFollow('sr:match:68823468:home-score', { matches: [match] });
    expect(face.home).toBe('Hearts');
    expect(face.away).toBe('Kotoko');
    expect(face.homeTeam?.id).toBe('hearts');
    expect(face.awayTeam?.crest).toBeUndefined();
    expect(face.marketLabel).toBe('Home team to score');
    expect(face.kickoff).toBe('2026-11-14T16:00:00.000Z');
    expect(face.home).not.toContain('sr:match');
    expect(JSON.stringify(face)).not.toContain('Another day');
  });

  it('reads an engine leg when the match is not on the loaded day', () => {
    const engine: EngineState = {
      updatedAt: null,
      master: null,
      trends: [
        {
          id: '80:over15',
          label: '80%+ Over 1.5 goals',
          market: 'over15',
          legCount: 1,
          legs: [
            {
              eventId: 'sr:match:75802242',
              market: 'over15',
              match: 'Egypt vs Malawi',
              kickoff: '2026-11-15T19:00:00.000Z',
              odds: 1.27,
              occurrence: 90,
              sample: '9/10',
            },
          ],
          sameAsMaster: false,
          bookedAt: null,
          books: {},
        },
      ],
    };
    const face = faceForFollow('sr:match:75802242:over15', { engine });
    expect(face.home).toBe('Egypt');
    expect(face.away).toBe('Malawi');
    expect(face.marketLabel).toBe('Over 1.5 goals');
    expect(face.kickoff).toBe('2026-11-15T19:00:00.000Z');
  });

  it('keeps the market and hides the id when no fixture is known', () => {
    const face = faceForFollow('sr:match:9:btts-no', {});
    expect(face.home).toBe('');
    expect(face.away).toBe('');
    expect(face.marketLabel).toBe('Both teams not to score');
    expect(face.kickoff).toBe('');
    expect(`${face.home} ${face.away} ${face.marketLabel}`).not.toContain('sr:match');
  });
});
