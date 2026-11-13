import { fold, isNationalSide } from './crestMatch.mjs';
import type { Match, Team } from '../types';

export type SearchFilter = 'all' | 'teams' | 'leagues' | 'matches';

export type TeamHit = {
  kind: 'team';
  team: Team;
  subtitle: string;
  fixtures: number;
  live: boolean;
};

export type LeagueHit = {
  kind: 'league';
  id: string;
  name: string;
  area: string;
  fixtures: number;
};

export type SearchHits = {
  teams: TeamHit[];
  leagues: LeagueHit[];
  matches: Match[];
};

type Bucket = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

const RECENT_KEY = 'betspapa.search.recent.v1';
const LEAGUE_KEY = 'betspapa.leagueFollows.v1';

let memory: Bucket | null = null;

export function setSearchStore(store: Bucket | null) {
  memory = store;
}

function bucket(): Bucket | null {
  if (memory) return memory;
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* private mode */
  }
  return null;
}

function readList(key: string): string[] {
  try {
    const raw = bucket()?.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
  } catch {
    return [];
  }
}

function writeList(key: string, values: string[]) {
  try {
    bucket()?.setItem(key, JSON.stringify(values));
  } catch {
    /* a full store must not block search */
  }
}

export function loadRecent(): string[] {
  return readList(RECENT_KEY).slice(0, 8);
}

export function rememberSearch(query: string): string[] {
  const text = query.replace(/\s+/g, ' ').trim();
  if (text.length < 2) return loadRecent();
  const next = [text, ...loadRecent().filter((item) => fold(item) !== fold(text))].slice(0, 8);
  writeList(RECENT_KEY, next);
  return next;
}

export function forgetSearch(query: string): string[] {
  const next = loadRecent().filter((item) => fold(item) !== fold(query));
  writeList(RECENT_KEY, next);
  return next;
}

export function loadLeagueFollows(): string[] {
  return readList(LEAGUE_KEY);
}

export function toggleLeagueFollow(id: string): string[] {
  const current = loadLeagueFollows();
  const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
  writeList(LEAGUE_KEY, next);
  return next;
}

function includes(query: string, value: string): boolean {
  const needle = fold(query);
  if (!needle) return false;
  return fold(value).includes(needle);
}

function teamSubtitle(team: Team, sample: Match): string {
  const context = { area: sample.competition.area, competition: sample.competition.name };
  if (isNationalSide(team.name, context) || isNationalSide(team.shortName, context)) {
    return /\bu\d{2}\b|youth/i.test(`${team.name} ${team.shortName}`) ? 'National youth team' : 'National team';
  }
  return sample.competition.name;
}

export function teamsIn(matches: Match[]): TeamHit[] {
  const map = new Map<string, TeamHit>();
  for (const match of matches) {
    for (const team of [match.home, match.away]) {
      const existing = map.get(team.id);
      const live = match.status === 'live' || match.status === 'halftime';
      if (existing) {
        existing.fixtures += 1;
        existing.live = existing.live || live;
        if (!existing.team.crest && team.crest) existing.team = team;
        continue;
      }
      map.set(team.id, { kind: 'team', team, subtitle: teamSubtitle(team, match), fixtures: 1, live });
    }
  }
  return [...map.values()];
}

export function leaguesIn(matches: Match[]): LeagueHit[] {
  const map = new Map<string, LeagueHit>();
  for (const match of matches) {
    const id = match.competition.id;
    const existing = map.get(id);
    if (existing) existing.fixtures += 1;
    else map.set(id, { kind: 'league', id, name: match.competition.name, area: match.competition.area, fixtures: 1 });
  }
  return [...map.values()];
}

export function searchBoard(matches: Match[], query: string, filter: SearchFilter = 'all'): SearchHits {
  const text = query.trim();
  if (text.length < 2) return { teams: [], leagues: [], matches: [] };
    const teams = teamsIn(matches)
    .filter((hit) => includes(text, hit.team.name) || includes(text, hit.team.shortName) || includes(text, hit.team.abbr))
    .sort((a, b) => Number(b.live) - Number(a.live) || b.fixtures - a.fixtures || a.team.name.localeCompare(b.team.name));
  const leagues = leaguesIn(matches)
    .filter((hit) => includes(text, hit.name) || includes(text, hit.area))
    .sort((a, b) => b.fixtures - a.fixtures || a.name.localeCompare(b.name));
  const found = matches
    .filter((match) => includes(text, match.home.name) || includes(text, match.home.shortName) || includes(text, match.home.abbr) || includes(text, match.away.name) || includes(text, match.away.shortName) || includes(text, match.away.abbr) || includes(text, match.competition.name))
    .sort((a, b) => a.utcDate.localeCompare(b.utcDate));
  return {
    teams: filter === 'leagues' || filter === 'matches' ? [] : teams,
    leagues: filter === 'teams' || filter === 'matches' ? [] : leagues,
    matches: filter === 'teams' || filter === 'leagues' ? [] : found,
  };
}

export function trending(matches: Match[], limit = 6): Array<TeamHit | LeagueHit> {
  const teams = teamsIn(matches)
    .sort((a, b) => Number(b.live) - Number(a.live) || b.fixtures - a.fixtures || a.team.name.localeCompare(b.team.name))
    .slice(0, 4);
  const leagues = leaguesIn(matches)
    .sort((a, b) => b.fixtures - a.fixtures || a.name.localeCompare(b.name))
    .slice(0, 2);
  return [...teams, ...leagues].slice(0, limit);
}

export function kickoffSoon(matches: Match[], now = Date.now(), limit = 4): Match[] {
  const horizon = now + 18 * 60 * 60_000;
  return matches
    .filter((match) => {
      const kick = Date.parse(match.utcDate);
      return match.status === 'scheduled' && kick >= now - 30 * 60_000 && kick <= horizon;
    })
    .sort((a, b) => a.utcDate.localeCompare(b.utcDate))
    .slice(0, limit);
}
