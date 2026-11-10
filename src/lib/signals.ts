import type { Match, MatchEvent, Settings } from '../types';

type ScoreKind = 'kickoff' | 'goal' | 'red' | 'ht' | 'ft' | 'var';

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

const dash = '–';

function scoreText(home: number | null, away: number | null): string {
  return `${home ?? 0}${dash}${away ?? 0}`;
}

function goalCopy(event: MatchEvent | undefined, teamName: string): string {
  if (!event?.player) return `${teamName} score`;
  const minute = event.minute != null ? ` ${event.minute}′` : '';
  if (event.detail === 'Own goal') return `Own goal · ${event.player}${minute}`;
  if (event.detail === 'Penalty') return `${event.player}${minute} pen`;
  return `${event.player}${minute}`;
}

export function signalsFor(match: Match, generation: number): AlertSignal[] {
  if (match.status === 'scheduled' || match.status === 'postponed') return [];
  const out: AlertSignal[] = [];
  const versus = `${match.home.shortName} vs ${match.away.shortName}`;
  const current = scoreText(match.homeScore, match.awayScore);

  out.push({
    key: `${generation}:${match.id}:kickoff`,
    matchId: match.id,
    kind: 'kickoff',
    title: 'Kick-off',
    body: `${versus} is underway`,
  });

  if (match.varReview) {
    const team = match.varReview.teamId === match.home.id ? match.home : match.away;
    out.push({
      key: `${generation}:${match.id}:var:${match.varReview.minute}:${match.varReview.player}`,
      matchId: match.id,
      kind: 'var',
      title: 'VAR',
      body: `${match.varReview.player} ${match.varReview.minute}′ · ${team.shortName} goal under review`,
    });
  }

  const homeGoals = match.events.filter((event) => event.type === 'goal' && event.teamId === match.home.id);
  const awayGoals = match.events.filter((event) => event.type === 'goal' && event.teamId === match.away.id);
  const pushGoals = (side: 'home' | 'away', count: number, events: MatchEvent[]) => {
    const team = side === 'home' ? match.home : match.away;
    for (let index = 1; index <= count; index += 1) {
      const event = events[index - 1];
      const home = event?.homeScore ?? match.homeScore;
      const away = event?.awayScore ?? match.awayScore;
      out.push({
        key: `${generation}:${match.id}:goal:${side}:${index}`,
        matchId: match.id,
        kind: 'goal',
        title: `Goal · ${team.shortName}`,
        body: `${goalCopy(event, team.shortName)} · ${match.home.shortName} ${scoreText(home, away)} ${match.away.shortName}`,
      });
    }
  };
  pushGoals('home', match.homeScore ?? 0, homeGoals);
  pushGoals('away', match.awayScore ?? 0, awayGoals);

  for (const event of match.events) {
    if (event.type !== 'red') continue;
    const team = event.teamId === match.home.id ? match.home : event.teamId === match.away.id ? match.away : null;
    const minute = event.minute != null ? `${event.minute}′` : '';
    const player = event.player ? `${event.player}${minute ? ` ${minute}` : ''}` : minute || 'Red card';
    out.push({
      key: `${generation}:${event.id}`,
      matchId: match.id,
      kind: 'red',
      title: `Red card · ${team?.shortName ?? 'Red card'}`,
      body: `${player} · ${versus}`,
    });
  }

  const pastHalf =
    match.status === 'halftime' ||
    match.status === 'finished' ||
    (match.status === 'live' && (match.minute ?? 0) >= 45);
  if (pastHalf) {
    const ht =
      match.htHome != null && match.htAway != null ? scoreText(match.htHome, match.htAway) : current;
    out.push({
      key: `${generation}:${match.id}:ht`,
      matchId: match.id,
      kind: 'ht',
      title: 'Half-time',
      body: `${match.home.shortName} ${ht} ${match.away.shortName}`,
    });
  }

  if (match.status === 'finished') {
    out.push({
      key: `${generation}:${match.id}:ft`,
      matchId: match.id,
      kind: 'ft',
      title: 'Full-time',
      body: `${match.home.shortName} ${current} ${match.away.shortName}`,
    });
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
