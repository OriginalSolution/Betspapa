import type { TrackSource, TrackedSlip } from './builderStore';
import { fetchCodes, type CodePart } from './codes';
import { deskBook, fetchEngineSlip, splitMatch, visibleLegs, type DeskId, type EngineSlip } from './engineSlips';
import { packLabel, type BuilderLeg } from './slipPacks';

/** A slip ready to be tracked. The list gives it its number and name. */
export type TrackDraft = Omit<TrackedSlip, 'number' | 'name'>;

function uniqueLegs(legs: BuilderLeg[]): BuilderLeg[] {
  const seen = new Set<string>();
  return legs.filter((leg) => {
    if (seen.has(leg.key)) return false;
    seen.add(leg.key);
    return true;
  });
}

/** A trend or master slip on one bookmaker. Only legs that bookmaker actually booked are tracked. */
export function draftFromEngine(slip: EngineSlip | null | undefined, desk: DeskId, source: TrackSource, origin: string): TrackDraft | null {
  if (!slip) return null;
  const book = deskBook(slip, desk);
  const parts = book.parts.filter((part) => part.code).map((part) => ({ desk, code: part.code, legs: part.legs }));
  if (!parts.length) return null;
  const dropped = new Set(book.dropped.map((drop) => `${drop.eventId}|${drop.market}`));
  const listed = new Set(book.parts.flatMap((part) => part.matches || []));
  const legs = uniqueLegs(
    visibleLegs(slip)
      .filter((leg) => !dropped.has(`${leg.eventId}|${leg.market}`))
      .filter((leg) => !listed.size || listed.has(leg.eventId))
      .map((leg) => {
        const [home, away] = splitMatch(leg.match);
        return {
          key: `${leg.eventId}|${leg.market}`,
          eventId: leg.eventId,
          market: leg.market,
          label: packLabel(leg.market),
          odds: Number(leg.odds) || 0,
          kickoff: leg.kickoff || '',
          home,
          away: away || '',
          homeCrest: null,
          awayCrest: null,
          sample: leg.sample ?? null,
        };
      }),
  );
  return {
    id: `${source}:${slip.id}:${desk}:${parts[0].code}`,
    legs,
    bookedAt: slip.bookedAt || new Date().toISOString(),
    parts,
    desks: [],
    alerted: false,
    source,
    origin,
  };
}

/** A Codes strategy's SportyBet code(s). Each leg keeps its grade key so it settles on its own rule. */
export function draftFromCodes(name: string, parts: CodePart[]): TrackDraft | null {
  const booked = parts.filter((part) => part.code && part.legs.length);
  if (!booked.length) return null;
  const legs = uniqueLegs(
    booked.flatMap((part) =>
      part.legs.map((leg) => {
        const market = leg.market || '';
        return {
          key: `${leg.eventId}|${market || leg.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
          eventId: leg.eventId,
          market,
          label: leg.label,
          odds: Number(leg.odds) || 0,
          kickoff: leg.kickoff || '',
          home: leg.home,
          away: leg.away,
          homeCrest: leg.homeCrest || null,
          awayCrest: leg.awayCrest || null,
          sample: null,
        };
      }),
    ),
  );
  if (!legs.length) return null;
  return {
    id: `codes:${booked.map((part) => part.code).join('+')}`,
    legs,
    bookedAt: booked[0].readAt || new Date().toISOString(),
    parts: booked.map((part) => ({ desk: 'sportybet', code: part.code, legs: part.legCount })),
    desks: [],
    alerted: false,
    source: 'codes',
    origin: name,
  };
}

/** Results the Codes read-back already has (it grades 2-up and 1-up legs the board cannot). */
export async function codesLegGrades(): Promise<Map<string, { status: 'won' | 'lost' | 'void'; ft: string | null; ht: string | null }>> {
  const found = new Map<string, { status: 'won' | 'lost' | 'void'; ft: string | null; ht: string | null }>();
  try {
    const view = await fetchCodes();
    const slots = [
      ...view.strategies.flatMap((strategy) => [strategy.week, strategy.today]),
      ...Object.values(view.dailies || {}).flatMap((day) => Object.values(day)),
    ];
    for (const slot of slots) {
      for (const part of slot?.parts || []) {
        for (const leg of part.legs) {
          if (leg.status !== 'won' && leg.status !== 'lost' && leg.status !== 'void') continue;
          const market = leg.market || leg.label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
          found.set(`${leg.eventId}|${market}`, { status: leg.status, ft: leg.score || null, ht: null });
        }
      }
    }
  } catch {
    /* the board still grades full-time markets */
  }
  return found;
}

/** The draft to show now, plus a loader for the full leg list when the board feed trimmed it. */
export function engineTrack(slip: EngineSlip | null | undefined, desk: DeskId, source: TrackSource, origin: string): { draft: TrackDraft | null; load?: () => Promise<TrackDraft | null> } {
  const draft = draftFromEngine(slip, desk, source, origin);
  if (!slip || !draft) return { draft };
  const trimmed = slip.legs.length < slip.legCount;
  if (!trimmed) return { draft };
  return { draft, load: async () => draftFromEngine(await fetchEngineSlip(slip.id), desk, source, origin) };
}
