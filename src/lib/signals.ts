import type { Match, MatchEvent, Settings } from '../types';
import {
  fullTimeCopy,
  goalCopy,
  halfTimeCopy,
  incidentCopy,
  kickoffCopy,
  teamName,
  varReviewCopy,
} from './noteCopy.mjs';

type ScoreKind = 'kickoff' | 'goal' | 'red' | 'penalty' | 'ht' | 'ft' | 'var';

export type AlertSignal = {
  key: string;
  matchId: string;
  kind: ScoreKind;
  title: string;
  body: string;
};

export type DiffContext = {
  generation: number;
  followedMatchIds: Set<string>;
  followedTeamIds: Set<string>;
  settings: Settings;
};

/** The club's full name ("Hearts of Oak", not "Hearts" or "HOO"); the short name only when that is all there is. */
function fullName(team: Match['home'] | null | undefined): string {
  return teamName(team?.name, teamName(team?.shortName));
}

function copyMatch(match: Match, homeScore = match.homeScore, awayScore = match.awayScore) {
  return {
    home: fullName(match.home),
    away: fullName(match.away),
    homeScore,
    awayScore,
    minute: match.minute,
    competition: match.competition?.name || '',
  };
}

function sideOf(match: Match, teamId: string | null | undefined): 'home' | 'away' | '' {
  if (teamId && teamId === match.home.id) return 'home';
  if (teamId && teamId === match.away.id) return 'away';
  return '';
}

function scorerOf(event: MatchEvent | undefined): string {
  if (!event?.player) return '';
  if (event.detail === 'Own goal') return `${event.player} (own goal)`;
  if (event.detail === 'Penalty') return `${event.player} (pen)`;
  return event.player;
}

export function signalsFor(match: Match, _generation: number): AlertSignal[] {
  if (match.status === 'scheduled' || match.status === 'postponed') return [];
  const out: AlertSignal[] = [];
  const base = copyMatch(match);

  out.push({ key: `${match.id}:kickoff`, matchId: match.id, kind: 'kickoff', ...kickoffCopy(base) });

  if (match.varReview) {
    const side = sideOf(match, match.varReview.teamId) || 'away';
    out.push({
      key: `${match.id}:var:${match.varReview.minute}:${match.varReview.player}`,
      matchId: match.id,
      kind: 'var',
      ...varReviewCopy(base, side, { player: match.varReview.player, minute: match.varReview.minute }),
    });
  }

  const homeGoals = match.events.filter((event) => event.type === 'goal' && event.teamId === match.home.id);
  const awayGoals = match.events.filter((event) => event.type === 'goal' && event.teamId === match.away.id);
  const pushGoals = (side: 'home' | 'away', count: number, events: MatchEvent[]) => {
    for (let index = 1; index <= count; index += 1) {
      const event = events[index - 1];
      const at = copyMatch(match, event?.homeScore ?? match.homeScore, event?.awayScore ?? match.awayScore);
      out.push({
        key: `${match.id}:goal:${side}:${index}`,
        matchId: match.id,
        kind: 'goal',
        ...goalCopy(at, side, { player: scorerOf(event), minute: event ? event.minute : match.minute }),
      });
    }
  };
  pushGoals('home', match.homeScore ?? 0, homeGoals);
  pushGoals('away', match.awayScore ?? 0, awayGoals);

  for (const event of match.events) {
    const awarded = event.type === 'penalty' || (event.type === 'goal' && /penalty/i.test(event.detail || ''));
    if (!awarded) continue;
    out.push({
      key: `${match.id}:penalty:${event.id}`,
      matchId: match.id,
      kind: 'penalty',
      ...incidentCopy(base, 'penalty', sideOf(match, event.teamId), { player: event.player, minute: event.minute }),
    });
  }

  for (const event of match.events) {
    if (event.type !== 'red') continue;
    out.push({
      key: `${match.id}:red:${event.id}`,
      matchId: match.id,
      kind: 'red',
      ...incidentCopy(base, 'red', sideOf(match, event.teamId), { player: event.player, minute: event.minute }),
    });
  }

  const pastHalf =
    match.status === 'halftime' ||
    match.status === 'finished' ||
    (match.status === 'live' && (match.minute ?? 0) >= 45);
  if (pastHalf) {
    const known = match.htHome != null && match.htAway != null;
    out.push({
      key: `${match.id}:ht`,
      matchId: match.id,
      kind: 'ht',
      ...halfTimeCopy(base, known ? match.htHome : match.homeScore, known ? match.htAway : match.awayScore),
    });
  }

  if (match.status === 'finished') {
    out.push({ key: `${match.id}:ft`, matchId: match.id, kind: 'ft', ...fullTimeCopy(base) });
  }

  return out;
}

export function diffAlerts(prev: Match[] | null, next: Match[], ctx: DiffContext): AlertSignal[] {
  if (!prev) return [];
  const seen = new Set<string>();
  for (const match of prev) {
    for (const signal of signalsFor(match, ctx.generation)) seen.add(signal.key);
  }
  const alerts: AlertSignal[] = [];
  for (const match of next) {
    const followed =
      ctx.followedMatchIds.has(match.id) ||
      ctx.followedTeamIds.has(match.home.id) ||
      ctx.followedTeamIds.has(match.away.id);
    if (!followed) continue;
    for (const signal of signalsFor(match, ctx.generation)) {
      if (seen.has(signal.key) || !ctx.settings[signal.kind]) continue;
      alerts.push(signal);
    }
  }
  return alerts;
}
