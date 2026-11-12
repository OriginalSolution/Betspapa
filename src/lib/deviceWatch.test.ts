import { describe, expect, it } from 'vitest';
import type { Follows, InboxItem, Match } from '../types';
import { mergeInbox, scheduleRows, trendMatchId } from './deviceWatch';

function match(patch: Partial<Match> = {}): Match {
  return {
    id: 'sr:match:1',
    competition: { id: 'cup', name: 'Cup', area: 'Ghana', code: 'GHA', priority: 12 },
    utcDate: '2026-11-10T16:00:00.000Z',
    status: 'scheduled',
    minute: null,
    injuryTime: null,
    home: { id: 'hearts', name: 'Hearts of Oak', shortName: 'Hearts', abbr: 'HOO', color: '#e11d2e' },
    away: { id: 'kotoko', name: 'Asante Kotoko', shortName: 'Kotoko', abbr: 'KOT', color: '#111' },
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

const follows: Follows = { matches: [], teams: [{ id: 'hearts', name: 'Hearts of Oak', shortName: 'Hearts', abbr: 'HOO', color: '#e11d2e' }] };

function note(id: string): InboxItem {
  return { id, matchId: 'sr:match:1', kind: 'goal', title: 'Goal', body: 'Hearts', createdAt: 1, read: false };
}

describe('device watch handoff', () => {
  it('merges background alerts without a second row', () => {
    const local = [note('sr:match:1:kickoff')];
    const remote = [note('sr:match:1:kickoff'), note('sr:match:1:goal:home:1')];
    const merged = mergeInbox(local, remote);
    expect(merged.map((item) => item.id)).toEqual(['sr:match:1:goal:home:1', 'sr:match:1:kickoff']);
    expect(mergeInbox(merged, remote)).toEqual(merged);
  });

  it('schedules only followed matches and followed trends', () => {
    const other = match({ id: 'sr:match:9', home: { ...match().home, id: 'other', shortName: 'Other' } });
    const trend = match({ id: 'sr:match:2' });
    const rows = scheduleRows([match(), other, trend], follows, ['sr:match:2:over05']);
    expect(rows.map((row) => row.id)).toEqual(['sr:match:1', 'sr:match:2']);
    expect(trendMatchId('sr:match:2:over05')).toBe('sr:match:2');
    expect(rows[0]?.home).toBe('Hearts');
  });
});
