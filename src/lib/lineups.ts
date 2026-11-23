import { apiJson, apiUrl } from './apiJson';
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
  return apiUrl('/api/lineups');
}

export async function fetchLineups(): Promise<Lineup[]> {
  try {
    const body = await apiJson<{ lineups?: Lineup[] }>('/api/lineups', 'Line-ups');
    return Array.isArray(body?.lineups) ? body.lineups : [];
  } catch {
    return [];
  }
}

export function changeLabel(count: number | null, name: string): string {
  if (count == null) return `Lineups in · ${name}`;
  const changes = count === 1 ? '1 change' : `${count} changes`;
  return `Lineups in · ${changes} for ${name}`;
}
