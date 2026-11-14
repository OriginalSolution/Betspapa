import type { PickView } from '../data/board';
import { publishableOdds } from './oddsFloor';
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

function startOfLocalDay(now: number): number {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * Old alerts are safe to remove from the list.
 * The seen-id record is kept, so the next poll does not create them again.
 * Today's alerts for a match that is still scheduled, live, or at half-time stay.
 */
export function staleAlertIds(inbox: InboxItem[], matches: Match[], now: number): string[] {
  const byId = new Map(matches.map((match) => [match.id, match]));
  const start = startOfLocalDay(now);
  return inbox.filter((item) => isStaleAlert(item, byId.get(item.matchId), start)).map((item) => item.id);
}

function isStaleAlert(item: InboxItem, match: Match | undefined, start: number): boolean {
  if (item.kind === 'win' || item.kind === 'bust') return true;
  if (item.createdAt < start) return true;
  if (item.kind === 'ft') return true;
  if (!match) return false;
  return match.status === 'finished' || match.status === 'postponed';
}

/**
 * Followed trends that have hit, bust, or belong to a match that is over.
 * A trend that is not on the current board is left alone. It may be for another day.
 * Upcoming and live follows are kept.
 */
/** A follow that has settled, kicked off, or has no teams left to show. A live match stays. */
export function followIsStale(
  id: string,
  picks: PickView[],
  matches: Match[],
  now: number,
  face?: { home?: string; away?: string; kickoff?: string; status?: string | null },
): boolean {
  if (face && !face.home && !face.away) return true;
  if (face?.status === 'won' || face?.status === 'bust') return true;
  const parsed = id.match(/^(sr:match:\d+):/);
  const match = parsed ? matches.find((item) => item.id === parsed[1]) : undefined;
  if (match && (match.status === 'live' || match.status === 'halftime')) return false;
  const kick = Date.parse(face?.kickoff || match?.utcDate || '');
  if (Number.isFinite(kick) && kick < now) return true;
  return staleTrendIds([id], picks, matches, now).includes(id);
}

export function staleTrendIds(followedIds: string[], picks: PickView[], matches: Match[], now: number): string[] {
  const start = startOfLocalDay(now);
  const byPick = new Map(picks.map((pick) => [pick.id, pick]));
  const byMatch = new Map(matches.map((match) => [match.id, match]));
  return followedIds.filter((id) => {
    const pick = byPick.get(id);
    if (!pick) return false;
    if (pick.status === 'won' || pick.status === 'bust') return true;
    const match = byMatch.get(pick.matchId);
    if (!match) return false;
    if (match.status === 'finished' || match.status === 'postponed') return true;
    const kick = Date.parse(match.utcDate);
    return Number.isFinite(kick) && kick < start && match.status !== 'live' && match.status !== 'halftime';
  });
}

/** `trend:sr:match:1:over25:hit` carries the match before the market segment. */
export function matchIdFromTrendAlert(id: string): string {
  if (!id.startsWith('trend:') || !id.endsWith(':hit')) return '';
  const body = id.slice('trend:'.length, -':hit'.length);
  const cut = body.lastIndexOf(':');
  return cut > 0 ? body.slice(0, cut) : '';
}

export function trendIdFromAlert(id: string): string {
  if (!id.startsWith('trend:') || !id.endsWith(':hit')) return '';
  return id.slice('trend:'.length, -':hit'.length);
}

/** Where an Alerts row opens. A trend hit goes to the match that owns it. */
export function alertTarget(item: Pick<InboxItem, 'id' | 'kind' | 'matchId'>): string {
  const matchId = item.matchId || matchIdFromTrendAlert(item.id);
  if (matchId) {
    const trend = trendIdFromAlert(item.id);
    return trend ? `/match/${matchId}?trend=${encodeURIComponent(trend)}` : `/match/${matchId}`;
  }
  if (item.kind === 'win' || item.kind === 'bust') return '/trends';
  return '/';
}

/** A followed trend that has already landed. Checked again on the next open, and not repeated. */
export function trendHitNotices(picks: PickView[], followedIds: string[], seen: Set<string>, now: number): InboxItem[] {
  const want = new Set(followedIds);
  const notes: InboxItem[] = [];
  for (const pick of picks) {
    if (!want.has(pick.id) || pick.status !== 'won' || !publishableOdds(pick.odds)) continue;
    const id = `trend:${pick.id}:hit`;
    if (seen.has(id)) continue;
    const matchId = pick.matchId || matchIdFromTrendAlert(id);
    if (!matchId) continue;
    notes.push({
      id,
      matchId,
      kind: 'win',
      title: `Trend hit · ${pick.marketLabel}`,
      body: pick.label,
      createdAt: now,
      read: false,
    });
  }
  return notes;
}
