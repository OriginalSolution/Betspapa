import { describe, expect, it } from 'vitest';
import type { Follows, Match, Settings } from '../types';
import { applyCrests, applyLiveUpdates, kickoffNotices, parseLiveEvents, sameSide } from './liveScores';
import { defaultSettings } from '../types';

function match(patch: Partial<Match> = {}): Match {
  return {
    id: 'sr:match:1',
    competition: { id: 'pl', name: 'Premier League', area: 'England', code: 'ENG', priority: 4 },
    utcDate: '2026-11-10T18:00:00.000Z',
    status: 'scheduled',
    minute: null,
    injuryTime: null,
    home: { id: 'man-city', name: 'Man City', shortName: 'Man City', abbr: 'MC', color: '#6cabdd', crest: 'https://example.com/city.svg' },
    away: { id: 'fulham', name: 'Fulham', shortName: 'Fulham', abbr: 'FUL', color: '#111' },
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

const follows: Follows = { matches: [], teams: [{ id: 'man-city', name: 'Man City', shortName: 'Man City', abbr: 'MC', color: '#6cabdd' }] };
const settings: Settings = { ...defaultSettings, kickoff: true };

describe('live scores', () => {
  it('matches a short club name without confusing a women side', () => {
    expect(sameSide('Man City', 'Manchester City FC')).toBe(true);
    expect(sameSide('Fulham', 'Fulham FC')).toBe(true);
    expect(sameSide('Eibar', 'SD Eibar')).toBe(true);
    expect(sameSide('Real Madrid W', 'Real Madrid')).toBe(false);
  });

  it('overlays a goal and keeps the crest and the rest of the board', () => {
    const other = match({ id: 'sr:match:2', home: { ...match().home, id: 'eibar', name: 'Eibar', shortName: 'Eibar' }, away: { ...match().away, name: 'Valencia', shortName: 'Valencia' } });
    const updates = parseLiveEvents({
      events: [{ strHomeTeam: 'Fulham FC', strAwayTeam: 'Somewhere', strStatus: 'NS', intHomeScore: null, intAwayScore: null, strProgress: null }],
    });
    expect(updates[0]?.status).toBe('scheduled');
    const live = parseLiveEvents({
      events: [{ strHomeTeam: 'Fulham', strAwayTeam: 'Man City', strStatus: '1H', intHomeScore: '0', intAwayScore: '1', strProgress: '23' }],
    });
    const next = applyLiveUpdates([match(), other], live);
    expect(next[0]?.status).toBe('scheduled');
    expect(next[1]?.status).toBe('scheduled');
    expect(next[1]?.home.crest).toBe('https://example.com/city.svg');
    const swapped = applyLiveUpdates(
      [match()],
      parseLiveEvents({ events: [{ strHomeTeam: 'Man City', strAwayTeam: 'Fulham FC', strStatus: '1H', intHomeScore: '1', intAwayScore: '0', strProgress: '23' }] }),
    );
    expect(swapped[0]?.status).toBe('live');
    expect(swapped[0]?.homeScore).toBe(1);
    expect(swapped[0]?.home.crest).toBe('https://example.com/city.svg');
    expect(swapped).toHaveLength(1);
  });

  it('raises one kickoff alert for a starred team and does not repeat it', () => {
    const now = Date.parse('2026-11-10T18:02:00.000Z');
    const notes = kickoffNotices([match()], follows, settings, 5, new Set(), now);
    expect(notes.map((note) => note.kind)).toEqual(['kickoff']);
    expect(notes[0]?.body).toContain('Man City vs Fulham');
    const again = kickoffNotices([match()], follows, settings, 5, new Set([notes[0]!.id]), now);
    expect(again).toEqual([]);
    const quiet = kickoffNotices([match()], { matches: [], teams: [] }, settings, 5, new Set(), now);
    expect(quiet).toEqual([]);
  });

  it('paints crests without dropping a team that has none', () => {
    const painted = applyCrests([match()], { fulham: 'https://upload.wikimedia.org/fulham.svg' });
    expect(painted[0]?.away.crest).toBe('https://upload.wikimedia.org/fulham.svg');
    expect(painted[0]?.home.crest).toBe('https://example.com/city.svg');
  });
});
