import { mapSportyEvent, type SportyEvent } from '../data/sporty';
import type { Match, MatchEvent, MatchStatus } from '../types';

/** In-play football on the same fixture service the board already uses. The public label stays Betspapa fixtures. */
export const LIVE_FEED = 'https://www.sportybet.com/api/gh/factsCenter/liveOrPrematchEvents?sportId=sr%3Asport%3A1';

/** A listed kickoff stays in play until a normal match would have ended, unless a score feed says otherwise. */
export const LIVE_WINDOW_MS = 130 * 60 * 1000;

type LiveOutcome = { id?: string | number; odds?: string | number; desc?: string; isActive?: number };
type LiveMarket = { id?: string | number; specifier?: string; outcomes?: LiveOutcome[] };
type LiveEvent = {
  eventId?: string;
  homeTeamName?: string;
  awayTeamName?: string;
  estimateStartTime?: number;
  status?: number;
  matchStatus?: string;
  period?: string;
  playedSeconds?: string;
  setScore?: string;
  gameScore?: string[];
  markets?: LiveMarket[];
  sport?: { category?: { name?: string; tournament?: { name?: string } } };
  fixtureVenue?: { name?: string };
  varReview?: { teamId?: string; player?: string; minute?: number } | null;
  timeline?: unknown;
  incidents?: unknown;
  comments?: unknown;
};

type FeedIncident = { type: 'goal' | 'yellow' | 'red' | 'var'; minute: number; side: 'home' | 'away'; player: string | null };
type LiveTournament = { name?: string; categoryName?: string; events?: LiveEvent[] };

const SCORE = /^(\d+)\s*[:\-]\s*(\d+)$/;

function pair(value: string | null | undefined): [number, number] | null {
  const matched = SCORE.exec(String(value || '').trim());
  if (!matched) return null;
  return [Number(matched[1]), Number(matched[2])];
}

export function liveStatus(matchStatus: string | null | undefined, numeric?: number): MatchStatus {
  const status = String(matchStatus || '').trim().toUpperCase();
  if (['HT', 'PAUSED', 'HALFTIME', 'HALF-TIME', 'HALF TIME'].includes(status)) return 'halftime';
  if (['FT', 'ENDED', 'FINISHED', 'AET', 'AP', 'CLOSED', 'AWD', 'WO'].includes(status)) return 'finished';
  if (['PST', 'POSTPONED', 'CANCELLED', 'CANCELED', 'ABD', 'ABANDONED'].includes(status)) return 'postponed';
  if (['H1', '1H', 'H2', '2H', 'LIVE', 'OT', 'ET', 'PEN', 'INPLAY', 'IN PLAY'].includes(status)) return 'live';
  if (numeric === 3 || numeric === 4) return 'finished';
  if (numeric === 1 || numeric === 2) return 'live';
  return 'scheduled';
}

export function liveMinute(played: string | null | undefined, matchStatus: string | null | undefined): number | null {
  const minute = Number(String(played || '').split(':')[0]);
  if (!Number.isFinite(minute)) return null;
  const half = String(matchStatus || '').trim().toUpperCase();
  if ((half === 'H2' || half === '2H' || half === 'HT') && minute < 46) return minute + 45;
  return minute;
}

function priceOf(value: string | number | undefined): number | null {
  const price = Number(value);
  return Number.isFinite(price) && price > 1 ? Math.round(price * 100) / 100 : null;
}

/** Pull the major lines off an in-play event. Keys match the upcoming fixture prices. */
export function oddsFromMarkets(markets: LiveMarket[] | null | undefined): Record<string, number> {
  const odds: Record<string, number> = {};
  const put = (key: string, value: number | null) => {
    if (value != null) odds[key] = value;
  };
  for (const market of markets || []) {
    const id = String(market.id ?? '');
    const spec = String(market.specifier || '');
    const line = spec.match(/total=(\d+(?:\.\d+)?)/)?.[1];
    const outcomes = market.outcomes || [];
    const byId = (outcomeId: string) => priceOf(outcomes.find((outcome) => String(outcome.id) === outcomeId)?.odds);
    if (id === '1') {
      put('home', byId('1'));
      put('draw', byId('2'));
      put('away', byId('3'));
    } else if (id === '18' && line) {
      const tag = line.replace('.', '');
      put(`over-${tag}`, byId('12'));
      put(`under-${tag}`, byId('13'));
    } else if (id === '10') {
      put('dc-1x', byId('9'));
      put('dc-12', byId('10'));
      put('dc-x2', byId('11'));
    } else if (id === '11') {
      put('home-dnb', byId('4'));
      put('away-dnb', byId('5'));
    } else if (id === '29') {
      put('btts-yes', byId('74'));
      put('btts-no', byId('76'));
    } else if ((id === '19' || id === '20') && line === '0.5') {
      const side = id === '19' ? 'home' : 'away';
      put(`${side}-over-05`, byId('12'));
      put(`${side}-under-05`, byId('13'));
    } else if (id === '60') {
      put('fh-home', byId('1'));
      put('fh-draw', byId('2'));
      put('fh-away', byId('3'));
    } else if (id === '68' && line) {
      const tag = line.replace('.', '');
      put(`fh-over-${tag}`, byId('12'));
      put(`fh-under-${tag}`, byId('13'));
    }
  }
  return odds;
}

