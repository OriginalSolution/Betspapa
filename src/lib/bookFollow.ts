import { CapacitorHttp } from '@capacitor/core';
import { isNativeApp, nativeRequestOptions, readJsonBody } from './nativeHttp';
import type { DeskId, EngineBook } from './engineSlips';
import { MIN_PUBLISHED_ODDS } from './oddsFloor';
import { tierMin, TIER_LABEL, type CodeTier } from './pickCodes';

export type BookLeg = {
  eventId: string;
  market: string;
  odds: number;
  kickoff: string;
  match?: string;
  rate?: number | null;
  status?: 'open' | 'won' | 'bust' | null;
};

export type BookedGroup = {
  id: string;
  books: Partial<Record<DeskId, EngineBook>>;
  bookedAt: string | null;
  legCount: number;
  reason?: string;
};

const BOOK_URL = 'https://api.betspapa.com/api/book';
const TIER_ORDER: CodeTier[] = ['100', '90', '80'];

/** Use the chosen tier when it still has open legs. Otherwise say why and step down. */
export function tierFallback(legs: BookLeg[], tier: CodeTier, now = Date.now()): { tier: CodeTier; legs: BookLeg[]; note: string } {
  const start = Math.max(0, TIER_ORDER.indexOf(tier));
  for (let index = start; index < TIER_ORDER.length; index += 1) {
    const next = TIER_ORDER[index];
    const rows = legsForTier(legs, next, null, now);
    if (!rows.length) continue;
    const note = index === start ? '' : `No open follows at ${TIER_LABEL[tier]}. Showing ${TIER_LABEL[next]} instead.`;
    return { tier: next, legs: rows, note };
  }
  const anyOpen = legs.some((leg) => {
    const kick = Date.parse(leg.kickoff);
    return leg.status !== 'won' && leg.status !== 'bust' && Number.isFinite(kick) && kick >= now;
  });
  if (legs.length && !anyOpen) return { tier, legs: [], note: 'Every follow has kicked off or settled, so nothing is on the code.' };
  if (legs.length) return { tier, legs: [], note: `No open follows are still at ${TIER_LABEL[tier]} or below.` };
  return { tier, legs: [], note: 'No open follows to book.' };
}

export function legsForTier(legs: BookLeg[], tier: CodeTier, market: string | null, now = Date.now()): BookLeg[] {
  const min = tierMin(tier);
  return legs.filter((leg) => {
    const rate = typeof leg.rate === 'number' ? (leg.rate > 1 ? leg.rate / 100 : leg.rate) : 1;
    if (rate + 1e-12 < min) return false;
    if (market && leg.market !== market) return false;
    if (leg.status === 'won' || leg.status === 'bust') return false;
    if (!Number.isFinite(leg.odds) || leg.odds < MIN_PUBLISHED_ODDS) return false;
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
