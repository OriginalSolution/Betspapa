/** Prices under 1.18 are not published as picks, trends, slip legs, or bookings. 1.18 stays. */
export const MIN_PUBLISHED_ODDS = 1.18;

export function publishableOdds(odds: number | null | undefined): boolean {
  return typeof odds === 'number' && Number.isFinite(odds) && odds >= MIN_PUBLISHED_ODDS;
}
