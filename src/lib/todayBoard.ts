import type { Follows, Match, MatchStatus } from '../types';
import { addDays } from './dates';
import { groupMatches, isFollowed, sortMatches } from './group';
import { isRealMatch } from './liveBoard';

/** Simulated, SRL, virtual, and dummy-id fixtures never reach the Today cards. */
export function isShownFixture(match: Match): boolean {
  return isRealMatch(match);
}

/** Scrollable dates around today. The selected day stays on the strip. */
export function weekDays(today: string, selected: string, back = 7, forward = 14): string[] {
  let start = addDays(today, -back);
  let end = addDays(today, forward);
  if (selected < start) start = selected;
  if (selected > end) end = selected;
  const days: string[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) days.push(day);
  return days;
}

export function partitionFollowed(matches: Match[], follows: Follows): { followed: Match[]; rest: Match[] } {
  const followed: Match[] = [];
  const rest: Match[] = [];
  for (const match of sortMatches(matches.filter(isShownFixture))) {
    if (isFollowed(match, follows)) followed.push(match);
    else rest.push(match);
  }
  return { followed, rest };
}

/** League order keeps live competitions first, then each competition's kick-off order. */
export function byLeague(matches: Match[]): Match[] {
  return groupMatches(matches).flatMap((group) => group.matches);
}

/** 0–1 arc for an in-play minute. Half-time sits at the break. Extra time fills the ring. */
export function minuteProgress(status: MatchStatus, minute: number | null): number | null {
  if (status !== 'live' && status !== 'halftime') return null;
  if (status === 'halftime') return 0.5;
  if (minute == null || !Number.isFinite(minute)) return 0;
  return Math.min(1, Math.max(0, minute / 90));
}

export function matchCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'match' : 'matches'}`;
}
