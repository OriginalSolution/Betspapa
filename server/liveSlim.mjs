/** The live catalogue sends every market. The board only reads these lines. */
const KEEP = new Set(['1', '10', '11', '18', '19', '20', '29', '60', '68']);

export function slimLivePayload(body) {
  if (!body || typeof body !== 'object' || !Array.isArray(body.data)) return body;
  const data = [];
  for (const tournament of body.data) {
    const events = [];
    for (const event of tournament?.events || []) {
      const markets = (event?.markets || [])
        .filter((market) => KEEP.has(String(market?.id)))
        .map((market) => ({
          id: market.id,
          specifier: market.specifier,
          outcomes: (market.outcomes || []).map((outcome) => ({
            id: outcome.id,
            odds: outcome.odds,
            desc: outcome.desc,
            isActive: outcome.isActive,
          })),
        }));
      events.push({
        eventId: event.eventId,
        homeTeamName: event.homeTeamName,
        awayTeamName: event.awayTeamName,
        estimateStartTime: event.estimateStartTime,
        status: event.status,
        matchStatus: event.matchStatus,
        period: event.period,
        playedSeconds: event.playedSeconds,
        setScore: event.setScore,
        gameScore: event.gameScore,
        sport: event.sport,
        fixtureVenue: event.fixtureVenue,
        varReview: event.varReview,
        timeline: event.timeline,
        incidents: event.incidents,
        comments: event.comments,
        markets,
      });
    }
    if (events.length) data.push({ name: tournament?.name, categoryName: tournament?.categoryName, events });
  }
  return { ...body, data };
}
