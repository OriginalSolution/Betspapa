import type { Match, MatchEvent, MatchStatus } from '../types';
import { atLocal, dayOffset } from '../lib/dates';
import {
  competitions,
  DEMO_HT_PAUSE_MS,
  DEMO_MINUTE_MS,
  fixtures,
  teams,
  type FixtureScript,
  type ScriptEvent,
} from './catalog';

const teamById = new Map(teams.map((team) => [team.id, team]));
const competitionById = new Map(competitions.map((competition) => [competition.id, competition]));

type Clock = { status: MatchStatus; minute: number | null };

function requireTeam(id: string) {
  const team = teamById.get(id);
  if (!team) throw new Error(`Unknown team ${id}`);
  return team;
}

function requireCompetition(id: string) {
  const competition = competitionById.get(id);
  if (!competition) throw new Error(`Unknown competition ${id}`);
  return competition;
}

function progress(wall: number, htMinute: number, ftMinute: number, htPause: number): Clock {
  const htWall = htMinute * DEMO_MINUTE_MS;
  if (wall < htWall) return { status: 'live', minute: Math.floor(wall / DEMO_MINUTE_MS) };
  if (wall < htWall + htPause) return { status: 'halftime', minute: htMinute };
  const minute = htMinute + Math.floor((wall - htWall - htPause) / DEMO_MINUTE_MS);
  if (minute >= ftMinute) return { status: 'finished', minute: ftMinute };
  return { status: 'live', minute };
}

export function clockFor(script: FixtureScript, elapsedMs: number): Clock {
  const htMinute = 45;
  const ftMinute = script.events.find((event) => event.type === 'ft')?.minute ?? 90;
  if (script.minuteAtStart == null) {
    const kick = script.kickoffInMs ?? 0;
    if (elapsedMs < kick) return { status: 'scheduled', minute: null };
    return progress(elapsedMs - kick, htMinute, ftMinute, DEMO_HT_PAUSE_MS);
  }
  if (script.minuteAtStart > htMinute) {
    const minute = script.minuteAtStart + Math.floor(elapsedMs / DEMO_MINUTE_MS);
    if (minute >= ftMinute) return { status: 'finished', minute: ftMinute };
    return { status: 'live', minute };
  }
  const wall = elapsedMs + script.minuteAtStart * DEMO_MINUTE_MS;
  return progress(wall, htMinute, ftMinute, DEMO_HT_PAUSE_MS);
}

function eventVisible(event: ScriptEvent, clock: Clock): boolean {
  if (clock.status === 'scheduled' || clock.status === 'postponed' || clock.minute == null) return false;
  if (event.type === 'ft') return clock.status === 'finished';
  if (event.type === 'ht') {
    return clock.status === 'halftime' || clock.status === 'finished' || (clock.status === 'live' && clock.minute >= 45);
  }
  if (clock.status === 'finished' || clock.status === 'halftime') return event.minute <= 45 || clock.status === 'finished';
  return event.minute <= clock.minute;
}

function kickoffIso(script: FixtureScript, t0: number, todayDate: string): string {
  if (script.kind === 'sim') {
    if (script.minuteAtStart != null) {
      const pause = script.minuteAtStart >= 45 ? 15 * 60_000 : 0;
      return new Date(t0 - script.minuteAtStart * 60_000 - pause).toISOString();
    }
    return new Date(t0 + (script.kickoffInMs ?? 0)).toISOString();
  }
  if (script.day === 0) return new Date(t0 + (script.offsetMs ?? 0)).toISOString();
  return atLocal(todayDate, script.day, script.hour ?? 20, script.minute ?? 0);
}

function materialize(script: FixtureScript, clock: Clock, utcDate: string): Match {
  const home = requireTeam(script.homeId);
  const away = requireTeam(script.awayId);
  let homeScore = 0;
  let awayScore = 0;
  let htHome: number | null = null;
  let htAway: number | null = null;
  const events: MatchEvent[] = [];

  if (clock.status !== 'scheduled' && clock.status !== 'postponed') {
    events.push({
      id: `${script.id}:kickoff`,
      type: 'kickoff',
      minute: 0,
      teamId: null,
      player: null,
      detail: null,
      homeScore: 0,
      awayScore: 0,
    });
  }

  script.events.forEach((event, index) => {
    if (!eventVisible(event, clock)) return;
    if (event.type === 'goal') {
      if (event.side === 'home') homeScore += 1;
      else awayScore += 1;
    }
    if (event.type === 'ht') {
      htHome = homeScore;
      htAway = awayScore;
    }
    const scored = event.type === 'goal' || event.type === 'ht' || event.type === 'ft';
    events.push({
      id: `${script.id}:${event.type}:${event.minute}:${event.side ?? 'x'}:${event.player ?? index}`,
      type: event.type,
      minute: event.minute,
      teamId: event.side === 'home' ? home.id : event.side === 'away' ? away.id : null,
      player: event.player ?? null,
      detail: event.detail ?? null,
      homeScore: scored ? homeScore : null,
      awayScore: scored ? awayScore : null,
    });
  });

  let varReview: Match['varReview'] = null;
  if (clock.status !== 'finished') {
    for (const event of script.events) {
      if (!eventVisible(event, clock) || !event.player || !event.side) continue;
      if (event.type === 'var') {
        varReview = {
          teamId: event.side === 'home' ? home.id : away.id,
          player: event.player,
          minute: event.minute,
        };
      }
      if (event.type === 'goal' && varReview?.player === event.player) varReview = null;
    }
  }

  const started = clock.status !== 'scheduled' && clock.status !== 'postponed';
  return {
    id: script.id,
    competition: requireCompetition(script.competitionId),
    utcDate,
    status: clock.status,
    minute: clock.minute,
    injuryTime: null,
    home,
    away,
    homeScore: started ? homeScore : null,
    awayScore: started ? awayScore : null,
    htHome,
    htAway,
    events,
    venue: script.venue,
    varReview,
  };
}

export function projectDemo(input: { t0: number; now: number; selectedDate: string; todayDate: string }): Match[] {
  const offset = dayOffset(input.todayDate, input.selectedDate);
  if (offset == null || offset < -1 || offset > 1) return [];
  const elapsed = input.now - input.t0;
  return fixtures
    .filter((script) => script.day === offset)
    .map((script) => {
      const utcDate = kickoffIso(script, input.t0, input.todayDate);
      if (script.kind === 'final') {
        const minute = script.events.find((event) => event.type === 'ft')?.minute ?? 90;
        return materialize(script, { status: 'finished', minute }, utcDate);
      }
      if (script.kind === 'upcoming') return materialize(script, { status: 'scheduled', minute: null }, utcDate);
      return materialize(script, clockFor(script, elapsed), utcDate);
    });
}

export function findDemoMatch(id: string, t0: number, now: number, todayDate: string): Match | null {
  for (const delta of [-1, 0, 1]) {
    const selected = shift(todayDate, delta);
    const found = projectDemo({ t0, now, selectedDate: selected, todayDate }).find((match) => match.id === id);
    if (found) return found;
  }
  return null;
}

function shift(today: string, delta: number): string {
  const [y, m, d] = today.split('-').map(Number);
  const date = new Date(y, m - 1, d + delta);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}
