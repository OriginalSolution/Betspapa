export type FollowRow = {
  id: string;
  eventId: string;
  market: string;
  marketLabel: string;
  odds: number | null;
  sample: string;
  home: string;
  away: string;
  kickoff: string;
};

export type FollowChip = {
  id: string;
  market: string;
  marketLabel: string;
  odds: number | null;
  sample: string;
};

export type FollowMatch = {
  eventId: string;
  home: string;
  away: string;
  kickoff: string;
  chips: FollowChip[];
};

/** One card per match. A row with no teams is dropped. The same market is not listed twice. */
export function groupFollowMatches(rows: FollowRow[]): FollowMatch[] {
  const order: string[] = [];
  const byId = new Map<string, FollowMatch>();
  for (const row of rows) {
    if (!row.eventId || !row.home || !row.away) continue;
    let card = byId.get(row.eventId);
    if (!card) {
      card = { eventId: row.eventId, home: row.home, away: row.away, kickoff: row.kickoff, chips: [] };
      byId.set(row.eventId, card);
      order.push(row.eventId);
    }
    if (card.chips.some((chip) => chip.market === row.market)) continue;
    card.chips.push({
      id: row.id,
      market: row.market,
      marketLabel: row.marketLabel,
      odds: row.odds,
      sample: row.sample,
    });
  }
  return order.map((id) => byId.get(id)!);
}
