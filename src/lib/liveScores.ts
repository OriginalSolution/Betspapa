import { crestKey, expandTeamName } from './crests';
import type { Follows, InboxItem, Match, Settings } from '../types';

/** TheSportsDB publishes 123 as the free API key for building apps. Livescore is premium; the day schedule includes status and score. */
const SCORE_URL = 'https://www.thesportsdb.com/api/v1/json/123/eventsday.php';

export type LiveUpdate = {
  home: string;
  away: string;
  status: Match['status'];
  minute: number | null;
  homeScore: number | null;
  awayScore: number | null;
};

const STOP = new Set(['fc', 'cf', 'sc', 'ac', 'cd', 'sd', 'afc', 'club', 'de', 'the', 'fk', 'bk', 'sk', 'if', 'ff', 'ec']);

export function teamTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((token) => token && token !== 'w' && !STOP.has(token));
}

function womenSide(name: string): boolean {
  return /\bwomen\b|\bladies\b|\bwfc\b|(^|\s)w$/.test(name.toLowerCase());
}

export function sameSide(a: string, b: string): boolean {
  const leftName = expandTeamName(a);
  const rightName = expandTeamName(b);
  if (womenSide(a) !== womenSide(b)) return false;
  const left = teamTokens(leftName);
  const right = teamTokens(rightName);
  if (!left.length || !right.length) return false;
  const short = left.length <= right.length ? left : right;
  const long = short === left ? right : left;
  return short.every((token) =>
    long.some((other) => token === other || (token.length >= 4 && (other.startsWith(token) || token.startsWith(other)))),
  );
}

export function parseScoreStatus(value: string | null | undefined): Match['status'] {
  const status = String(value || '').trim().toUpperCase();
  if (['HT', 'PAUSED'].includes(status)) return 'halftime';
  if (['FT', 'AET', 'PEN', 'AWD', 'WO', 'FINISHED'].includes(status)) return 'finished';
  if (['PST', 'CANC', 'ABD', 'POSTPONED', 'CANCELLED'].includes(status)) return 'postponed';
  if (['1H', '2H', 'LIVE', 'INT', 'ET', 'BT', 'P', 'IN PLAY', 'INPLAY'].includes(status)) return 'live';
  return 'scheduled';
}

function numberOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseLiveEvents(payload: { events?: Array<Record<string, string | null>> | null }): LiveUpdate[] {
  return (payload.events || [])
    .filter((event) => event?.strHomeTeam && event?.strAwayTeam)
    .map((event) => {
      const status = parseScoreStatus(event.strStatus);
      const minute = numberOrNull(event.strProgress);
      const homeScore = numberOrNull(event.intHomeScore);
      const awayScore = numberOrNull(event.intAwayScore);
      return {
        home: String(event.strHomeTeam),
        away: String(event.strAwayTeam),
        status,
        minute,
        homeScore: status === 'scheduled' ? homeScore : (homeScore ?? 0),
        awayScore: status === 'scheduled' ? awayScore : (awayScore ?? 0),
      };
    });
}

export function applyLiveUpdates(matches: Match[], updates: LiveUpdate[]): Match[] {
  if (!updates.length) return matches;
  return matches.map((match) => {
    const update = updates.find((item) => sameSide(match.home.name, item.home) && sameSide(match.away.name, item.away));
    if (!update || update.status === 'scheduled') return match;
    return {
      ...match,
      status: update.status,
      minute: update.minute ?? match.minute,
      homeScore: update.homeScore,
      awayScore: update.awayScore,
    };
  });
}

export function applyCrests(matches: Match[], crests: Record<string, string>): Match[] {
  if (!Object.keys(crests).length) return matches;
  const paint = (team: Match['home']) => {
    const url = crests[crestKey(team.name)];
    if (!url || team.crest === url) return team;
    return { ...team, crest: url };
  };
  return matches.map((match) => {
    const home = paint(match.home);
    const away = paint(match.away);
    if (home === match.home && away === match.away) return match;
    return { ...match, home, away };
  });
}

const KICKOFF_WINDOW_MS = 20 * 60 * 1000;

export function kickoffNotices(
  matches: Match[],
  follows: Follows,
  settings: Settings,
  generation: number,
  seen: Set<string>,
  now: number,
): InboxItem[] {
  if (!settings.kickoff) return [];
  const notes: InboxItem[] = [];
  for (const match of matches) {
    if (match.status === 'finished' || match.status === 'postponed') continue;
    const kick = new Date(match.utcDate).getTime();
    if (!Number.isFinite(kick) || now < kick || now > kick + KICKOFF_WINDOW_MS) continue;
    const followed =
      follows.matches.includes(match.id) || follows.teams.some((team) => team.id === match.home.id || team.id === match.away.id);
    if (!followed) continue;
    const id = `${generation}:${match.id}:kickoff`;
    if (seen.has(id)) continue;
    notes.push({
      id,
      matchId: match.id,
      kind: 'kickoff',
      title: 'Kick-off',
      body: `${match.home.shortName} vs ${match.away.shortName} is underway`,
      createdAt: now,
      read: false,
    });
  }
  return notes;
}

export function followedInWindow(matches: Match[], follows: Follows, now: number): boolean {
  return matches.some((match) => {
    const followed =
      follows.matches.includes(match.id) || follows.teams.some((team) => team.id === match.home.id || team.id === match.away.id);
    if (!followed || match.status === 'finished') return false;
    const kick = new Date(match.utcDate).getTime();
    return Number.isFinite(kick) && now >= kick - 10 * 60 * 1000 && now <= kick + 130 * 60 * 1000;
  });
}

export async function fetchDayScores(date: string, fetchImpl: typeof fetch = fetch): Promise<LiveUpdate[]> {
  const response = await fetchImpl(`${SCORE_URL}?d=${encodeURIComponent(date)}&s=Soccer`);
  if (!response.ok) throw new Error(`Score feed returned ${response.status}`);
  const body = (await response.json()) as { events?: Array<Record<string, string | null>> | null };
  return parseLiveEvents(body);
}
