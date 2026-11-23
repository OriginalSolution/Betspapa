export type XiPlayer = { id: number; name: string; pos: string; order: number };

export type Lineup = {
  eventId: string;
  home: string;
  away: string;
  homeId: string | null;
  awayId: string | null;
  homeCrest: string;
  awayCrest: string;
  kickoff: string;
  tournament: string;
  homeChanges: number | null;
  awayChanges: number | null;
  homeXi: XiPlayer[];
  awayXi: XiPlayer[];
  homeIn: string[];
  awayIn: string[];
  homeDropped: string[];
  awayDropped: string[];
};

export function lineupsUrl(): string {
  const host = typeof location !== 'undefined' ? location.hostname : '';
  return host === 'localhost' || host === '127.0.0.1' ? '/api/lineups' : 'https://api.betspapa.com/api/lineups';
}

export async function fetchLineups(): Promise<Lineup[]> {
  const response = await fetch(lineupsUrl());
  if (!response.ok) return [];
  const body = await response.json();
  return Array.isArray(body?.lineups) ? body.lineups : [];
}

export function changeLabel(count: number | null, name: string): string {
  if (count == null) return `Lineups in · ${name}`;
  const changes = count === 1 ? '1 change' : `${count} changes`;
  return `Lineups in · ${changes} for ${name}`;
}
