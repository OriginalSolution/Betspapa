/**
 * Per-league prices the owner treats as dangerous.
 * The shipped table is empty. Edit server/leagueRisk.json, or replace it at
 * runtime with ENGINE_DATA_DIR/league-risk.json or LEAGUE_RISK_PATH.
 * There is no settled-results archive in this repo, so nothing is filled in.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** A penalised pick is never published at 100%. */
export const PENALTY_CAP = 0.9;

const SHIPPED = fileURLToPath(new URL('./leagueRisk.json', import.meta.url));

export function canonLeague(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function readTable(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/** Keys the feed can match: "country | tournament" first, then the tournament alone. */
export function leagueKeys(event) {
  const tournament = canonLeague(event?.tournament);
  const country = canonLeague(event?.country);
  const keys = [];
  if (country && tournament) keys.push(`${country} | ${tournament}`);
  if (tournament) keys.push(tournament);
  return keys;
}

export function normaliseLeagueRisk(raw) {
  const leagues = {};
  const source = raw?.leagues && typeof raw.leagues === 'object' && !Array.isArray(raw.leagues) ? raw.leagues : {};
  for (const [name, bands] of Object.entries(source)) {
    const key = canonLeague(name);
    if (!key || !Array.isArray(bands)) continue;
    const cleaned = [];
    for (const band of bands) {
      const market = String(band?.market || '*').trim() || '*';
      const min = Number(band?.min);
      const max = Number(band?.max);
      if (!Number.isFinite(min) || !Number.isFinite(max) || max + 1e-9 < min) continue;
      const action = String(band?.action || 'exclude').trim().toLowerCase() === 'penalise' ? 'penalise' : 'exclude';
      cleaned.push({ market, min, max, action });
    }
    if (cleaned.length) leagues[key] = cleaned;
  }
  return { version: 1, leagues };
}

export function loadLeagueRisk(env = process.env) {
  const configured = String(env?.LEAGUE_RISK_PATH || '').trim();
  const dataDir = String(env?.ENGINE_DATA_DIR || '').trim();
  const override = configured || (dataDir ? join(dataDir, 'league-risk.json') : '');
  if (override && existsSync(override)) {
    const parsed = readTable(override);
    if (parsed) return normaliseLeagueRisk(parsed);
  }
  return normaliseLeagueRisk(readTable(SHIPPED) || {});
}

/** The first matching band for this league, market, and price. Bands are inclusive. */
export function dangerousBand(table, event, market, odds) {
  const price = Number(odds);
  if (!table?.leagues || !Number.isFinite(price)) return null;
  for (const key of leagueKeys(event)) {
    const bands = table.leagues[key];
    if (!bands) continue;
    for (const band of bands) {
      if (band.market !== '*' && band.market !== market) continue;
      if (price + 1e-9 >= band.min && price <= band.max + 1e-9) return { ...band, league: key };
    }
  }
  return null;
}

/** Band markets that are not a real engine id and not the all-markets mark. */
export function unknownLeagueMarkets(table, knownIds) {
  const known = new Set(knownIds);
  const bad = [];
  for (const [league, bands] of Object.entries(table?.leagues || {})) {
    for (const band of bands) {
      if (band.market !== '*' && !known.has(band.market)) bad.push(`${league} ${band.market}`);
    }
  }
  return bad;
}

/**
 * Exclude drops the pick. Penalise keeps it and caps the grade at 90%
 * once it would have been 90% or higher, so a 100% record is not a sure pick.
 */
export function applyLeagueRisk(graded, band) {
  if (!graded) return null;
  if (!band) return graded;
  if (band.action === 'exclude') return null;
  const capped = graded.rate + 1e-12 >= PENALTY_CAP;
  return {
    ...graded,
    rate: capped ? PENALTY_CAP : graded.rate,
    leagueRisk: 'penalise',
    keptBy: capped && graded.rate > PENALTY_CAP + 1e-12 ? 'markdown' : graded.keptBy,
  };
}
