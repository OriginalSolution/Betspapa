import { MARKETS } from '../data/board';
import { marketLabel, type EngineLeg, type EngineState } from './engineSlips';
import { publishableOdds } from './oddsFloor';
import type { Match } from '../types';

export type PickSort = 'confidence' | 'odds' | 'kickoff';

export type PickChip = {
  id: string;
  eventId: string;
  market: string;
  label: string;
  short: string;
  odds: number;
  /** 0–1 hit rate from the engine sample or occurrence. Never 1/odds. */
  rate: number | null;
  /** Engine percent, such as 80. */
  occurrence: number | null;
  /** Engine sample, such as 8/10. */
  sample: string | null;
  teamId: string;
  teamName: string;
  opponentId: string;
  opponentName: string;
};

export type MatchPickCard = {
  eventId: string;
  home: string;
  away: string;
  homeId: string;
  awayId: string;
  league: string;
  competitionId: string;
  kickoff: string;
  chips: PickChip[];
  confidence: number;
  lowOdds: number;
};

const SAMPLE = /^(\d+)\s*\/\s*(\d+)$/;

export function chipLabel(market: string): { label: string; short: string } {
  const found = MARKETS.find((item) => item.id === market);
  if (found) return { label: found.label, short: found.short };
  return { label: marketLabel(market), short: marketLabel(market) };
}

/** Real hit rate from the engine. A missing sample is not replaced with 1/odds. */
export function hitRate(occurrence: number | null, sample: string | null): number | null {
  if (sample) {
    const match = SAMPLE.exec(sample.trim());
    if (match) {
      const hits = Number(match[1]);
      const played = Number(match[2]);
      if (played > 0) return hits / played;
    }
  }
  if (occurrence == null || !Number.isFinite(occurrence)) return null;
  if (occurrence > 1) return occurrence / 100;
  return occurrence;
}

function splitFixture(match: string): [string, string] {
  const parts = match.split(/\s+vs\s+/i);
  if (parts.length >= 2) return [parts[0].trim(), parts.slice(1).join(' vs ').trim()];
  return [match.trim(), ''];
}

/** Home-backed markets list the home side. Away-backed markets list the away side. */
export function backedSide(market: string): 'home' | 'away' | 'either' {
  if (market === 'away' || market.startsWith('away') || market === 'dnb-away' || market === 'fh-away' || market === 'dc-x2') return 'away';
  if (market === 'home' || market.startsWith('home') || market === 'dnb-home' || market === 'fh-home' || market === 'dc-1x') return 'home';
  return 'either';
}

function legChips(legs: EngineLeg[], board: Map<string, Match>): PickChip[] {
  const chips: PickChip[] = [];
  const seen = new Set<string>();
  for (const leg of legs) {
    if (!publishableOdds(leg.odds)) continue;
    const rate = hitRate(leg.occurrence, leg.sample);
    if (rate != null && rate + 1e-12 < 0.8) continue;
    const id = `${leg.eventId}:${leg.market}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const names = splitFixture(leg.match);
    const match = board.get(leg.eventId);
    const side = backedSide(leg.market);
    const home = match?.home.shortName || names[0];
    const away = match?.away.shortName || names[1];
    const team = side === 'away' ? away : home;
    const opponent = side === 'away' ? home : away;
    const nameset = chipLabel(leg.market);
    chips.push({
      id,
      eventId: leg.eventId,
      market: leg.market,
      label: nameset.label,
      short: nameset.short,
      odds: leg.odds,
      rate,
      occurrence: leg.occurrence,
      sample: leg.sample,
      teamId: side === 'away' ? match?.away.id || slug(away) : match?.home.id || slug(home),
      teamName: team,
      opponentId: side === 'away' ? match?.home.id || slug(home) : match?.away.id || slug(away),
      opponentName: opponent,
    });
  }
  return chips;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'team';
}

export function cardsFromEngine(state: EngineState | null, matches: Match[], sort: PickSort = 'confidence'): MatchPickCard[] {
  const board = new Map(matches.map((match) => [match.id, match]));
  const byEvent = new Map<string, EngineLeg[]>();
  for (const trend of state?.trends || []) {
    for (const leg of trend.legs) {
      const rows = byEvent.get(leg.eventId) || [];
      rows.push(leg);
      byEvent.set(leg.eventId, rows);
    }
  }
  const cards: MatchPickCard[] = [];
  for (const [eventId, legs] of byEvent) {
    const chips = legChips(legs, board);
    if (!chips.length) continue;
    const match = board.get(eventId);
    const [homeName, awayName] = splitFixture(legs[0]?.match || '');
    const kickoff = match?.utcDate || legs[0]?.kickoff || '';
    cards.push({
      eventId,
      home: match?.home.shortName || homeName,
      away: match?.away.shortName || awayName,
      homeId: match?.home.id || slug(homeName),
      awayId: match?.away.id || slug(awayName),
      league: match?.competition.name || 'Fixture',
      competitionId: match?.competition.id || '',
      kickoff,
      chips: sortChips(chips, sort),
      confidence: chips.reduce((best, chip) => Math.max(best, chip.rate ?? 0), 0),
      lowOdds: chips.reduce((best, chip) => Math.min(best, chip.odds), chips[0].odds),
    });
  }
  return sortCards(cards, sort);
}

function sortChips(chips: PickChip[], sort: PickSort): PickChip[] {
  const copy = [...chips];
  if (sort === 'odds') return copy.sort((a, b) => a.odds - b.odds || a.label.localeCompare(b.label));
  if (sort === 'kickoff') return copy.sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0) || a.odds - b.odds);
  return copy.sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0) || a.odds - b.odds || a.label.localeCompare(b.label));
}

function sortCards(cards: MatchPickCard[], sort: PickSort): MatchPickCard[] {
  const copy = [...cards];
  if (sort === 'odds') return copy.sort((a, b) => a.lowOdds - b.lowOdds || a.kickoff.localeCompare(b.kickoff));
  if (sort === 'kickoff') return copy.sort((a, b) => a.kickoff.localeCompare(b.kickoff) || b.confidence - a.confidence);
  return copy.sort((a, b) => b.confidence - a.confidence || a.kickoff.localeCompare(b.kickoff));
}

export function combinedOdds(chips: PickChip[]): number | null {
  if (!chips.length) return null;
  const product = chips.reduce((total, chip) => total * chip.odds, 1);
  if (!Number.isFinite(product) || product < 1.2) return null;
  return Math.round(product * 100) / 100;
}

export function rateLabel(chip: PickChip): string {
  if (chip.sample) return chip.sample;
  if (chip.occurrence != null && Number.isFinite(chip.occurrence)) {
    const percent = chip.occurrence > 1 ? chip.occurrence : chip.occurrence * 100;
    return `${Math.round(percent)}%`;
  }
  return '';
}
