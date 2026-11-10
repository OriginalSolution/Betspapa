import { CapacitorHttp } from '@capacitor/core';
import type { AppConfig, Follows, Match } from '../types';
import { mapSportyEvents, type SportyEvent } from './sporty';
import { isFollowed } from '../lib/group';
import { dayRangeIso } from '../lib/dates';
import { LIVE_FEED, parseLivePayload } from '../lib/liveBoard';
import { FIXTURE_CONNECT_MS, FIXTURE_READ_MS, isNativeApp, nativeRequestOptions, readJsonBody } from '../lib/nativeHttp';

export const FIXTURE_FEED = 'https://api.betspapa.com/api/sportybet/upcoming';
export { LIVE_FEED };

export type FixtureBody = { events?: SportyEvent[]; error?: string; message?: string };

export type FixtureResult = { status: number; body: FixtureBody };

export type FixtureTransport = {
  native: boolean;
  local: (url: string) => Promise<FixtureResult>;
  direct: (url: string) => Promise<FixtureResult>;
};

export async function fetchConfig(): Promise<AppConfig> {
  try {
    const response = await fetch('/api/config');
    if (!response.ok) throw new Error('config');
    const body = (await response.json()) as Partial<AppConfig>;
    if (body.mode !== 'live' && body.mode !== 'demo' && body.mode !== 'sporty') throw new Error('config');
    return {
      mode: body.mode,
      provider: body.provider || 'Betspapa fixtures',
      pollMs: typeof body.pollMs === 'number' ? body.pollMs : 120_000,
      reason: body.reason ?? null,
    };
  } catch {
    return {
      mode: 'sporty',
      provider: 'Betspapa fixtures',
      pollMs: 120_000,
      reason: null,
    };
  }
}

function fixtureFailure(result: FixtureResult): string {
  return result.body?.message || result.body?.error || `Could not load scores (${result.status})`;
}

function asFixtureBody(data: unknown): FixtureBody {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  return data as FixtureBody;
}

async function browserResult(response: Response): Promise<FixtureResult> {
  let body: FixtureBody = {};
  try {
    body = asFixtureBody(await response.json());
  } catch {
    body = {};
  }
  return { status: response.status, body };
}

function defaultTransport(): FixtureTransport {
  return {
    native: isNativeApp(),
    local: async (url) => browserResult(await fetch(url)),
    direct: async (url) => {
      if (isNativeApp()) {
        const response = await CapacitorHttp.request(
          nativeRequestOptions('GET', url, { connectMs: FIXTURE_CONNECT_MS, readMs: FIXTURE_READ_MS }),
        );
        return { status: response.status, body: asFixtureBody(readJsonBody(response.data)) };
      }
      return browserResult(await fetch(url));
    },
  };
}

export async function fetchSportyBoard(date: string, transport: FixtureTransport = defaultTransport()): Promise<Match[]> {
  const { from, to } = dayRangeIso(date);
  let lastError = 'Fixture feed failed';
  // The packaged app has no local /api server. Browser fetch would send Origin
  // https://localhost and the fixtures API would reject it.
  if (!transport.native) {
    try {
      const local = await transport.local(`/api/fixtures?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      if (local.status >= 200 && local.status < 300 && Array.isArray(local.body?.events)) {
        return mapSportyEvents(local.body.events, from, to);
      }
      lastError = fixtureFailure(local);
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
    }
  }
  try {
    const direct = await transport.direct(FIXTURE_FEED);
    if (direct.status < 200 || direct.status >= 300 || !Array.isArray(direct.body?.events)) {
      throw new Error(direct.status ? fixtureFailure(direct) : lastError);
    }
    return mapSportyEvents(direct.body.events, from, to);
  } catch (error) {
    lastError = error instanceof Error ? error.message : lastError;
  }
  throw new Error(lastError);
}

export async function fetchInPlay(transport: FixtureTransport = defaultTransport()): Promise<Match[]> {
  const read = (result: FixtureResult): Match[] => {
    if (result.status < 200 || result.status >= 300) throw new Error(`In-play scores returned ${result.status}`);
    return parseLivePayload(result.body as { data?: [] });
  };
  let lastError = 'In-play scores failed';
  if (!transport.native) {
    try {
      return read(await transport.local('/api/live'));
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
    }
  }
  try {
    return read(await transport.direct(LIVE_FEED));
  } catch (error) {
    lastError = error instanceof Error ? error.message : lastError;
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
