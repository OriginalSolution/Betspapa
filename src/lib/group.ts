import type { Follows, Match, MatchStatus } from '../types';

const statusRank: Record<MatchStatus, number> = {
  live: 0,
  halftime: 1,
  scheduled: 2,
  postponed: 3,
  finished: 4,
};

export type BoardFilter = 'all' | 'live' | 'upcoming' | 'finished';

export type MatchGroup = {
  competition: Match['competition'];
  matches: Match[];
  liveCount: number;
};

export function isLiveStatus(status: MatchStatus): boolean {
  return status === 'live' || status === 'halftime';
}

export function isFollowed(match: Match, follows: Follows): boolean {
  return (
    follows.matches.includes(match.id) ||
    follows.teams.some((team) => team.id === match.home.id || team.id === match.away.id)
  );
}

export function sortMatches(matches: Match[]): Match[] {
  return [...matches].sort((a, b) => {
    const rank = statusRank[a.status] - statusRank[b.status];
    if (rank) return rank;
    return a.utcDate.localeCompare(b.utcDate) || a.id.localeCompare(b.id);
  });
}

export function groupMatches(matches: Match[]): MatchGroup[] {
  const buckets = new Map<string, Match[]>();
  for (const match of matches) {
    const list = buckets.get(match.competition.id);
    if (list) list.push(match);
    else buckets.set(match.competition.id, [match]);
  }
  const groups: MatchGroup[] = [...buckets.values()].map((list) => ({
    competition: list[0].competition,
    matches: sortMatches(list),
    liveCount: list.filter((match) => isLiveStatus(match.status)).length,
  }));
  groups.sort((a, b) => {
    const live = Number(b.liveCount > 0) - Number(a.liveCount > 0);
    if (live) return live;
    return a.competition.priority - b.competition.priority || a.competition.name.localeCompare(b.competition.name);
  });
  return groups;
}

export function applyFilter(matches: Match[], filter: BoardFilter): Match[] {
  if (filter === 'live') return matches.filter((match) => isLiveStatus(match.status));
  if (filter === 'upcoming') return matches.filter((match) => match.status === 'scheduled');
  if (filter === 'finished') return matches.filter((match) => match.status === 'finished');
  return matches;
}
