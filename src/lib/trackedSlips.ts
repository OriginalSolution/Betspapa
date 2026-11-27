import type { TrackedSlip } from './builderStore';
import { DESKS, marketLabel, splitMatch, type DeskId, type EngineLeg, type EngineSlip, type EngineState } from './engineSlips';
import { publishableOdds } from './oddsFloor';
import type { BuilderLeg } from './slipPacks';

/** A pasted code is tracked only when this engine payload already published it. Nothing is invented. */
export function slipFromPublishedCode(state: EngineState | null, raw: string, now = new Date().toISOString()): TrackedSlip | null {
  const code = raw.trim();
  if (!/^[A-Za-z0-9]{4,16}$/.test(code)) return null;
  const slips = [state?.master, ...(state?.trends || []), ...(state?.tiers || [])].filter((slip): slip is EngineSlip => Boolean(slip));
  for (const slip of slips) {
    for (const desk of DESKS) {
      const part = slip.books[desk]?.parts.find((item) => item.code.toLowerCase() === code.toLowerCase());
      if (!part) continue;
      const wanted = new Set(part.matches || []);
      const source = wanted.size ? slip.legs.filter((leg) => wanted.has(leg.eventId)) : slip.legs;
      const legs = source.map(toLeg).filter((leg): leg is BuilderLeg => Boolean(leg));
      if (!legs.length) return null;
      return {
        id: `code:${part.code}`,
        label: slip.label || part.code,
        legs,
        bookedAt: slip.bookedAt || now,
        parts: [{ desk, code: part.code, legs: part.legs || legs.length }],
        desks: [],
        alerted: false,
      };
    }
  }
  return null;
}

export function deskOf(slip: TrackedSlip): DeskId | '' {
  const desk = slip.parts[0]?.desk;
  return (DESKS as readonly string[]).includes(desk) ? (desk as DeskId) : '';
}

function toLeg(leg: EngineLeg): BuilderLeg | null {
  if (!publishableOdds(leg.odds)) return null;
  const [home, away] = splitMatch(leg.match);
  if (!home || !away) return null;
  return {
    key: `${leg.eventId}|${leg.market}`,
    eventId: leg.eventId,
    market: leg.market,
    label: marketLabel(leg.market),
    odds: leg.odds,
    kickoff: leg.kickoff,
    home,
    away,
    homeCrest: leg.homeCrest || null,
    awayCrest: leg.awayCrest || null,
    sample: leg.sample,
  };
}
