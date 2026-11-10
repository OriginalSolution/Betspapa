/** Same 80% price rule the app uses for a qualifying tip. Closed kickoffs are left out. */

const TIP = 0.8;
const MARKETS = [
  ['home', 'home'],
  ['draw', 'draw'],
  ['away', 'away'],
  ['over-15', 'over15'],
  ['over-25', 'over25'],
  ['over-35', 'over35'],
  ['under-25', 'under25'],
  ['btts-yes', 'btts'],
  ['btts-no', 'btts-no'],
  ['home-over-05', 'home-score'],
  ['away-over-05', 'away-score'],
];

function confidenceOf(rate, support) {
  const adjusted = Math.min(0.97, Math.max(0.4, rate + support * 0.06));
  return Math.round(adjusted * 1000) / 1000;
}

export function qualifyEvents(events, now = new Date()) {
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const end = start + 86_400_000 - 1;
  const nowMs = now.getTime();
  const legs = [];
  for (const event of Array.isArray(events) ? events : []) {
    const kick = new Date(event?.kickoff).getTime();
    if (!Number.isFinite(kick) || kick < nowMs || kick < start || kick > end) continue;
    if (!/^sr:match:\d+$/.test(String(event.eventId || '')) || !event.home || !event.away) continue;
    const odds = event.odds && typeof event.odds === 'object' ? event.odds : null;
    if (!odds) continue;
    const homeImp = odds.home ? 1 / odds.home : 0;
    const drawImp = odds.draw ? 1 / odds.draw : 0;
    const awayImp = odds.away ? 1 / odds.away : 0;
    const book = homeImp + drawImp + awayImp || 1;
    for (const [key, market] of MARKETS) {
      const price = Number(odds[key]);
      if (!Number.isFinite(price) || price <= 1) continue;
      const raw = 1 / price;
      const implied = market === 'home' ? homeImp / book : market === 'draw' ? drawImp / book : market === 'away' ? awayImp / book : raw;
      const oneXTwo = market === 'home' || market === 'away' || market === 'draw';
      const backingAway = market === 'away' || market === 'away-score';
      const gap = backingAway ? awayImp - homeImp : homeImp - awayImp;
      const support = oneXTwo ? (gap > 0.15 ? 1 : gap < -0.05 ? -1 : 0) : raw >= 0.75 ? 1 : raw < 0.55 ? -1 : 0;
      const confidence = confidenceOf(implied, support);
      if (!(implied > TIP && confidence > TIP)) continue;
      legs.push({
        eventId: String(event.eventId),
        market,
        odds: Math.round(price * 100) / 100,
        match: `${event.home} vs ${event.away}`,
        kickoff: new Date(kick).toISOString(),
        status: 'open',
        homeScore: null,
        awayScore: null,
        finished: false,
      });
    }
  }
  return legs;
}
