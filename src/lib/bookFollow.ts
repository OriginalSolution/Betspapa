import { CapacitorHttp } from '@capacitor/core';
import { apiUrl } from './apiJson';
import { isNativeApp, nativeRequestOptions, readJsonBody } from './nativeHttp';
import type { DeskId, EngineBook } from './engineSlips';
import { MIN_PUBLISHED_ODDS } from './oddsFloor';
import { showsInTier, TIER_LABEL, type CodeTier } from './pickCodes';

export type BookLeg = {
  eventId: string;
  market: string;
  odds: number;
  kickoff: string;
  match?: string;
  rate?: number | null;
  teamsAgree?: boolean;
  status?: 'open' | 'won' | 'bust' | null;
};

export type BookedGroup = {
  id: string;
  books: Partial<Record<DeskId, EngineBook>>;
  bookedAt: string | null;
  legCount: number;
  reason?: string;
};

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
  return legs.filter((leg) => {
    const rate = typeof leg.rate === 'number' ? (leg.rate > 1 ? leg.rate / 100 : leg.rate) : 1;
    if (!showsInTier(rate, tier, leg.teamsAgree === true)) return false;
    if (market && leg.market !== market) return false;
    if (leg.status === 'won' || leg.status === 'bust') return false;
    if (!Number.isFinite(leg.odds) || leg.odds < MIN_PUBLISHED_ODDS) return false;
    const kick = Date.parse(leg.kickoff);
    return Number.isFinite(kick) && kick >= now;
  });
}

/** Client stops waiting if the API has not answered by then. The server also caps an on-demand book at 40s. */
export const BOOK_TIMEOUT_MS = 45_000;
export const BOOK_CONNECT_MS = 15_000;

export function bookingFailureMessage(reason: unknown): string {
  if (reason && typeof reason === 'object') {
    const name = 'name' in reason ? String(reason.name) : '';
    const message = 'message' in reason ? String(reason.message) : '';
    if (name === 'TimeoutError' || name === 'AbortError' || /timeout/i.test(message)) {
      return 'Booking took too long. Check your connection and try again.';
    }
    if (message) return message;
  }
  return 'Booking could not finish. Check your connection and try again.';
}

export async function bookGroups(
  groups: Array<{ id: string; legs: BookLeg[] }>,
  opts: { timeoutMs?: number } = {},
): Promise<BookedGroup[]> {
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
    const row = data && typeof data === 'object' ? (data as { groups?: BookedGroup[]; error?: string }) : {};
    if (typeof row.error === 'string' && row.error.trim()) throw new Error(row.error.trim());
    return Array.isArray(row.groups) ? row.groups : [];
  };
  const timeoutMs = opts.timeoutMs ?? BOOK_TIMEOUT_MS;
  const url = apiUrl('/api/book');
  if (isNativeApp()) {
    let response;
    try {
      response = await CapacitorHttp.request(
        nativeRequestOptions('POST', url, { body, connectMs: BOOK_CONNECT_MS, readMs: timeoutMs }),
      );
    } catch (error) {
      throw new Error(bookingFailureMessage(error));
    }
    if (response.status === 429) throw new Error('Too many booking requests. Try again in a minute.');
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Booking is not available right now (error ${response.status}). Try again in a moment.`);
    }
    return read(readJsonBody(response.data));
  }
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new Error(bookingFailureMessage(error));
  }
  if (response.status === 429) throw new Error('Too many booking requests. Try again in a minute.');
  if (!response.ok) throw new Error(`Booking is not available right now (error ${response.status}). Try again in a moment.`);
  return read(await response.json());
}
