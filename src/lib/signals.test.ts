import { describe, expect, it } from 'vitest';
import type { Match, Settings } from '../types';
import { diffAlerts, type DiffContext } from './signals';

const settings: Settings = {
  kickoff: true,
  goal: true,
  red: true,
  ht: true,
  ft: true,
  browser: true,
  var: true,
  goalSound: 'cheer',
  dataSource: 'sporty',
};

function match(patch: Partial<Match>): Match {
  return {
    id: 'm1',
    competition: { id: 'pl', name: 'Premier League', area: 'England', code: 'ENG', priority: 2 },
    utcDate: '2026-11-10T18:00:00.000Z',
    status: 'live',
    minute: 20,
    injuryTime: null,
    home: { id: 'h', name: 'Home FC', shortName: 'Home', abbr: 'HOM', color: '#111' },
    away: { id: 'a', name: 'Away FC', shortName: 'Away', abbr: 'AWY', color: '#222' },
    homeScore: 0,
    awayScore: 0,
    htHome: null,
    htAway: null,
    events: [],
    venue: 'Ground',
    ...patch,
  };
}

function ctx(patch: Partial<DiffContext> = {}): DiffContext {
  return {
    generation: 1,
    followedMatchIds: new Set(['m1']),
    followedTeamIds: new Set(),
    settings,
    ...patch,
  };
}

describe('diffAlerts', () => {
  it('treats the first snapshot as a baseline', () => {
    expect(diffAlerts(null, [match({})], ctx())).toEqual([]);
  });

  it('emits a goal when the score advances', () => {
    const prev = [match({ minute: 19 })];
    const next = [
      match({
        minute: 20,
        homeScore: 1,
        events: [
          {
            id: 'g1',
            type: 'goal',
            minute: 20,
            teamId: 'h',
            player: 'Striker',
            detail: null,
            homeScore: 1,
            awayScore: 0,
          },
        ],
      }),
    ];
    const alerts = diffAlerts(prev, next, ctx());
    expect(alerts.map((alert) => alert.kind)).toEqual(['goal']);
    expect(alerts[0]?.body).toContain('Striker 20′');
    expect(diffAlerts(next, next, ctx())).toEqual([]);
  });

  it('emits two goals when the score jumps by two', () => {
    const prev = [match({})];
    const next = [match({ homeScore: 2, minute: 30 })];
    expect(diffAlerts(prev, next, ctx()).filter((alert) => alert.kind === 'goal')).toHaveLength(2);
  });

  it('emits kick-off, half-time, full-time and a red card on the transitions that introduce them', () => {
    const scheduled = [match({ status: 'scheduled', minute: null, homeScore: null, awayScore: null })];
    const live = [match({ status: 'live', minute: 1 })];
    expect(diffAlerts(scheduled, live, ctx()).map((alert) => alert.kind)).toEqual(['kickoff']);

    const late = [match({ status: 'live', minute: 50, htHome: 0, htAway: 0 })];
    expect(diffAlerts(live, late, ctx()).map((alert) => alert.kind)).toEqual(['ht']);

    const done = [match({ status: 'finished', minute: 90, htHome: 0, htAway: 0 })];
    expect(diffAlerts(late, done, ctx()).map((alert) => alert.kind)).toEqual(['ft']);

    const sent = [
      match({
        events: [
          {
            id: 'r1',
            type: 'red',
            minute: 70,
            teamId: 'a',
            player: 'Keeper',
            detail: null,
            homeScore: null,
            awayScore: null,
          },
        ],
      }),
    ];
    const reds = diffAlerts(live, sent, ctx());
    expect(reds.map((alert) => alert.kind)).toContain('red');
    expect(reds.find((alert) => alert.kind === 'red')?.title).toBe('Red card · Away');
  });

  it('does not raise half-time for a match already in the second half on the first compare after baseline', () => {
    const secondHalf = [match({ minute: 60, htHome: 1, htAway: 0, homeScore: 1 })];
    expect(diffAlerts(null, secondHalf, ctx())).toEqual([]);
    expect(diffAlerts(secondHalf, secondHalf, ctx())).toEqual([]);
  });

  it('respects a followed team and a disabled goal setting', () => {
    const prev = [match({})];
    const next = [match({ homeScore: 1, minute: 12 })];
    const viaTeam = diffAlerts(prev, next, ctx({ followedMatchIds: new Set(), followedTeamIds: new Set(['h']) }));
    expect(viaTeam.map((alert) => alert.kind)).toEqual(['goal']);
    const quiet = diffAlerts(prev, next, ctx({ settings: { ...settings, goal: false } }));
    expect(quiet).toEqual([]);
  });

  it('emits VAR only when a review is present and does not invent one for a goal', () => {
    const prev = [match({})];
    const reviewed = [match({ minute: 22, varReview: { teamId: 'h', player: 'Striker', minute: 22 } })];
    const during = diffAlerts(prev, reviewed, ctx());
    expect(during.map((alert) => alert.kind)).toEqual(['var']);
    expect(during[0]?.body).toContain('Striker');
    expect(during[0]?.body).toContain('under review');

    const plain = diffAlerts(prev, [match({ homeScore: 1, minute: 22 })], ctx());
    expect(plain.map((alert) => alert.kind)).toEqual(['goal']);
  });

  it('labels penalties and own goals', () => {
    const prev = [match({})];
    const next = [
      match({
        awayScore: 1,
        events: [
          {
            id: 'og',
            type: 'goal',
            minute: 40,
            teamId: 'a',
            player: 'Defender',
            detail: 'Own goal',
            homeScore: 0,
            awayScore: 1,
          },
        ],
      }),
    ];
    expect(diffAlerts(prev, next, ctx())[0]?.body).toContain('Own goal · Defender');
  });
});
