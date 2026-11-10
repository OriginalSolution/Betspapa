import { describe, expect, it } from 'vitest';
import { fixtures, teams } from './catalog';
import { projectDemo } from './project';
import { diffAlerts } from '../lib/signals';
import { defaultSettings } from '../types';

const t0 = Date.parse('2026-11-10T18:00:00Z');
const today = '2026-11-10';

function board(elapsed: number, selected = today) {
  return projectDemo({ t0, now: t0 + elapsed, selectedDate: selected, todayDate: today });
}

function match(elapsed: number, id: string) {
  const found = board(elapsed).find((item) => item.id === id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
}

describe('demo catalog', () => {
  it('uses unique team and fixture ids', () => {
    expect(new Set(teams.map((team) => team.id)).size).toBe(teams.length);
    expect(new Set(fixtures.map((fixture) => fixture.id)).size).toBe(fixtures.length);
    for (const fixture of fixtures) {
      expect(teams.some((team) => team.id === fixture.homeId)).toBe(true);
      expect(teams.some((team) => team.id === fixture.awayId)).toBe(true);
    }
  });
});

describe('demo clock', () => {
  it('opens Arsenal–Liverpool in the second half at 2–1', () => {
    const arsenal = match(0, 'ars-liv');
    expect(arsenal.status).toBe('live');
    expect(arsenal.minute).toBe(64);
    expect(arsenal.homeScore).toBe(2);
    expect(arsenal.awayScore).toBe(1);
    expect(arsenal.events.some((event) => event.player === 'Havertz')).toBe(false);
  });

  it('holds the Arsenal goal at VAR before confirming it', () => {
    const checking = match(16_000, 'ars-liv');
    expect(checking.minute).toBe(66);
    expect(checking.homeScore).toBe(2);
    expect(checking.awayScore).toBe(1);
    expect(checking.varReview?.player).toBe('Havertz');
    expect(checking.events.some((event) => event.type === 'goal' && event.player === 'Havertz')).toBe(false);

    const still = match(24_000, 'ars-liv');
    expect(still.minute).toBe(67);
    expect(still.homeScore).toBe(2);
    expect(still.varReview?.player).toBe('Havertz');

    const confirmed = match(32_000, 'ars-liv');
    expect(confirmed.minute).toBe(68);
    expect(confirmed.homeScore).toBe(3);
    expect(confirmed.awayScore).toBe(1);
    expect(confirmed.varReview).toBeNull();
    expect(confirmed.events.some((event) => event.type === 'goal' && event.player === 'Havertz')).toBe(true);
  });

  it('ticks one minute at a time before that goal', () => {
    expect(match(8_000, 'ars-liv').minute).toBe(65);
    expect(match(8_000, 'ars-liv').homeScore).toBe(2);
  });

  it('kicks Chelsea off at 8 seconds and scores at 24', () => {
    expect(match(0, 'che-mci').status).toBe('scheduled');
    expect(match(0, 'che-mci').homeScore).toBeNull();
    const kicked = match(8_000, 'che-mci');
    expect(kicked.status).toBe('live');
    expect(kicked.minute).toBe(0);
    expect(kicked.homeScore).toBe(0);
    const scored = match(24_000, 'che-mci');
    expect(scored.minute).toBe(2);
    expect(scored.homeScore).toBe(1);
    expect(scored.events.some((event) => event.player === 'Palmer')).toBe(true);
  });

  it('holds PSG at half-time, then resumes and scores', () => {
    const paused = match(0, 'psg-mar');
    expect(paused.status).toBe('halftime');
    expect(paused.homeScore).toBe(1);
    expect(paused.awayScore).toBe(0);
    const resumed = match(24_000, 'psg-mar');
    expect(resumed.status).toBe('live');
    expect(resumed.minute).toBe(46);
    expect(resumed.awayScore).toBe(1);
  });

  it('finishes Bayern at 24 seconds and pauses Barcelona at 72', () => {
    expect(match(0, 'bay-bvb')).toMatchObject({ status: 'live', minute: 87, homeScore: 3, awayScore: 2 });
    expect(match(24_000, 'bay-bvb')).toMatchObject({ status: 'finished', minute: 90, homeScore: 3, awayScore: 2 });
    expect(match(24_000, 'bar-rma')).toMatchObject({ status: 'live', minute: 39, homeScore: 2, awayScore: 1 });
    expect(match(72_000, 'bar-rma').status).toBe('halftime');
    expect(match(72_000, 'ars-liv').events.some((event) => event.type === 'red' && event.player === 'Van Dijk')).toBe(true);
  });

  it('keeps yesterday finished and tomorrow scheduled', () => {
    const yesterday = board(0, '2026-11-09');
    expect(yesterday.length).toBeGreaterThan(0);
    expect(yesterday.every((item) => item.status === 'finished')).toBe(true);
    const tomorrow = board(0, '2026-11-11');
    expect(tomorrow.every((item) => item.status === 'scheduled')).toBe(true);
    expect(board(0, '2026-11-08')).toEqual([]);
  });
});

describe('demo alerts', () => {
  const ctx = {
    generation: t0,
    followedMatchIds: new Set(['ars-liv']),
    followedTeamIds: new Set<string>(),
    settings: defaultSettings,
  };

  it('sends VAR before the Arsenal goal, then the goal only after confirmation', () => {
    const review = diffAlerts(board(0), board(16_000), ctx);
    expect(review.some((alert) => alert.kind === 'goal')).toBe(false);
    expect(review.find((alert) => alert.kind === 'var')?.title).toBe('VAR');
    expect(review.find((alert) => alert.kind === 'var')?.body).toContain('under review');

    const waiting = diffAlerts(board(16_000), board(24_000), ctx);
    expect(waiting.some((alert) => alert.kind === 'goal' || alert.kind === 'var')).toBe(false);

    const alerts = diffAlerts(board(24_000), board(32_000), ctx);
    const goal = alerts.find((alert) => alert.kind === 'goal');
    expect(goal?.title).toBe('Goal · Arsenal');
    expect(goal?.body).toContain('Havertz');
    expect(goal?.body).toContain('3–1');
  });

  it('stays quiet for the same goal when the match is not followed', () => {
    const alerts = diffAlerts(board(0), board(24_000), { ...ctx, followedMatchIds: new Set() });
    expect(alerts).toEqual([]);
  });

  it('sends Chelsea kick-off to a followed team', () => {
    const alerts = diffAlerts(board(0), board(8_000), {
      ...ctx,
      followedMatchIds: new Set(),
      followedTeamIds: new Set(['mci']),
    });
    expect(alerts.map((alert) => alert.kind)).toEqual(['kickoff']);
    expect(alerts[0]?.body).toContain('Man City');
  });
});
