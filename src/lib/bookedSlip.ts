import type { DeskId } from './engineSlips';
import { DESKS, DESK_NAMES } from './engineSlips';
import { kickoffClock } from './format';
import { combinedOdds, formatTotalOdds } from './slipPacks';

export type BookedPartView = {
  code: string;
  legs: number;
  matches: number;
  from: string;
  to: string;
  link?: string;
  totalOdds?: number | null;
};

export type BookedDeskView = {
  desk: DeskId;
  name: string;
  bookedLegs: number;
  missed: number;
  codes: number;
  error: string | null;
  parts: BookedPartView[];
};

type SentLeg = { eventId: string; kickoff: string; odds?: number };
type ReturnedPart = { code?: string; legs?: number; matches?: string[]; link?: string; totalOdds?: number | null };
type ReturnedBook = { parts?: ReturnedPart[]; error?: string | null; dropped?: unknown[] };
type ReturnedGroup = { books?: Partial<Record<string, ReturnedBook>> };

export function coverageLine(booked: number, total: number, codes: number): string {
  const word = codes === 1 ? 'code' : 'codes';
  if (total > 0 && booked < total) return `${booked} of ${total} legs · ${total - booked} not booked · ${codes} ${word}`;
  return `${booked} of ${total} legs · ${codes} ${word}`;
}

export function partSummary(part: BookedPartView): string {
  const legs = `${part.legs} ${part.legs === 1 ? 'leg' : 'legs'}`;
  const matches = `${part.matches} ${part.matches === 1 ? 'match' : 'matches'}`;
  const odds = formatTotalOdds(part.totalOdds || 0);
  const span = part.from && part.to && part.from !== part.to ? `${part.from}–${part.to}` : part.from || part.to;
  return [legs, matches, odds ? `total odds ${odds}` : '', span].filter(Boolean).join(' · ');
}

export function failedDeskLine(desks: BookedDeskView[]): string | null {
  const failed = desks.filter((desk) => desk.error && !desk.parts.length);
  if (!failed.length) return null;
  const names = failed.map((desk) => desk.name);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${list} did not return a code. ${failed[0].error || 'Try again.'}`;
}

/** One card per bookmaker, in desk order, from the codes the booking call actually returned. */
export function desksFromBooking(totalLegs: number, sentGroups: SentLeg[][], groups: ReturnedGroup[]): BookedDeskView[] {
  return DESKS.map((desk) => {
    const parts: BookedPartView[] = [];
    let error: string | null = null;
    groups.forEach((group, index) => {
      const book = group.books?.[desk];
      if (!book) return;
      if (!error && book.error) error = book.error;
      const sent = sentGroups[index] || [];
      for (const part of book.parts || []) {
        const code = String(part.code || '').trim();
        if (!code) continue;
        const ids = new Set((part.matches || []).filter(Boolean));
        const rows = ids.size ? sent.filter((leg) => ids.has(leg.eventId)) : sent;
        const times = rows.map((leg) => kickoffClock(leg.kickoff)).filter(Boolean);
        const matchCount = ids.size || new Set(rows.map((leg) => leg.eventId)).size;
        const link = typeof part.link === 'string' && part.link.startsWith('https:') ? part.link : undefined;
        const returnedOdds = Number(part.totalOdds);
        const computed = combinedOdds(rows.flatMap((leg) => (Number.isFinite(leg.odds) ? [{ odds: Number(leg.odds) }] : [])));
        const totalOdds = Number.isFinite(returnedOdds) && returnedOdds > 0 ? Math.round(returnedOdds * 100) / 100 : computed || null;
        parts.push({
          code,
          legs: Number(part.legs) || rows.length,
          matches: matchCount,
          from: times[0] || '',
          to: times[times.length - 1] || '',
          ...(link ? { link } : {}),
          ...(totalOdds ? { totalOdds } : {}),
        });
      }
    });
    const bookedLegs = parts.reduce((sum, part) => sum + part.legs, 0);
    return {
      desk,
      name: DESK_NAMES[desk],
      bookedLegs,
      missed: Math.max(0, totalLegs - bookedLegs),
      codes: parts.length,
      error,
      parts,
    };
  }).filter((desk) => desk.parts.length > 0 || desk.error);
}
