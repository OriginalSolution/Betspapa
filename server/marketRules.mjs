/**
 * Per-market limits the publisher has to obey.
 * Odds bands live in oddsRange.mjs. Confidence starts at 80% for every market.
 * A file at MARKET_RULES_PATH, or ENGINE_DATA_DIR/market-rules.json, replaces
 * one market's minimum confidence and/or its odds band. Unknown market ids
 * are ignored. The file cannot add a market the engine does not already list.
 *
 * { "markets": { "over15": { "minConfidence": 0.85, "min": 1.2, "max": 1.28 } } }
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ODDS_RANGES, setRangeOverrides } from './oddsRange.mjs';
import { setConfidenceOverrides } from './thresholds.mjs';

export function normaliseMarketRules(raw) {
  const markets = {};
  const source = raw?.markets && typeof raw.markets === 'object' && !Array.isArray(raw.markets) ? raw.markets : {};
  for (const [name, row] of Object.entries(source)) {
    const market = String(name || '').trim();
    if (!market || !Object.prototype.hasOwnProperty.call(ODDS_RANGES, market) || !row || typeof row !== 'object') continue;
    const next = {};
    const min = Number(row.min);
    const max = Number(row.max);
    const confidence = Number(row.minConfidence ?? row.confidence);
    if (Number.isFinite(min) && min > 1) next.min = min;
    if (Number.isFinite(max) && max > 1) next.max = max;
    if (next.min != null && next.max != null && next.max + 1e-9 < next.min) {
      delete next.min;
      delete next.max;
    }
    if (row.maxExclusive === true || row.maxExclusive === false) next.maxExclusive = row.maxExclusive;
    if (Number.isFinite(confidence) && confidence > 0 && confidence <= 1) next.minConfidence = confidence;
    if (Object.keys(next).length) markets[market] = next;
  }
  return { version: 1, markets };
}

function readTable(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

export function rulesPath(env = process.env) {
  const configured = String(env?.MARKET_RULES_PATH || '').trim();
  if (configured) return configured;
  const dataDir = String(env?.ENGINE_DATA_DIR || '').trim();
  return dataDir ? join(dataDir, 'market-rules.json') : '';
}

/** Apply the owner's file, or the built-in 80% floor and odds table when it is absent. */
export function loadMarketRules(env = process.env) {
  const path = rulesPath(env);
  const parsed = path && existsSync(path) ? readTable(path) : null;
  const rules = normaliseMarketRules(parsed || {});
  const odds = {};
  const confidence = {};
  for (const [market, row] of Object.entries(rules.markets)) {
    if (row.min != null || row.max != null || row.maxExclusive != null) {
      odds[market] = { min: row.min, max: row.max, maxExclusive: row.maxExclusive };
    }
    if (row.minConfidence != null) confidence[market] = row.minConfidence;
  }
  setRangeOverrides(odds);
  setConfidenceOverrides(confidence);
  return rules;
}

export function resetMarketRules() {
  setRangeOverrides(null);
  setConfidenceOverrides(null);
}
