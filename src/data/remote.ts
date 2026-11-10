import type { AppConfig, Follows, Match } from '../types';
import { mapSportyEvents, type SportyEvent } from './sporty';
import { isFollowed } from '../lib/group';
import { dayRangeIso } from '../lib/dates';

export async function fetchConfig(): Promise<AppConfig> {
  try {
    const response = await fetch('/api/config');
    if (!response.ok) throw new Error('config');
    const body = (await response.json()) as Partial<AppConfig>;
    if (body.mode !== 'live' && body.mode !== 'demo' && body.mode !== 'sporty') throw new Error('config');
    return {
      mode: body.mode,
      provider: body.provider || 'Betspapa fixtures',
      pollMs: typeof body.pollMs === 'number' ? body.pollMs : 30_000,
      reason: body.reason ?? null,
    };
  } catch {
    return {
      mode: 'sporty',
      provider: 'Betspapa fixtures',
      pollMs: 30_000,
      reason: null,
    };
  }
}

export async function fetchSportyBoard(date: string): Promise<Match[]> {
  const { from, to } = dayRangeIso(date);
  const urls = [
    `/api/fixtures?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    'https://api.betspapa.com/api/sportybet/upcoming',
  ];
  let lastError = 'Fixture feed failed';
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        lastError = await readError(response);
        continue;
      }
      const body = (await response.json()) as { events?: SportyEvent[] };
      const events = body.events ?? [];
      return mapSportyEvents(url.startsWith('https://') ? events : events, from, to);
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
    }
  }
  throw new Error(lastError);
}

export function detailIds(matches: Match[], follows: Follows, activeId: string | null): string[] {
  const rank = (match: Match) => {
    if (match.id === activeId) return 0;
    if (match.status === 'live') return 1;
    if (match.status === 'halftime') return 2;
    return 3;
  };
  return matches
    .filter((match) => match.id === activeId || isFollowed(match, follows))
    .filter((match) => match.status !== 'scheduled' && match.status !== 'postponed')
    .sort((a, b) => rank(a) - rank(b) || a.utcDate.localeCompare(b.utcDate))
    .slice(0, 6)
    .map((match) => match.id);
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {
    /* use the status line */
  }
  return `Could not load scores (${response.status})`;
}

export async function fetchLiveBoard(date: string, follows: Follows, activeId: string | null): Promise<Match[]> {
  const { from, to } = dayRangeIso(date);
  const response = await fetch(`/api/matches?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  if (!response.ok) throw new Error(await readError(response));
  const data = (await response.json()) as { matches?: Match[] };
  const matches = data.matches ?? [];
  const ids = detailIds(matches, follows, activeId);
  if (!ids.length) return matches;
  const details = await Promise.all(
    ids.map(async (id) => {
      try {
        const detail = await fetch(`/api/matches/${encodeURIComponent(id)}`);
        if (!detail.ok) return null;
        const body = (await detail.json()) as { match?: Match };
        return body.match ?? null;
      } catch {
        return null;
      }
    }),
  );
  const extra = new Map(details.filter((match): match is Match => Boolean(match)).map((match) => [match.id, match]));
  return matches.map((match) => extra.get(match.id) ?? match);
}

export async function fetchLiveMatch(id: string): Promise<Match | null> {
  const response = await fetch(`/api/matches/${encodeURIComponent(id)}`);
  if (!response.ok) return null;
  const body = (await response.json()) as { match?: Match };
  return body.match ?? null;
}
