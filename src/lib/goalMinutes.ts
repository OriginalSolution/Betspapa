import type { Match, MatchEvent } from '../types';

/** A goal minute. Estimated minutes are the match minute when the score change was first seen. */
export type GoalStamp = {
  minute: number;
  player: string | null;
  estimated: boolean;
};

export type GoalBook = Record<string, GoalStamp>;

export type GoalMarker = {
  type: 'goal';
  minute: number;
  abbr: string;
  side: 'home' | 'away';
  index: number;
  player: string;
  estimated: boolean;
};

const KEY = 'betspapa.goalMinutes.v1';

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadGoalBook(): GoalBook {
  try {
    const raw = storage()?.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as GoalBook;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveGoalBook(book: GoalBook) {
  try {
    storage()?.setItem(KEY, JSON.stringify(book));
  } catch {
    /* a full disk should not drop the score */
  }
}

function key(matchId: string, side: 'home' | 'away', index: number) {
  return `${matchId}:${side}:${index}`;
}

function remember(book: GoalBook, id: string, stamp: GoalStamp): GoalBook {
  const prior = book[id];
  if (!prior) return { ...book, [id]: stamp };
  if (!stamp.estimated && prior.estimated) return { ...book, [id]: stamp };
  if (stamp.player && !prior.player) return { ...book, [id]: { ...prior, player: stamp.player } };
  return book;
}

/**
 * Keep a minute for every goal on the board.
 * A feed minute replaces an estimate. A later poll does not move an estimate to "now".
 */
export function applyGoalMinutes(previous: Match | undefined, next: Match, book: GoalBook): GoalBook {
  let out = book;
  let home = 0;
  let away = 0;
  for (const event of next.events) {
    if (event.type !== 'goal' || event.minute == null) continue;
    const side: 'home' | 'away' = event.teamId === next.away.id ? 'away' : 'home';
    const index = side === 'home' ? ++home : ++away;
    const id = key(next.id, side, index);
    const prior = out[id];
    const fromFeed = !prior || (prior.estimated && prior.minute !== event.minute);
    if (!fromFeed) {
      if (event.player && !prior?.player) out = { ...out, [id]: { ...prior, player: event.player } };
      continue;
    }
    out = remember(out, id, { minute: event.minute, player: event.player, estimated: false });
  }
  if (next.minute == null || next.status === 'scheduled' || next.status === 'postponed') return out;
  const seenHome = previous && previous.id === next.id ? (previous.homeScore ?? 0) : null;
  const seenAway = previous && previous.id === next.id ? (previous.awayScore ?? 0) : null;
  out = fillSide(out, next, 'home', next.homeScore ?? 0, seenHome);
  out = fillSide(out, next, 'away', next.awayScore ?? 0, seenAway);
  return out;
}

function fillSide(book: GoalBook, match: Match, side: 'home' | 'away', score: number, seen: number | null): GoalBook {
  let out = book;
  for (let index = 1; index <= score; index += 1) {
    const id = key(match.id, side, index);
    if (out[id]) continue;
    const observed = seen != null && index > seen;
    const firstSight = seen == null;
    if (!observed && !firstSight) continue;
    out = { ...out, [id]: { minute: match.minute as number, player: null, estimated: true } };
  }
  return out;
}

export function paintGoals(match: Match, book: GoalBook): Match {
  let home = 0;
  let away = 0;
  let changed = false;
  const events = match.events.map((event) => {
    if (event.type !== 'goal') return event;
    const side: 'home' | 'away' = event.teamId === match.away.id ? 'away' : 'home';
    const index = side === 'home' ? ++home : ++away;
    const stamp = book[key(match.id, side, index)];
    if (!stamp) return event;
    const player = event.player || stamp.player;
    if (event.minute === stamp.minute && event.player === player) return event;
    changed = true;
    return { ...event, minute: stamp.minute, player };
  });
  return changed ? { ...match, events } : match;
}

export function decorateMatches(previous: Match[], next: Match[], book: GoalBook = loadGoalBook()): { matches: Match[]; book: GoalBook } {
  const prior = new Map(previous.map((match) => [match.id, match]));
  let current = book;
  const matches = next.map((match) => {
    current = applyGoalMinutes(prior.get(match.id), match, current);
    return paintGoals(match, current);
  });
  return { matches, book: current };
}

export function markersFor(match: Match, book: GoalBook): GoalMarker[] {
  let home = 0;
  let away = 0;
  const marks: GoalMarker[] = [];
  for (const event of match.events) {
    if (event.type !== 'goal' || event.minute == null) continue;
    const side: 'home' | 'away' = event.teamId === match.away.id ? 'away' : 'home';
    const index = side === 'home' ? ++home : ++away;
    const stamp = book[key(match.id, side, index)];
    const team = side === 'home' ? match.home : match.away;
    marks.push({
      type: 'goal',
      minute: event.minute,
      abbr: team.abbr,
      side,
      index,
      player: event.player || stamp?.player || '',
      estimated: stamp ? stamp.estimated : true,
    });
  }
  return marks;
}

export function mergeNativeMarkers(
  book: GoalBook,
  rows: Array<{ id?: string; homeAbbr?: string; awayAbbr?: string; markers?: Array<Record<string, unknown>> }>,
): GoalBook {
  let out = book;
  for (const row of rows) {
    const id = String(row.id || '');
    if (!id || !Array.isArray(row.markers)) continue;
    let home = 0;
    let away = 0;
    for (const marker of row.markers) {
      if (String(marker.type || '') !== 'goal') continue;
      const minute = Number(marker.minute);
      if (!Number.isFinite(minute)) continue;
      const abbr = String(marker.abbr || '');
      let side: 'home' | 'away' = marker.side === 'away' || marker.side === 'home' ? marker.side : abbr && abbr === row.awayAbbr ? 'away' : 'home';
      const given = Number(marker.index);
      const index = Number.isFinite(given) && given > 0 ? given : side === 'home' ? ++home : ++away;
      if (side === 'home') home = Math.max(home, index);
      else away = Math.max(away, index);
      const player = typeof marker.player === 'string' && marker.player ? marker.player : null;
      const estimated = marker.estimated !== false;
      out = remember(out, key(id, side, index), { minute, player, estimated });
    }
  }
  return out;
}

export function goalEventMinute(match: Match | null | undefined, alertId: string): { minute: number | null; player: string | null } {
  const event = match?.events.find((item) => item.id === alertId);
  return { minute: event?.minute ?? match?.minute ?? null, player: event?.player ?? null };
}

export type { MatchEvent };
