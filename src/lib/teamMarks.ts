import type { ListItem, PickView } from '../data/board';
import type { BookLeg } from './bookFollow';
import type { EngineLeg, EngineState } from './engineSlips';
import { publishableOdds } from './oddsFloor';

export type TeamRef = { id: string; name: string; crest?: string | null };

/** The same spelling of a club, ignoring case and punctuation. */
export function teamKey(name: string | null | undefined): string {
  return String(name || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
}

export function sameTeam(item: { id: string; name: string }, team: { id?: string | null; name?: string | null }): boolean {
  if (team.id && item.id && team.id === item.id) return true;
  const left = teamKey(item.name);
  const right = teamKey(team.name);
  return Boolean(left) && left === right;
}

export function teamsOn(lists: ListItem[], list: 'black' | 'green'): ListItem[] {
  return lists.filter((item) => item.list === list && item.scope === 'team').sort((a, b) => a.name.localeCompare(b.name));
}

export function teamOnList(lists: ListItem[], list: 'black' | 'green', team: { id?: string | null; name?: string | null }): boolean {
  return teamsOn(lists, list).some((item) => sameTeam(item, team));
}

export function codeLegHidden(
  lists: ListItem[],
  leg: { home?: string | null; away?: string | null; homeId?: string | null; awayId?: string | null; match?: string | null; league?: string | null; tournamentId?: string | null; market?: string | null },
): boolean {
  if (legBlocked(lists, leg)) return true;
  if (leg.market && lists.some((item) => item.list === 'black' && item.scope === 'market' && item.id === leg.market)) return true;
  return lists.some((item) => item.list === 'black' && item.scope === 'competition' && (
    (leg.tournamentId && item.id === leg.tournamentId) || (leg.league && teamKey(item.name) === teamKey(leg.league))
  ));
}

export function legBlocked(lists: ListItem[], leg: { home?: string | null; away?: string | null; homeId?: string | null; awayId?: string | null; match?: string | null }): boolean {
  let home = leg.home || '';
  let away = leg.away || '';
  if ((!home || !away) && leg.match) {
    const parts = leg.match.split(/\s+vs\s+/i);
    if (!home) home = parts[0] || '';
    if (!away) away = parts[1] || '';
  }
  return teamOnList(lists, 'black', { id: leg.homeId, name: home }) || teamOnList(lists, 'black', { id: leg.awayId, name: away });
}

/** A pick is out when the backed side or the opponent is blacklisted. */
export function pickBlocked(lists: ListItem[], pick: Pick<PickView, 'teamId' | 'teamName' | 'opponentName'> & { opponentId?: string | null }): boolean {
  return teamOnList(lists, 'black', { id: pick.teamId, name: pick.teamName }) || teamOnList(lists, 'black', { id: pick.opponentId, name: pick.opponentName });
}

/**
 * Legs for one personal code. Blacklisted teams are left out.
 * A greenlit team is added only when the engine already published it and the price clears 1.18.
 * The share route still applies the market odds band. Shared master codes are not touched.
 */
export function personalLegs(state: EngineState | null, lists: ListItem[]): BookLeg[] {
  const slips = [state?.master, ...(state?.trends || []), ...(state?.tiers || [])].filter((slip): slip is NonNullable<typeof slip> => Boolean(slip));
  const seen = new Set<string>();
  const out: BookLeg[] = [];
  for (const slip of slips) {
    for (const leg of slip.legs || []) {
      if (!eligiblePublished(leg, lists)) continue;
      const key = `${leg.eventId}|${leg.market}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ eventId: leg.eventId, market: leg.market, odds: leg.odds, kickoff: leg.kickoff, match: leg.match });
    }
  }
  return out;
}

function eligiblePublished(leg: EngineLeg, lists: ListItem[]): boolean {
  if (legBlocked(lists, leg)) return false;
  if (!publishableOdds(leg.odds)) return false;
  return true;
}
