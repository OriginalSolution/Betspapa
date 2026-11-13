import { deskBook, showOdds, type DeskId, type EngineBook, type EngineSlip, type EngineState } from './engineSlips';
import { marketFilterLabel } from './matchPicks';

export type CodeTier = '100' | '90' | '80';

export const CODE_TIERS: CodeTier[] = ['100', '90', '80'];

export const TIER_LABEL: Record<CodeTier, string> = {
  '100': '100%',
  '90': '90%+',
  '80': '80%+',
};

export function tierMin(tier: CodeTier): number {
  return tier === '100' ? 0.995 : tier === '90' ? 0.9 : 0.8;
}

/** The booked slip for a confidence band. A market of null is every qualifying pick in that band. */
export function tierSlip(state: EngineState | null, tier: CodeTier, market: string | null): EngineSlip | null {
  const id = market ? `tier:${tier}:${market}` : `tier:${tier}`;
  const found = (state?.tiers || []).find((slip) => slip.id === id);
  if (found) return found;
  if (tier === '80' && market) {
    return (state?.trends || []).find((slip) => slip.market === market && !slip.id.startsWith('tier:')) || null;
  }
  return null;
}

export type CodePartView = { code: string; legs: number; odds: string | null; index: number; total: number };

export function slipParts(slip: EngineSlip | null, desk: DeskId): { parts: CodePartView[]; bookedAt: string | null } {
  const book = deskBook(slip, desk);
  const parts = book.parts
    .filter((part) => part.code)
    .map((part, index, all) => ({
      code: part.code,
      legs: part.legs,
      odds: showOdds(part.totalOdds),
      index: index + 1,
      total: all.length,
    }));
  return { parts, bookedAt: slip?.bookedAt ?? null };
}

export function marketCodeLabel(market: string): string {
  return marketFilterLabel(market);
}

export function partsFromBook(book: EngineBook | undefined, bookedAt: string | null): { parts: CodePartView[]; bookedAt: string | null } {
  const parts = (book?.parts || [])
    .filter((part) => part.code)
    .map((part, index, all) => ({
      code: part.code,
      legs: part.legs,
      odds: showOdds(part.totalOdds),
      index: index + 1,
      total: all.length,
    }));
  return { parts, bookedAt };
}
