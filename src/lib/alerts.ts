import type { PickView } from '../data/board';
import { signalsFor } from './signals';
import type { Follows, InboxItem, Match, Settings } from '../types';

function isFollowed(match: Match, follows: Follows): boolean {
  return (
    follows.matches.includes(match.id) ||
    follows.teams.some((team) => team.id === match.home.id || team.id === match.away.id)
  );
}

/**
 * Alerts for a followed team or match.
 * A kick-off is recorded once the listed start has passed, even if the app was closed.
 * Goals, half-time and full-time are recorded when a score or the break is known.
 * Ids are stable, so opening the app later does not duplicate a stored alert.
 */
export function followedNotices(
  matches: Match[],
  follows: Follows,
  settings: Settings,
  seen: Set<string>,
  now: number,
): InboxItem[] {
  const notes: InboxItem[] = [];
  for (const match of matches) {
    if (!isFollowed(match, follows) || match.status === 'postponed') continue;
    const kick = Date.parse(match.utcDate);
    const started =
      match.status === 'live' ||
      match.status === 'halftime' ||
      match.status === 'finished' ||
      (Number.isFinite(kick) && now >= kick);
    if (!started) continue;
    const view = match.status === 'scheduled' ? { ...match, status: 'live' as const } : match;
    for (const signal of signalsFor(view, 0)) {
      if (seen.has(signal.key) || !settings[signal.kind]) continue;
      notes.push({
        id: signal.key,
        matchId: signal.matchId,
        kind: signal.kind,
        title: signal.title,
        body: signal.body,
        createdAt: now,
        read: false,
      });
    }
  }
  return notes.reverse();
}

/** A followed trend that has already landed. Checked again on the next open, and not repeated. */
export function trendHitNotices(picks: PickView[], followedIds: string[], seen: Set<string>, now: number): InboxItem[] {
  const want = new Set(followedIds);
  const notes: InboxItem[] = [];
  for (const pick of picks) {
    if (!want.has(pick.id) || pick.status !== 'won') continue;
    const id = `trend:${pick.id}:hit`;
    if (seen.has(id)) continue;
    notes.push({
      id,
      matchId: pick.matchId,
      kind: 'win',
      title: `Trend hit · ${pick.marketLabel}`,
      body: pick.label,
      createdAt: now,
      read: false,
    });
  }
  return notes;
}
