/**
 * Team agreement for a pick that is already inside the market's odds range.
 * The trend rate is the existing hotter-side or venue occurrence. Once both
 * teams have a sample, that trend is not the grade.
 *
 * A team supports the outcome at 60% or better over the same last-10 window
 * the rest of the engine uses (at least 8 scored games). Both supporting keeps
 * the game even when the trend is under 80%. Anything else, when both samples
 * exist, is left out rather than published as a sure pick.
 */

/** Same 80% bar as THRESHOLD in occurrence.mjs. */
export const TREND_RATE = 0.8;

/** Both teams at or above this support the outcome. */
export const SUPPORT_RATE = 0.6;

function sampleText(record) {
  if (!record) return null;
  return `${record.hits}/${record.sample}`;
}

function supports(record) {
  return Boolean(record) && record.rate + 1e-12 >= SUPPORT_RATE;
}

/**
 * Decide whether a measured line is kept, and the rate that gets published.
 * Returns null when the line is left out.
 * `keptBy` is `teams` only when the 80% trend filter would have dropped it.
 */
export function gradeWithTeams({ trend, home, away } = {}) {
  const homeSample = sampleText(home);
  const awaySample = sampleText(away);
  if (!home || !away) {
    if (!trend || trend.rate + 1e-12 < TREND_RATE) return null;
    return {
      rate: trend.rate,
      hits: trend.hits,
      sample: trend.sample,
      agreement: 'unknown',
      teamsAgree: false,
      homeSample,
      awaySample,
      keptBy: 'trend',
    };
  }
  if (!supports(home) || !supports(away)) return null;
  const weaker = home.rate <= away.rate ? home : away;
  const trendKeeps = Boolean(trend) && trend.rate + 1e-12 >= TREND_RATE;
  return {
    rate: weaker.rate,
    hits: weaker.hits,
    sample: weaker.sample,
    agreement: 'agree',
    teamsAgree: true,
    homeSample,
    awaySample,
    keptBy: trendKeeps ? 'agree' : 'teams',
  };
}
