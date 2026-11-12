export const CONFIDENCE: number;

export type CrestCandidate = {
  id: string;
  name: string;
  badge: string;
  country: string;
  sport: string;
  league: string;
  leagues: string[];
  aliases: string[];
};

export type CrestContext = { area?: string; competition?: string };

export function fold(value: string): string;
export function looseKey(name: string): string;
export function teamSlug(name: string): string;
export function coreName(name: string): string;
export function indexKeys(name: string): string[];
export function isNationalSide(name: string, context?: CrestContext): boolean;
export function flagUrl(name: string): string | null;
export function searchQueries(name: string, context?: CrestContext): string[];
export function allowedImageUrl(url: string): boolean;
export function pickBest(
  queryName: string,
  candidates: CrestCandidate[],
  context?: CrestContext,
): { candidate: CrestCandidate; confidence: number } | null;
export function sportsDbCandidates(payload: unknown): CrestCandidate[];
export function wikidataCandidates(entities: unknown): CrestCandidate[];
