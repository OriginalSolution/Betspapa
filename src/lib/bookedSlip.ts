import type { DeskId } from './engineSlips';
import { DESKS, DESK_NAMES } from './engineSlips';
import { kickoffClock } from './format';

export type BookedPartView = {
  code: string;
  legs: number;
  matches: number;
  from: string;
  to: string;
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

type SentLeg = { eventId: string; kickoff: string };
type ReturnedPart = { code?: string; legs?: number; matches?: string[] };
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
  const span = part.from && part.to && part.from !== part.to ? `${part.from}–${part.to}` : part.from || part.to;
  return [legs, matches, span].filter(Boolean).join(' · ');
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
        parts.push({
          code,
          legs: Number(part.legs) || rows.length,
          matches: matchCount,
          from: times[0] || '',
          to: times[times.length - 1] || '',
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
