import { publishableOdds } from './oddsFloor';
import { deskBook, marketLabel, showOdds, splitMatch, type DeskId, type EngineLeg, type EngineState } from './engineSlips';
import { isSimulatedFixture } from './simulated';

export type CodePart = {
  code: string;
  legs: number;
  odds: string | null;
  index: number;
  total: number;
};

export type MarketCodeCard = {
  id: string;
  market: string;
  label: string;
  codes: string[];
  legs: number;
  odds: string | null;
};

function realLeg(leg: EngineLeg): boolean {
  if (!publishableOdds(leg.odds)) return false;
  const [home, away] = splitMatch(leg.match);
  return !isSimulatedFixture({ home, away });
}

export function realLegs(legs: EngineLeg[] | null | undefined): EngineLeg[] {
  return (legs || []).filter(realLeg);
}

/** Short market title for a code card, such as "Over 1.5" or "BTTS yes". */
export function shortMarket(market: string | null | undefined): string {
  if (market === 'btts') return 'BTTS yes';
  if (market === 'btts-no') return 'BTTS no';
  return marketLabel(market).replace(/ goals$/, '').replace(/^Full-time /, '');
}

export function masterParts(state: EngineState | null, desk: DeskId): { parts: CodePart[]; bookedAt: string | null; legs: EngineLeg[] } {
  const master = state?.master ?? null;
  const book = deskBook(master, desk);
  const parts = book.parts
    .filter((part) => part.code)
    .map((part, index, all) => ({
      code: part.code,
      legs: part.legs,
      odds: showOdds(part.totalOdds),
      index: index + 1,
      total: all.length,
    }));
  return {
    parts,
    bookedAt: master?.bookedAt ?? null,
    legs: realLegs(master?.legs),
  };
}

/** One card per booked market slip. A desk with no code stays on the card as an empty code list. */
export function marketCodeCards(state: EngineState | null, desk: DeskId): MarketCodeCard[] {
  const cards: MarketCodeCard[] = [];
  for (const trend of state?.trends || []) {
    if (!trend.market || trend.id === 'master') continue;
    const legs = realLegs(trend.legs);
    if (!legs.length) continue;
    const parts = deskBook(trend, desk).parts.filter((part) => part.code);
    const priced = parts.map((part) => showOdds(part.totalOdds)).filter((value): value is string => Boolean(value));
    cards.push({
      id: trend.id,
      market: trend.market,
      label: shortMarket(trend.market),
      codes: parts.map((part) => part.code),
      legs: parts.length ? parts.reduce((sum, part) => sum + part.legs, 0) : legs.length,
      odds: priced[0] || null,
    });
  }
  return cards;
}
