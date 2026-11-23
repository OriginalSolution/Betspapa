import type { PickTip } from './matchPicks';
import { marketLabel } from './engineSlips';
import type { Match } from '../types';

/** Same bands as the server. A price outside this table is not a suggestion. */
const RANGES: Record<string, { min: number; max: number; exclusive?: boolean }> = {
  home: { min: 1.2, max: 1.49 },
  away: { min: 1.2, max: 1.49 },
  'home-over15': { min: 1.2, max: 1.49 },
  'away-over15': { min: 1.2, max: 1.49 },
  'dnb-home': { min: 1.2, max: 1.33 },
  'dnb-away': { min: 1.2, max: 1.33 },
  'dc-1x': { min: 1.2, max: 1.33 },
  'dc-x2': { min: 1.2, max: 1.33 },
  over15: { min: 1.2, max: 1.3 },
  under15: { min: 1.2, max: 1.3 },
  over25: { min: 1.2, max: 1.49 },
  under25: { min: 1.2, max: 1.49 },
  over35: { min: 1.2, max: 1.6 },
  under35: { min: 1.2, max: 1.6 },
  btts: { min: 1.2, max: 1.49 },
  'btts-no': { min: 1.2, max: 1.49 },
  'home-score': { min: 1.18, max: 1.3 },
  'away-score': { min: 1.18, max: 1.3 },
  'fh-over05': { min: 1.18, max: 1.25 },
  'fh-over15': { min: 1.2, max: 1.8, exclusive: true },
  'sh-over05': { min: 1.18, max: 1.25 },
  'dc-12': { min: 1.18, max: 1.25 },
};

export const PART_SIZE = 50;

export type LegStatus = 'open' | 'won' | 'lost' | 'void';

export type BuilderLeg = {
  key: string;
  eventId: string;
  market: string;
  label: string;
  odds: number;
  kickoff: string;
  home: string;
  away: string;
  homeCrest: string | null;
  awayCrest: string | null;
  sample: string | null;
};

export type TrendPack = {
  id: string;
  market: string;
  label: string;
  legs: BuilderLeg[];
};

export type GradedLeg = BuilderLeg & {
  status: LegStatus;
  ft: string | null;
  ht: string | null;
};

export function priceAllowed(market: string, odds: number, exception = false): boolean {
  const range = RANGES[market];
  if (!range || !Number.isFinite(odds) || odds <= 1) return false;
  if (odds + 1e-9 < range.min) return false;
  const max = exception && range.max < 1.6 ? 1.6 : range.max;
  const exclusive = exception && range.max < 1.6 ? false : Boolean(range.exclusive);
  if (exclusive) return odds < max - 1e-9;
  return odds <= max + 1e-9;
}

/** One pack per market, from the live 80%+ tips that are still inside the odds table. */
export function trendPacks(tips: PickTip[], matches: Match[], now = Date.now()): TrendPack[] {
  const byId = new Map(matches.map((match) => [match.id, match]));
  const groups = new Map<string, BuilderLeg[]>();
  for (const tip of tips) {
    const kick = Date.parse(tip.kickoff);
    if (!Number.isFinite(kick) || kick < now) continue;
    if (!priceAllowed(tip.chip.market, tip.chip.odds, tip.chip.exception === true)) continue;
    const match = byId.get(tip.chip.eventId);
    const leg: BuilderLeg = {
      key: `${tip.chip.eventId}|${tip.chip.market}`,
      eventId: tip.chip.eventId,
      market: tip.chip.market,
      label: packLabel(tip.chip.market),
      odds: Math.round(tip.chip.odds * 100) / 100,
      kickoff: new Date(kick).toISOString(),
      home: tip.home,
      away: tip.away,
      homeCrest: match?.home.crest || tip.homeCrest || null,
      awayCrest: match?.away.crest || tip.awayCrest || null,
      sample: tip.chip.sample,
    };
    groups.set(leg.market, [...(groups.get(leg.market) || []), leg]);
  }
  return [...groups.entries()]
    .map(([market, legs]) => ({
      id: market,
      market,
      label: packLabel(market),
      legs: legs.sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.home.localeCompare(b.home)),
    }))
    .sort((a, b) => b.legs.length - a.legs.length || a.label.localeCompare(b.label));
}

export function packLabel(market: string): string {
  if (market === 'sh-over05') return 'Second-half over 0.5';
  if (market === 'fh-over05') return 'First-half over 0.5';
  if (market === 'fh-over15') return 'First-half over 1.5';
  if (market === 'dc-12') return 'Double chance 12';
  if (market === 'home-score') return 'Home team to score';
  if (market === 'away-score') return 'Away team to score';
  return marketLabel(market);
}

