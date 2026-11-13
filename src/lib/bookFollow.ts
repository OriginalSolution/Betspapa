import { CapacitorHttp } from '@capacitor/core';
import { isNativeApp, nativeRequestOptions, readJsonBody } from './nativeHttp';
import type { DeskId, EngineBook } from './engineSlips';
import { tierMin, type CodeTier } from './pickCodes';

export type BookLeg = {
  eventId: string;
  market: string;
  odds: number;
  kickoff: string;
  match?: string;
  rate?: number | null;
};

export type BookedGroup = {
  id: string;
  books: Partial<Record<DeskId, EngineBook>>;
  bookedAt: string | null;
  legCount: number;
};

const BOOK_URL = 'https://api.betspapa.com/api/book';

export function legsForTier(legs: BookLeg[], tier: CodeTier, market: string | null, now = Date.now()): BookLeg[] {
  const min = tierMin(tier);
  return legs.filter((leg) => {
    const rate = typeof leg.rate === 'number' ? (leg.rate > 1 ? leg.rate / 100 : leg.rate) : 1;
    if (rate + 1e-12 < min) return false;
    if (market && leg.market !== market) return false;
    if (!Number.isFinite(leg.odds) || leg.odds < 1.2) return false;
    const kick = Date.parse(leg.kickoff);
    return Number.isFinite(kick) && kick >= now;
  });
}

export async function bookGroups(groups: Array<{ id: string; legs: BookLeg[] }>): Promise<BookedGroup[]> {
  const body = {
    groups: groups.map((group) => ({
      id: group.id,
      legs: group.legs.map((leg) => ({
        eventId: leg.eventId,
        market: leg.market,
        odds: leg.odds,
        kickoff: leg.kickoff,
        match: leg.match || '',
      })),
    })),
  };
  const read = (data: unknown): BookedGroup[] => {
    const row = data && typeof data === 'object' ? (data as { groups?: BookedGroup[] }) : {};
    return Array.isArray(row.groups) ? row.groups : [];
  };
  if (isNativeApp()) {
    const response = await CapacitorHttp.request(nativeRequestOptions('POST', BOOK_URL, { body }));
    if (response.status < 200 || response.status >= 300) throw new Error(`Booking returned ${response.status}`);
    return read(readJsonBody(response.data));
  }
  const local = await fetch('/api/book', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => null);
  if (local?.ok) return read(await local.json());
  const remote = await fetch(BOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!remote.ok) throw new Error(`Booking returned ${remote.status}`);
  return read(await remote.json());
}
