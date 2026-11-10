import type { AppConfig, Follows, Match } from '../types';
import { isFollowed } from '../lib/group';
import { dayRangeIso } from '../lib/dates';
import { DEMO_POLL_MS } from './catalog';

export async function fetchConfig(): Promise<AppConfig> {
  try {
    const response = await fetch('/api/config');
    if (!response.ok) throw new Error('config');
    const body = (await response.json()) as Partial<AppConfig>;
    if (body.mode !== 'live' && body.mode !== 'demo') throw new Error('config');
    return {
      mode: body.mode,
      provider: body.provider || (body.mode === 'live' ? 'football-data.org' : 'Simulated matchday'),
      pollMs: typeof body.pollMs === 'number' ? body.pollMs : body.mode === 'live' ? 20_000 : DEMO_POLL_MS,
      reason: body.reason ?? null,
    };
  } catch {
    return {
      mode: 'demo',
      provider: 'Simulated matchday',
      pollMs: DEMO_POLL_MS,
      reason: 'Demo scores are on because the scores API is not configured.',
    };
  }
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
