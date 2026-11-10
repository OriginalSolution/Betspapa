import type { Match } from '../types';

const KEY = 'betspapa.fixtures.v1';

type MemoryStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

let memory: MemoryStore | null = null;

export function setFixtureCacheStore(store: MemoryStore | null) {
  memory = store;
}

function bucket(): MemoryStore | null {
  if (memory) return memory;
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* private mode */
  }
  return null;
}

function isSportyMatch(value: unknown): value is Match {
  if (!value || typeof value !== 'object') return false;
  const match = value as Match;
  return match.feed === 'sporty' && typeof match.id === 'string' && typeof match.utcDate === 'string' && Boolean(match.home?.name) && Boolean(match.away?.name);
}

export function loadFixtureCache(date: string): { matches: Match[]; savedAt: number | null } {
  try {
    const raw = bucket()?.getItem(KEY);
    if (!raw) return { matches: [], savedAt: null };
    const parsed = JSON.parse(raw) as { date?: string; savedAt?: number; matches?: unknown[] };
    if (parsed.date !== date || !Array.isArray(parsed.matches)) return { matches: [], savedAt: null };
    return {
      matches: parsed.matches.filter(isSportyMatch),
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : null,
    };
  } catch {
    return { matches: [], savedAt: null };
  }
}

export function saveFixtureCache(date: string, matches: Match[], savedAt = Date.now()) {
  const sporty = matches.filter(isSportyMatch);
  try {
    bucket()?.setItem(KEY, JSON.stringify({ date, savedAt, matches: sporty }));
  } catch {
    /* a full cache must not block the board */
  }
}

export function chooseFixtures(
  result: { ok: true; matches: Match[] } | { ok: false; message: string },
  cached: Match[],
): { matches: Match[]; feedNote: string | null } {
  if (result.ok) return { matches: result.matches, feedNote: null };
  if (cached.length) {
    return { matches: cached, feedNote: `Showing the last update. Refresh failed (${result.message}).` };
  }
  return { matches: [], feedNote: `Fixture feed is unreachable (${result.message}).` };
}
