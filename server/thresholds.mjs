/**
 * The confidence a market must clear before a leg is shown or booked.
 * Every listed market starts at 80%. server/marketRules.mjs can raise or
 * lower one market from MARKET_RULES_PATH or ENGINE_DATA_DIR/market-rules.json.
 */

export const DEFAULT_CONFIDENCE = 0.8;

let overrides = {};

export function setConfidenceOverrides(map) {
  overrides = map && typeof map === 'object' ? map : {};
}

export function minConfidence(market) {
  const value = Number(overrides[String(market || '')]);
  if (Number.isFinite(value) && value > 0 && value <= 1) return value;
  return DEFAULT_CONFIDENCE;
}

/** 0–1 grade already stored on a leg. Occurrence percents are scaled down. */
export function legConfidence(leg) {
  const rate = Number(leg?.rate);
  if (Number.isFinite(rate)) return rate > 1 ? rate / 100 : rate;
  const occurrence = Number(leg?.occurrence);
  if (!Number.isFinite(occurrence)) return null;
  return occurrence > 1 ? occurrence / 100 : occurrence;
}

/**
 * A leg with no grade yet is left for the odds check alone.
 * A recorded grade under that market's minimum is not published.
 */
export function meetsConfidence(leg) {
  const grade = legConfidence(leg);
  if (grade == null) return true;
  return grade + 1e-12 >= minConfidence(leg?.market);
}