export function legsForPacks(packs: TrendPack[], ids: string[]): BuilderLeg[] {
  const wanted = new Set(ids);
  const seen = new Set<string>();
  const legs: BuilderLeg[] = [];
  for (const pack of packs) {
    if (!wanted.has(pack.id)) continue;
    for (const leg of pack.legs) {
      if (seen.has(leg.key)) continue;
      seen.add(leg.key);
      legs.push(leg);
    }
  }
  return legs;
}

/** Decimal product, rounded to two places. */
export function combinedOdds(legs: Array<{ odds: number }>): number {
  if (!legs.length) return 0;
  const product = legs.reduce((total, leg) => total * leg.odds, 1);
  return Math.round(product * 100) / 100;
}

export function partsOf<T>(legs: T[], size = PART_SIZE): T[][] {
  const parts: T[][] = [];
  for (let index = 0; index < legs.length; index += size) parts.push(legs.slice(index, index + size));
  return parts;
}

/** won | lost | void | open from a 90-minute score. Half markets stay open without half-time. */
export function gradeScore(market: string, ft: { home: number; away: number } | null, ht: { home: number; away: number } | null): LegStatus {
  if (!ft || !Number.isFinite(ft.home) || !Number.isFinite(ft.away)) return 'open';
  const h = ft.home;
  const a = ft.away;
  const g = h + a;
  const hasHt = Boolean(ht && Number.isFinite(ht.home) && Number.isFinite(ht.away));
  const fh = hasHt && ht ? ht.home + ht.away : 0;
  const yes = (value: boolean): LegStatus => (value ? 'won' : 'lost');
  switch (market) {
    case 'home': return yes(h > a);
    case 'away': return yes(a > h);
    case 'draw': return yes(h === a);
    case 'dc-1x': return yes(h >= a);
    case 'dc-x2': return yes(a >= h);
    case 'dc-12': return yes(h !== a);
    case 'dnb-home': return h === a ? 'void' : yes(h > a);
    case 'dnb-away': return h === a ? 'void' : yes(a > h);
    case 'over15': return yes(g >= 2);
    case 'over25': return yes(g >= 3);
    case 'over35': return yes(g >= 4);
    case 'under15': return yes(g <= 1);
    case 'under25': return yes(g <= 2);
    case 'under35': return yes(g <= 3);
    case 'btts': return yes(h > 0 && a > 0);
    case 'btts-no': return yes(h === 0 || a === 0);
    case 'home-score': return yes(h > 0);
    case 'away-score': return yes(a > 0);
    case 'fh-over05': return hasHt ? yes(fh >= 1) : 'open';
    case 'fh-over15': return hasHt ? yes(fh >= 2) : 'open';
    case 'sh-over05': return hasHt ? yes(g - fh >= 1) : 'open';
    default: return 'open';
  }
}

export function applyGrades(
  legs: BuilderLeg[],
  grades: Map<string, { status: LegStatus; ft: string | null; ht: string | null }>,
): GradedLeg[] {
  return legs.map((leg) => {
    const grade = grades.get(leg.key);
    return { ...leg, status: grade?.status || 'open', ft: grade?.ft || null, ht: grade?.ht || null };
  });
}

/** The one sentence this slip sends, once every leg has a result. */
export function slipAlert(legs: GradedLeg[]): { title: string; body: string; kind: 'win' | 'bust' } | null {
  if (!legs.length || legs.some((leg) => leg.status === 'open')) return null;
  const played = legs.filter((leg) => leg.status === 'won' || leg.status === 'lost');
  if (!played.length) return null;
  const won = played.filter((leg) => leg.status === 'won');
  const lost = played.filter((leg) => leg.status === 'lost');
  const kind = lost.length ? 'bust' : 'win';
  const title = lost.length ? `Slip lost · ${won.length} of ${played.length} legs won` : `Slip won · ${won.length} of ${played.length} legs`;
  const missed = lost[0];
  const landed = won.map((leg) => shortSide(leg.home)).filter(Boolean);
  const landedLine = landed.length === 1 ? `${landed[0]} landed.` : landed.length ? `${joinNames(landed)} legs all landed.` : '';
  const body = missed
    ? `${missed.home} ${scoreWords(missed.ft)} ${missed.away} missed ${missed.label}.${landedLine ? ` ${landedLine}` : ''}`
    : landedLine;
  return { title, kind, body: body.replace(/\s+/g, ' ').trim() };
}

function shortSide(name: string): string {
  return name.replace(/\s+(FC|AFC|CF)$/i, '').trim();
}

function scoreWords(ft: string | null): string {
  return ft ? ft.replace('-', '-') : '';
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] || '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