function incidentMinute(row: Record<string, unknown>): number | null {
  if (typeof row.minute === 'number' && Number.isFinite(row.minute)) return row.minute;
  for (const key of ['minute', 'time', 'matchTime', 'played']) {
    const raw = row[key];
    if (raw == null) continue;
    const text = String(raw).trim();
    const digits = text.match(/^\d+/);
    if (!digits) continue;
    const minute = Number(digits[0]);
    if (Number.isFinite(minute)) return minute;
  }
  return null;
}

function readIncidents(value: unknown, awayName: string): FeedIncident[] {
  if (!Array.isArray(value)) return [];
  const out: FeedIncident[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    let type = String(row.type || row.incidentType || '').toLowerCase();
    if (type.includes('goal')) type = 'goal';
    if (type !== 'goal' && type !== 'yellow' && type !== 'red' && type !== 'var') continue;
    const minute = incidentMinute(row);
    if (minute == null) continue;
    const label = String(row.side || row.team || row.homeOrAway || '').toLowerCase();
    const side: 'home' | 'away' =
      label.startsWith('away') || label === '2' || (awayName && label.includes(awayName.toLowerCase()))
        ? 'away'
        : 'home';
    const player = String(row.player || row.playerName || row.scorer || '').trim() || null;
    out.push({ type, minute, side, player });
  }
  return out;
}

function timeline(match: Match, incidents: FeedIncident[] = []): MatchEvent[] {
  if (match.status === 'scheduled' || match.status === 'postponed') return match.events;
  const events = match.events.filter((event) => event.type === 'yellow' || event.type === 'red' || event.type === 'var');
  for (const incident of incidents) {
    if (incident.type === 'goal') continue;
    events.push({
      id: `${match.id}:${incident.type}:${incident.side}:${incident.minute}`,
      type: incident.type,
      minute: incident.minute,
      teamId: incident.side === 'home' ? match.home.id : match.away.id,
      player: incident.player,
      detail: null,
      homeScore: null,
      awayScore: null,
    });
  }
  events.push({
    id: `${match.id}:kickoff`,
    type: 'kickoff',
    minute: 0,
    teamId: null,
    player: null,
    detail: null,
    homeScore: 0,
    awayScore: 0,
  });
  const pushGoals = (side: 'home' | 'away', count: number) => {
    const scored = incidents.filter((incident) => incident.type === 'goal' && incident.side === side);
    for (let index = 1; index <= count; index += 1) {
      const incident = scored[index - 1];
      events.push({
        id: `${match.id}:goal:${side}:${index}`,
        type: 'goal',
        minute: incident?.minute ?? null,
        teamId: side === 'home' ? match.home.id : match.away.id,
        player: incident?.player ?? null,
        detail: null,
        homeScore: match.homeScore,
        awayScore: match.awayScore,
      });
    }
  };
  if ((match.homeScore ?? 0) + (match.awayScore ?? 0) > 0) {
    pushGoals('home', match.homeScore ?? 0);
    pushGoals('away', match.awayScore ?? 0);
  }
  const pastHalf =
    match.htHome != null &&
    match.htAway != null &&
    (match.status === 'halftime' || match.status === 'finished' || (match.minute ?? 0) >= 45);
  if (pastHalf) {
    events.push({
      id: `${match.id}:ht`,
      type: 'ht',
      minute: 45,
      teamId: null,
      player: null,
      detail: null,
      homeScore: match.htHome,
      awayScore: match.htAway,
    });
  }
  if (match.status === 'finished') {
    events.push({
      id: `${match.id}:ft`,
      type: 'ft',
      minute: match.minute ?? 90,
      teamId: null,
      player: null,
      detail: null,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
    });
  }
  return events;
}

function reviewFrom(event: LiveEvent): Match['varReview'] {
  const raw = event.varReview;
  if (!raw || typeof raw !== 'object') return null;
  const teamId = String(raw.teamId || '').trim();
  if (!teamId) return null;
  const minute = Number(raw.minute);
  return {
    teamId,
    player: String(raw.player || 'Goal').trim() || 'Goal',
    minute: Number.isFinite(minute) ? minute : 0,
  };
}

