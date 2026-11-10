import { describe, expect, it } from 'vitest';
import type { Match } from '../types';
import { chooseFixtures, loadFixtureCache, saveFixtureCache, setFixtureCacheStore } from './fixtureCache';

function match(id: string): Match {
  return {
    id,
    competition: { id: 'pl', name: 'Premier League', area: 'England', code: 'ENG', priority: 4 },
    utcDate: '2026-11-10T18:00:00.000Z',
    status: 'scheduled',
    minute: null,
    injuryTime: null,
    home: { id: 'home', name: 'Home', shortName: 'Home', abbr: 'HOM', color: '#fff' },
    away: { id: 'away', name: 'Away', shortName: 'Away', abbr: 'AWY', color: '#000' },
    homeScore: null,
    awayScore: null,
    htHome: null,
    htAway: null,
    events: [],
    venue: null,
    varReview: null,
    odds: { home: 1.4 },
    feed: 'sporty',
  };
}

describe('fixture cache', () => {
  it('keeps the last real board when a refresh times out', () => {
    const cached = [match('sr:match:1')];
    const choice = chooseFixtures({ ok: false, message: 'timeout' }, cached);
    expect(choice.matches).toEqual(cached);
    expect(choice.feedNote).toBe('Showing the last update. Refresh failed (timeout).');
  });

  it('shows an error on the first failure and never invents a match', () => {
    const choice = chooseFixtures({ ok: false, message: 'timeout' }, []);
    expect(choice.matches).toEqual([]);
    expect(choice.feedNote).toBe('Fixture feed is unreachable (timeout).');
  });

  it('stores only real fixture rows for that day', () => {
    const box = new Map<string, string>();
    setFixtureCacheStore({
      getItem: (key) => box.get(key) ?? null,
      setItem: (key, value) => box.set(key, value),
    });
    const demo = { ...match('ars-liv'), feed: 'demo' as Match['feed'] };
    saveFixtureCache('2026-11-10', [match('sr:match:1'), demo], 10);
    expect(loadFixtureCache('2026-11-10').matches.map((item) => item.id)).toEqual(['sr:match:1']);
    expect(loadFixtureCache('2026-11-11').matches).toEqual([]);
    setFixtureCacheStore(null);
  });
});
