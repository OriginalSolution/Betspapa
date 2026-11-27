import { deskBook, showOdds, type DeskId, type EngineBook, type EngineSlip, type EngineState } from './engineSlips';
import { marketFilterLabel } from './matchPicks';
import { isPlayStoreBuild } from './storeBuild';

export type CodeTier = '100' | '90' | '80';

export const CODE_TIERS: CodeTier[] = ['100', '90', '80'];

export const TIER_LABEL: Record<CodeTier, string> = {
  '100': '100%',
  '90': '90%+',
  '80': '80%+',
};

const PLAY_TIER_LABEL: Record<CodeTier, string> = {
  '100': '10/10',
  '90': '9/10+',
  '80': '8/10+',
};

/** Play listings say recent form. The website keeps the percent names. */
export function tierLabel(tier: CodeTier, play = isPlayStoreBuild()): string {
  return play ? PLAY_TIER_LABEL[tier] : TIER_LABEL[tier];
}

/** Rewrite a published tier name for the Play build. Other copy is left as written. */
export function playTierPhrase(text: string, play = isPlayStoreBuild()): string {
  if (!play) return text;
  return text.replace(/90%\+/g, '9/10+').replace(/80%\+/g, '8/10+').replace(/100%/g, '10/10');
}

const PLAY_CODE_LABELS: Array<[string, string]> = [
  ['Banker rules - own odds limits', 'Strategy rules - own odds limits'],
  ['Banker code alerts', 'Strategy code alerts'],
  ['Banker codes', 'Strategy codes'],
  ['Banker Classic', 'Classic'],
  ['Banker Gold', 'Gold'],
  ['Banker Shield', 'Shield'],
  ['Banker Capped', 'Capped'],
  ['Banker Ladder', 'Ladder'],
];

/** Play listings use neutral strategy names. The website keeps Banker. */
export function playCodeLabel(text: string, play = isPlayStoreBuild()): string {
  if (!play || !text) return text;
  return PLAY_CODE_LABELS.reduce((next, [from, to]) => next.split(from).join(to), text);
}

/** A pick's recent-form ring. Play shows tenths; the website keeps the percent. */
export function formRingLabel(rate: number, play = isPlayStoreBuild()): string {
  if (!play) return `${Math.round(rate * 100)}%`;
  const tenths = Math.min(10, Math.max(0, Math.round(rate * 10)));
  return `${tenths}/10`;
}

export function tierMin(tier: CodeTier): number {
  return tier === '100' ? 0.995 : tier === '90' ? 0.9 : 0.8;
}

/** A band shows a pick only when its grade clears that band. Agreement does not lower the bar. */
export function showsInTier(rate: number | null, tier: CodeTier, teamsAgree = false): boolean {
  void teamsAgree;
  return (rate ?? 0) + 1e-12 >= tierMin(tier);
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

export type CodePartView = { code: string; link: string; legs: number; odds: string | null; index: number; total: number };

export function slipParts(slip: EngineSlip | null, desk: DeskId): { parts: CodePartView[]; bookedAt: string | null } {
  const book = deskBook(slip, desk);
  const parts = book.parts
    .filter((part) => part.code)
    .map((part, index, all) => ({
      code: part.code,
      link: part.link,
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
      link: part.link,
      legs: part.legs,
      odds: showOdds(part.totalOdds),
      index: index + 1,
      total: all.length,
    }));
  return { parts, bookedAt };
}