export function parseLiveEvent(event: LiveEvent, tournament?: LiveTournament): Match | null {
  if (!event.eventId || !event.homeTeamName || !event.awayTeamName) return null;
  const status = liveStatus(event.matchStatus, event.status);
  if (status === 'scheduled') return null;
  const score = pair(event.setScore);
  const half = pair(event.gameScore?.[0]);
  const second = String(event.period || event.matchStatus || '').toUpperCase();
  const inSecond = second === '2' || second === 'H2' || second === '2H' || status === 'halftime' || status === 'finished';
  const sporty: SportyEvent = {
    eventId: String(event.eventId),
    home: event.homeTeamName,
    away: event.awayTeamName,
    kickoff: new Date(event.estimateStartTime || Date.now()).toISOString(),
    tournament: event.sport?.category?.tournament?.name || tournament?.name || 'Fixture',
    country: event.sport?.category?.name || tournament?.categoryName || 'International',
    odds: oddsFromMarkets(event.markets),
  };
  const match = mapSportyEvent(sporty);
  const minute = liveMinute(event.playedSeconds, event.matchStatus);
  const next: Match = {
    ...match,
    status,
    minute,
    homeScore: score ? score[0] : null,
    awayScore: score ? score[1] : null,
    htHome: inSecond && half ? half[0] : null,
    htAway: inSecond && half ? half[1] : null,
    venue: event.fixtureVenue?.name || null,
    events: [],
    varReview: reviewFrom(event),
  };
  const incidents = [
    ...readIncidents(event.timeline, event.awayTeamName || ''),
    ...readIncidents(event.incidents, event.awayTeamName || ''),
    ...readIncidents(event.comments, event.awayTeamName || ''),
  ];
  next.events = timeline(next, incidents);
  return next;
}

export function parseLivePayload(payload: { data?: LiveTournament[] | null } | null | undefined): Match[] {
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  const matches: Match[] = [];
  for (const tournament of rows) {
    for (const event of tournament.events || []) {
      const match = parseLiveEvent(event, tournament);
      if (!match) continue;
      if (/simulated|virtual|srl/i.test(`${match.competition.name} ${match.home.name} ${match.away.name}`)) continue;
      matches.push(match);
    }
  }
  return matches;
}

export function promoteIfStarted(match: Match, now: number): Match {
  if (match.status !== 'scheduled') return match;
  const kick = Date.parse(match.utcDate);
  if (!Number.isFinite(kick) || now < kick || now - kick > LIVE_WINDOW_MS) return match;
  const next = { ...match, status: 'live' as const, minute: null };
  next.events = timeline(next);
  return next;
}

function preserve(incoming: Match, previous?: Match): Match {
  if (!previous) return incoming;
  return {
    ...incoming,
    odds: incoming.odds && Object.keys(incoming.odds).length ? incoming.odds : previous.odds,
    home: { ...incoming.home, crest: incoming.home.crest || previous.home.crest },
    away: { ...incoming.away, crest: incoming.away.crest || previous.away.crest },
  };
}

function overlay(base: Match, live: Match): Match {
  const next: Match = {
    ...base,
    status: live.status,
    minute: live.minute,
    homeScore: live.homeScore,
    awayScore: live.awayScore,
    htHome: live.htHome,
    htAway: live.htAway,
    venue: base.venue || live.venue,
    odds: base.odds && Object.keys(base.odds).length ? base.odds : live.odds,
    home: { ...base.home, crest: base.home.crest || live.home.crest },
    away: { ...base.away, crest: base.away.crest || live.away.crest },
    events: [],
  };
  next.events = timeline(next);
  return next;
}

export function mergeBoard(previous: Match[], upcoming: Match[], live: Match[], now: number): Match[] {
  const prevById = new Map(previous.map((match) => [match.id, match]));
  const liveById = new Map(live.map((match) => [match.id, match]));
  const seen = new Set<string>();
  const out: Match[] = [];
  const push = (match: Match) => {
    if (seen.has(match.id)) return;
    seen.add(match.id);
    out.push(match);
  };

  for (const match of upcoming) {
    const base = preserve(match, prevById.get(match.id));
    const update = liveById.get(match.id);
    push(update ? overlay(base, update) : promoteIfStarted(base, now));
  }

  for (const match of live) {
    if (seen.has(match.id)) continue;
    if (match.status !== 'live' && match.status !== 'halftime' && match.status !== 'finished') continue;
    push(preserve(match, prevById.get(match.id)));
  }

  for (const match of previous) {
    if (seen.has(match.id) || match.feed !== 'sporty') continue;
    const kick = Date.parse(match.utcDate);
    if (!Number.isFinite(kick) || kick > now || match.status === 'postponed') continue;
    if (match.status === 'finished') {
      push(match);
      continue;
    }
    if (match.status === 'live' || match.status === 'halftime') {
      const missing = live.length > 0 && !liveById.has(match.id) && now - kick > LIVE_WINDOW_MS;
      push(missing ? { ...match, status: 'finished', events: timeline({ ...match, status: 'finished' }) } : match);
      continue;
    }
    if (now - kick <= LIVE_WINDOW_MS) push(promoteIfStarted(match, now));
  }

  return out.sort((a, b) => a.utcDate.localeCompare(b.utcDate) || a.id.localeCompare(b.id));
}
