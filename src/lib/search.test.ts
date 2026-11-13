import { describe, expect, it } from 'vitest';
import type { Match } from '../types';
import { forgetSearch, kickoffSoon, rememberSearch, searchBoard, setSearchStore, trending } from './search';

function match(patch: Partial<Match> = {}): Match {
  return {
    id: 'sr:match:1',
    competition: { id: 'gh-pl', name: 'Ghana Premier League', area: 'Ghana', code: 'GH', priority: 1 },
    utcDate: '2026-11-13T16:00:00.000Z',
    status: 'scheduled',
    minute: null,
    injuryTime: null,
    home: { id: 'hearts', name: 'Hearts of Oak', shortName: 'Hearts of Oak', abbr: 'HOO', color: '#c8102e' },
    away: { id: 'kotoko', name: 'Asante Kotoko', shortName: 'Asante Kotoko', abbr: 'AK', color: '#f5c518' },
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

const board = [
  match(),
  match({
    id: 'sr:match:2',
    status: 'live',
    minute: 67,
    homeScore: 1,
    awayScore: 0,
    utcDate: '2026-11-13T15:00:00.000Z',
    competition: { id: 'wcq', name: 'World Cup Qualifiers', area: 'International', code: 'INT', priority: 1 },
    home: { id: 'ghana', name: 'Ghana', shortName: 'Ghana', abbr: 'GHA', color: '#006b3f', crest: '/crests/img/ghana.png' },
    away: { id: 'comoros', name: 'Comoros', shortName: 'Comoros', abbr: 'COM', color: '#3a75c4' },
  }),
  match({
    id: 'sr:match:3',
    utcDate: '2026-11-17T16:00:00.000Z',
    competition: { id: 'wcq', name: 'World Cup Qualifiers', area: 'International', code: 'INT', priority: 1 },
    home: { id: 'madagascar', name: 'Madagascar', shortName: 'Madagascar', abbr: 'MAD', color: '#fc3d32' },
    away: { id: 'ghana', name: 'Ghana', shortName: 'Ghana', abbr: 'GHA', color: '#006b3f', crest: '/crests/img/ghana.png' },
  }),
  match({
    id: 'sr:match:4',
    competition: { id: 'prem', name: 'Premier League', area: 'England', code: 'ENG', priority: 1 },
    home: { id: 'arsenal', name: 'Arsenal', shortName: 'Arsenal', abbr: 'ARS', color: '#ef0107' },
    away: { id: 'chelsea', name: 'Chelsea', shortName: 'Chelsea', abbr: 'CHE', color: '#034694' },
  }),
  match({
    id: 'sr:match:5',
    competition: { id: 'allsvenskan', name: 'Allsvenskan', area: 'Sweden', code: 'SE', priority: 2 },
    home: { id: 'malmo', name: 'Malmö FF', shortName: 'Malmö', abbr: 'MFF', color: '#6ec1e4' },
    away: { id: 'elfsborg', name: 'Elfsborg', shortName: 'Elfsborg', abbr: 'ELF', color: '#f6e500' },
  }),
];

describe('fixture search', () => {
  it('matches teams, leagues, and matches without inventing names', () => {
    const ghana = searchBoard(board, 'ghana');
    expect(ghana.teams.map((hit) => hit.team.name)).toEqual(['Ghana']);
    expect(ghana.teams[0]?.subtitle).toBe('National team');
    expect(ghana.leagues.map((hit) => hit.name)).toEqual(['Ghana Premier League']);
    expect(ghana.matches.map((hit) => hit.id)).toEqual(['sr:match:2', 'sr:match:1', 'sr:match:3']);
    expect(searchBoard(board, 'ars').teams.map((hit) => hit.team.abbr)).toEqual(['ARS']);
    expect(searchBoard(board, 'zzznone')).toEqual({ teams: [], leagues: [], matches: [] });
  });

  it('ignores case and accents and honours the filter chips', () => {
    expect(searchBoard(board, 'MALMO').teams.map((hit) => hit.team.id)).toEqual(['malmo']);
    expect(searchBoard(board, 'ghana', 'teams').leagues).toEqual([]);
    expect(searchBoard(board, 'ghana', 'teams').matches).toEqual([]);
    expect(searchBoard(board, 'premier', 'leagues').teams).toEqual([]);
    expect(searchBoard(board, 'premier', 'matches').leagues).toEqual([]);
  });

  it('builds trending and kick-off rows only from the loaded fixtures', () => {
    const rows = trending(board);
    expect(rows.some((row) => row.kind === 'team' && row.team.id === 'ghana')).toBe(true);
    expect(rows.some((row) => row.kind === 'league')).toBe(true);
    expect(rows.every((row) => (row.kind === 'team' ? board.some((match) => match.home.id === row.team.id || match.away.id === row.team.id) : board.some((match) => match.competition.id === row.id)))).toBe(true);
    const soon = kickoffSoon(board, Date.parse('2026-11-13T14:00:00.000Z'));
    expect(soon.map((match) => match.id)).toEqual(['sr:match:1', 'sr:match:4', 'sr:match:5']);
  });

  it('keeps recent searches locally and drops one chip without inventing any', () => {
    const saved = new Map<string, string>();
    setSearchStore({
      getItem: (key) => saved.get(key) ?? null,
      setItem: (key, value) => {
        saved.set(key, value);
      },
    });
    expect(rememberSearch('g')).toEqual([]);
    expect(rememberSearch('Ghana')).toEqual(['Ghana']);
    expect(rememberSearch('ars')).toEqual(['ars', 'Ghana']);
    expect(rememberSearch('ghana')).toEqual(['ghana', 'ars']);
    expect(forgetSearch('ARS')).toEqual(['ghana']);
    setSearchStore(null);
  });
});
