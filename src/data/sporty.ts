import { countryMark } from '../lib/country';
import { isDummyEventId, isSimulatedFixture } from '../lib/simulated';
import type { Match, Team } from '../types';

export type SportyEvent = {
  eventId: string;
  home: string;
  away: string;
  kickoff: string;
  tournament: string;
  country: string;
  odds?: Record<string, number> | null;
  occurrence?: Array<{ market: string; hits: number; sample: number; rate: number }>;
  url?: string;
  /** Our own crest copy, from the server's crest list (absolute URL). */
  homeCrest?: string;
  awayCrest?: string;
};

const PALETTE = ['#e11d2e', '#3d7eff', '#f0c94a', '#21a366', '#a855f7', '#ff7a45', '#14b8a6', '#6366f1', '#84cc16', '#6cabdd'];

function hashColor(value: string): string {
  let hash = 0;
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'team';
}

function abbr(name: string): string {
  const parts = name.replace(/[^A-Za-z ]/g, '').split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 3).toUpperCase();
}

function serverCrest(url: unknown): string | null {
  if (typeof url !== 'string' || !/^https:\/\//i.test(url)) return null;
  return /sofascore|sportybet/i.test(url) ? null : url;
}

function team(name: string, crest?: unknown): Team {
  const id = slug(name);
  const badge = serverCrest(crest);
  return { id, name, shortName: name, abbr: abbr(name), color: hashColor(name), ...(badge ? { crest: badge } : {}) };
}

function priority(tournament: string, country: string): number {
  const name = `${tournament} ${country}`.toLowerCase();
  if (name.includes('champions league') && !name.includes('women')) return 1;
  if (name.includes('europa league')) return 2;
  if (name.includes('copa del rey') || name.includes('fa cup') || name.includes('coppa')) return 3;
  if (name.includes('premier league') && !name.includes('amateur') && !name.includes('cup')) return 4;
  if (name.includes('la liga') || name.includes('serie a') || name.includes('bundesliga')) return 5;
  if (name.includes('women')) return 8;
  if (name.includes('amateur') || name.includes('youth')) return 24;
  return 12;
}

function code(country: string): string {
  return countryMark(country).code;
}

export function mapSportyEvent(event: SportyEvent): Match {
  const odds = event.odds && typeof event.odds === 'object' ? event.odds : null;
  return {
    id: String(event.eventId),
    competition: {
      id: slug(`${event.country}-${event.tournament}`),
      name: event.tournament || 'Fixture',
      area: event.country || 'International',
      code: code(event.country || 'INT'),
      priority: priority(event.tournament || '', event.country || ''),
    },
    utcDate: event.kickoff,
    status: 'scheduled',
    minute: null,
    injuryTime: null,
    home: team(event.home, event.homeCrest),
    away: team(event.away, event.awayCrest),
    homeScore: null,
    awayScore: null,
    htHome: null,
    htAway: null,
    events: [],
    venue: null,
    varReview: null,
    odds,
    occurrence: Array.isArray(event.occurrence) ? event.occurrence : undefined,
    feed: 'sporty',
  };
}

export function mapSportyEvents(events: SportyEvent[], fromIso: string, toIso: string): Match[] {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  return events
    .filter((event) => {
      const kick = new Date(event.kickoff).getTime();
      if (!Number.isFinite(kick) || kick < from || kick > to || !event.home || !event.away) return false;
      if (isDummyEventId(event.eventId)) return false;
      return !isSimulatedFixture({
        country: event.country,
        tournament: event.tournament,
        home: event.home,
        away: event.away,
      });
    })
    .map(mapSportyEvent)
    .sort((a, b) => a.utcDate.localeCompare(b.utcDate) || a.competition.priority - b.competition.priority);
}
