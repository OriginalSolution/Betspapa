import { describe, expect, it } from 'vitest';
import { buildPicks, settle } from '../data/board';
import { defaultSettings, type Follows, type Match, type Settings } from '../types';
import { followedNotices, trendHitNotices } from './alerts';

function match(patch: Partial<Match> = {}): Match {
  return {
    id: 'sr:match:1',
    competition: { id: 'cup', name: 'Cup', area: 'Jordan', code: 'JOR', priority: 12 },
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
    odds: { home: 2.4, draw: 3.1, away: 2.8, 'over-05': 1.2, 'over-15': 1.8, 'home-dnb': 1.7, 'btts-yes': 1.9 },
    feed: 'sporty',
    ...patch,
  };
}

const follows: Follows = {
  matches: [],
  teams: [{ id: 'al-astiklal', name: 'Al Astiklal', shortName: 'Al Astiklal', abbr: 'AA', color: '#e11d2e' }],
};
const settings: Settings = { ...defaultSettings, kickoff: true, goal: true, ht: true, ft: true };

describe('followed alerts', () => {
  it('records a kick-off when the check happens after the start', () => {
    const now = Date.parse('2026-11-10T18:10:00.000Z');
    const notes = followedNotices([match()], follows, settings, new Set(), now);
    expect(notes.map((note) => note.kind)).toContain('kickoff');
    expect(notes[0]?.body).toContain('Al Astiklal');
    const again = followedNotices([match()], follows, settings, new Set(notes.map((note) => note.id)), now);
    expect(again).toEqual([]);
  });

  it('turns a later score into a goal and half-time alert without dropping the crest', () => {
    const now = Date.parse('2026-11-10T17:16:00.000Z');
    const live = match({ status: 'live', minute: 76, homeScore: 1, awayScore: 0, htHome: 0, htAway: 0 });
    expect(live.home.crest).toBe('https://example.com/crest.svg');
    const first = followedNotices([match()], follows, settings, new Set(), Date.parse(match().utcDate));
    const seen = new Set(first.map((note) => note.id));
    const notes = followedNotices([live], follows, settings, seen, now);
    expect(notes.map((note) => note.kind)).toEqual(expect.arrayContaining(['goal', 'ht']));
    expect(live.home.crest).toBe('https://example.com/crest.svg');
    expect(followedNotices([live], follows, settings, new Set([...seen, ...notes.map((note) => note.id)]), now)).toEqual([]);
  });
});

describe('trend hits', () => {
  it('settles the major markets and alerts once when a followed trend has hit', () => {
    const open = match();
    const live = match({ status: 'live', minute: 76, homeScore: 1, awayScore: 0, htHome: 0, htAway: 0 });
    expect(settle('over05', live, true)).toBe('won');
    expect(settle('over15', live, true)).toBe('open');
    expect(settle('fh-draw', live, true)).toBe('won');
    expect(settle('fh-home', live, true)).toBe('bust');
    expect(settle('home', live, true)).toBe('open');
    expect(settle('dnb-home', { ...live, status: 'finished' }, true)).toBe('won');
    expect(settle('dc-1x', { ...live, status: 'finished', homeScore: 1, awayScore: 1 }, true)).toBe('won');
    expect(settle('btts', live, true)).toBe('open');
    expect(settle('over05', open, true)).toBe('open');

    const picks = buildPicks([live]);
    const over = picks.find((pick) => pick.market === 'over05');
    expect(over?.status).toBe('won');
    expect(over?.id).toBe('sr:match:1:over05');
    const notes = trendHitNotices(picks, [over!.id], new Set(), Date.parse('2026-11-10T17:16:00.000Z'));
    expect(notes).toHaveLength(1);
    expect(notes[0]?.title).toContain('Over 0.5 goals');
    expect(notes[0]?.body).toContain('Al Astiklal');
    expect(trendHitNotices(picks, [over!.id], new Set([notes[0]!.id]), Date.now())).toEqual([]);
    expect(picks.find((pick) => pick.market === 'dc-12')?.bookmarked).toBe(false);
  });
});
