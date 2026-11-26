import { describe, expect, it } from 'vitest';
import type { Match } from '../types';
import { addSavedChip, applySavedFilters, countryChip, filterSuggestions, leagueChip, loadSavedFilters } from './savedFilters';

function match(area: string, leagueId: string, name: string): Match {
  return {
    id: `${leagueId}-${area}`,
    competition: { id: leagueId, name, area, code: 'X', priority: 1 },
    utcDate: '2026-11-26T16:00:00.000Z',
    status: 'scheduled',
    minute: null,
    injuryTime: null,
    home: { id: 'h', name: 'Home', shortName: 'Home', abbr: 'H', color: '#fff' },
    away: { id: 'a', name: 'Away', shortName: 'Away', abbr: 'A', color: '#000' },
    homeScore: null,
    awayScore: null,
    htHome: null,
    htAway: null,
    events: [],
    venue: null,
    feed: 'sporty',
  };
}

describe('saved filters', () => {
  const saudi = match('Saudi Arabia', 'spl', 'Saudi Pro League');
  const qatar = match('Qatar', 'q2', '2. Division');

  it('keeps every match until a country or league is saved', () => {
    expect(applySavedFilters([saudi, qatar], [])).toEqual([saudi, qatar]);
  });

  it('keeps a match in a saved country or a saved league', () => {
    const country = countryChip('Saudi Arabia');
    const league = leagueChip('q2', '2. Division');
    expect(country && applySavedFilters([saudi, qatar], [country])).toEqual([saudi]);
    expect(league && applySavedFilters([saudi, qatar], [league])).toEqual([qatar]);
  });

  it('does not save the same chip twice and offers only what is not saved', () => {
    const chip = countryChip('Saudi Arabia');
    expect(chip).not.toBeNull();
    const once = addSavedChip([], chip!);
    expect(addSavedChip(once, chip!)).toEqual(once);
    expect(filterSuggestions([saudi, qatar], once).map((item) => item.label)).toEqual(['Saudi Pro League', 'Qatar', '2. Division']);
  });

  it('reads only well-formed chips from storage', () => {
    const box = new Map<string, string>();
    box.set('betspapa.savedFilters.v1', JSON.stringify([{ kind: 'country', id: 'qatar', label: 'Qatar' }, { kind: 'nope' }, null]));
    expect(loadSavedFilters((key) => box.get(key) ?? null)).toEqual([{ kind: 'country', id: 'qatar', label: 'Qatar' }]);
    expect(loadSavedFilters(() => '{')).toEqual([]);
  });
});
