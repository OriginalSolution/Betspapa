/** League-table places for open fixtures. A miss leaves the positions blank. */
import { tablePositions } from './bankerDefence.mjs';

const GISMO = 'https://stats.fn.sportradar.com/common/en/Europe:Berlin/gismo';
const TTL_MS = 20 * 60_000;
const cache = new Map();

function numericId(value) {
  const found = String(value || '').match(/(\d+)$/);
  return found ? found[1] : '';
}

async function gismo(path, fetchImpl) {
  const hit = cache.get(path);
  const now = Date.now();
  if (hit && now - hit.at < TTL_MS) return hit.body;
  let body = null;
  try {
    const response = await fetchImpl(`${GISMO}/${path}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(12_000),
    });
    if (response.ok) body = await response.json();
  } catch {
    body = null;
  }
  cache.set(path, { at: now, body });
  return body;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Copy fixtures and set hpos/apos when the season table lists both clubs. */
export async function attachTableSides(events, fetchImpl = fetch) {
  const list = Array.isArray(events) ? events : [];
  const seasons = new Map();
  await mapLimit(list, 6, async (event) => {
    const id = numericId(event?.eventId);
    if (!id || event?.hpos != null) return;
    const info = await gismo(`match_info/${id}`, fetchImpl);
    const match = info?.doc?.[0]?.data?.match;
    const season = match?._seasonid ? String(match._seasonid) : '';
    const homeUid = match?.teams?.home?.uid;
    const awayUid = match?.teams?.away?.uid;
    if (!season || homeUid == null || awayUid == null) return;
    if (!seasons.has(season)) seasons.set(season, gismo(`stats_season_tables/${season}`, fetchImpl));
    const table = await seasons.get(season);
    const positions = tablePositions(table, homeUid, awayUid);
    if (!positions) return;
    event.hpos = positions.hpos;
    event.apos = positions.apos;
  });
  return list;
}

export function clearTableSideCache() {
  cache.clear();
}
