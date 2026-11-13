import { marketLabel, splitMatch, type EngineState } from './engineSlips';
import type { PickView } from '../data/board';
import type { Match, Team } from '../types';

export type TrendFact = {
  id: string;
  home: string;
  away: string;
  homeId: string;
  awayId: string;
  kickoff: string;
  market: string;
};

export type TrendFace = {
  id: string;
  home: string;
  away: string;
  homeTeam: Team | null;
  awayTeam: Team | null;
  market: string;
  marketLabel: string;
  kickoff: string;
  status: 'open' | 'won' | 'bust' | null;
};

const FOLLOW = /^(sr:match:\d+):(.+)$/;

export function splitFollowId(id: string): { matchId: string; market: string } | null {
  const match = FOLLOW.exec(id);
  if (!match) return null;
  return { matchId: match[1], market: match[2] };
}

function teamOf(match: Match, side: 'home' | 'away'): Team {
  return side === 'home' ? match.home : match.away;
}

function named(name: string, id: string): Team {
  const clean = name.trim();
  return {
    id: id || clean.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name: clean,
    shortName: clean,
    abbr: clean.slice(0, 3).toUpperCase(),
    color: '#2a303c',
  };
}

/** A followed trend as teams, market and kickoff. Never the raw `sr:match:…` id. */
export function faceForFollow(
  id: string,
  sources: {
    picks?: PickView[];
    matches?: Match[];
    facts?: Record<string, TrendFact>;
    engine?: EngineState | null;
  },
): TrendFace {
  const parsed = splitFollowId(id);
  const pick = (sources.picks || []).find((item) => item.id === id);
  const matchId = pick?.matchId || parsed?.matchId || '';
  const market = pick?.market || parsed?.market || '';
  const match = matchId ? (sources.matches || []).find((item) => item.id === matchId) : undefined;
  const fact = sources.facts?.[id];
  const leg = (sources.engine?.trends || [])
    .flatMap((trend) => trend.legs)
    .find((item) => item.eventId === matchId && (!market || item.market === market));
  const [legHome, legAway] = splitMatch(leg?.match || '');
  const homeName = match?.home.shortName || fact?.home || legHome || '';
  const awayName = match?.away.shortName || fact?.away || legAway || '';
  const homeTeam = match ? teamOf(match, 'home') : homeName ? named(homeName, fact?.homeId || '') : null;
  const awayTeam = match ? teamOf(match, 'away') : awayName ? named(awayName, fact?.awayId || '') : null;
  return {
    id,
    home: homeName,
    away: awayName,
    homeTeam,
    awayTeam,
    market,
    marketLabel: market ? marketLabel(market) : pick?.marketLabel || '',
    kickoff: match?.utcDate || fact?.kickoff || leg?.kickoff || '',
    status: pick?.status || null,
  };
}

export function factFromFace(face: TrendFace): TrendFact | null {
  if (!face.home || !face.away || !face.kickoff) return null;
  return {
    id: face.id,
    home: face.home,
    away: face.away,
    homeId: face.homeTeam?.id || face.home,
    awayId: face.awayTeam?.id || face.away,
    kickoff: face.kickoff,
    market: face.market,
  };
}
