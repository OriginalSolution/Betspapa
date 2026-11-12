import { describe, expect, it } from 'vitest';
import { applyGoalMinutes, decorateMatches, paintGoals, type GoalBook } from './goalMinutes';
import type { Match } from '../types';

function match(patch: Partial<Match> = {}): Match {
  return {
    id: 'sr:match:gha',
    competition: { id: 'afcon', name: 'Africa Cup of Nations Qualification', area: 'Africa', code: 'INT', priority: 6 },
    utcDate: '2026-11-12T16:00:00.000Z',
    status: 'live',
    minute: 57,
    injuryTime: null,
    home: { id: 'ghana', name: 'Ghana', shortName: 'Ghana', abbr: 'GHA', color: '#e11d2e' },
    away: { id: 'somalia', name: 'Somalia', shortName: 'Somalia', abbr: 'SOM', color: '#3d7eff' },
    homeScore: 1,
    awayScore: 0,
    htHome: 0,
    htAway: 0,
    events: [
      {
        id: 'sr:match:gha:goal:home:1',
        type: 'goal',
        minute: null,
        teamId: 'ghana',
        player: null,
        detail: null,
        homeScore: 1,
        awayScore: 0,
      },
    ],
    venue: null,
    feed: 'sporty',
    ...patch,
  };
}

describe('goal minutes', () => {
  it('stamps the current minute when a score change has no feed minute and keeps it', () => {
    const before = match({ minute: 22, homeScore: 0, awayScore: 0, events: [] });
    const scored = match({ minute: 23 });
    const book = applyGoalMinutes(before, scored, {});
    expect(book['sr:match:gha:home:1']).toEqual({ minute: 23, player: null, estimated: true });
    const later = applyGoalMinutes(scored, match({ minute: 57 }), book);
    expect(later['sr:match:gha:home:1']?.minute).toBe(23);
    const painted = paintGoals(match({ minute: 57 }), later);
    expect(painted.events.find((event) => event.type === 'goal')?.minute).toBe(23);
  });

  it('records a minute for a score that is already on the board and lets a feed minute replace it', () => {
    const first = applyGoalMinutes(undefined, match(), {});
    expect(first['sr:match:gha:home:1']).toEqual({ minute: 57, player: null, estimated: true });
    const fed = match({
      events: [
        {
          id: 'sr:match:gha:goal:home:1',
          type: 'goal',
          minute: 23,
          teamId: 'ghana',
          player: 'Kudus',
          detail: null,
          homeScore: 1,
          awayScore: 0,
        },
      ],
    });
    const next = applyGoalMinutes(match(), fed, first);
    expect(next['sr:match:gha:home:1']).toEqual({ minute: 23, player: 'Kudus', estimated: false });
    const held = applyGoalMinutes(fed, match({ minute: 80 }), next);
    expect(held['sr:match:gha:home:1']?.minute).toBe(23);
  });

  it('keeps both goals when they are first seen in the same minute', () => {
    const empty: GoalBook = {};
    const two = match({
      homeScore: 2,
      events: [
        { id: 'a', type: 'goal', minute: null, teamId: 'ghana', player: null, detail: null, homeScore: 2, awayScore: 0 },
        { id: 'b', type: 'goal', minute: null, teamId: 'ghana', player: null, detail: null, homeScore: 2, awayScore: 0 },
      ],
    });
    const book = applyGoalMinutes(undefined, two, empty);
    expect(book['sr:match:gha:home:1']?.minute).toBe(57);
    expect(book['sr:match:gha:home:2']?.minute).toBe(57);
    const { matches } = decorateMatches([], [two], book);
    expect(matches[0]?.events.map((event) => event.minute)).toEqual([57, 57]);
  });
});
