/**
 * Fixtures where both teams' real last 10 agree. Nothing here is invented, and
 * nothing here is added to a slip or a code.
 */
import { agreedRows, nearestMiss, quoteFor, quotePriced } from './agreeMarkets.mjs';
import { withoutDc12 } from './dc12.mjs';
import { agreeEngineMarket, agreeSideOffers, strongerSide } from './strongerSide.mjs';
import { loadTeamLast10 } from './matchInsight.mjs';
import { attachTableSides } from './tableSides.mjs';

const HORIZON_MS = 36 * 60 * 60 * 1000;
const FIXTURE_LIMIT = 80;
const TEAM_TTL_MS = 20 * 60_000;
const BOARD_TTL_MS = 3 * 60_000;
const FETCH_LIMIT = 8;

const teamCache = new Map();
const boardCache = { at: 0, body: null, pending: null };

export function competitorUid(value) {
  const text = String(value || '').trim();
  const named = text.match(/competitor:(\d+)/);
  if (named) return named[1];
  return /^\d+$/.test(text) ? text : '';
}

export function selectFixtures(events, now = Date.now(), horizonMs = HORIZON_MS, limit = FIXTURE_LIMIT) {
  const clock = now instanceof Date ? now.getTime() : Number(now);
  return (events || [])
    .filter((event) => {
      const kick = Date.parse(event?.kickoff || '');
      if (!Number.isFinite(kick) || kick < clock || kick > clock + horizonMs) return false;
      return Boolean(competitorUid(event?.homeId) && competitorUid(event?.awayId) && event?.eventId);
    })
    .sort((a, b) => String(a.kickoff).localeCompare(String(b.kickoff)))
    .slice(0, limit);
}

export function agreeFixture(event, home, away) {
  if (!home?.markets?.length || !away?.markets?.length) return null;
  const agreed = withoutDc12(agreeSideOffers(agreedRows(home.markets, away.markets), strongerSide(event.hpos, event.apos)));
  if (!agreed.length) return null;
  const [market, ...also] = agreed;
  const priced = market.side ? agreeEngineMarket(market.id, market.side) : null;
  return {
    id: String(event.eventId),
    home: home.name || String(event.home || ''),
    away: away.name || String(event.away || ''),
    homeId: String(event.homeId || ''),
    awayId: String(event.awayId || ''),
    kickoff: String(event.kickoff || ''),
    competition: String(event.tournament || ''),
    market,
    also,
    miss: nearestMiss(home.markets, away.markets),
    quote: priced ? quotePriced(priced, event.odds) : quoteFor(market.id, event.odds),
  };
}

export function buildAgreeBoard(events, sides, now = Date.now()) {
  const fixtures = [];
  for (const event of selectFixtures(events, now)) {
    const row = agreeFixture(event, sides.get(competitorUid(event.homeId)), sides.get(competitorUid(event.awayId)));
    if (row) fixtures.push(row);
  }
  const rank = { '100': 0, '90': 1, '80': 2 };
  fixtures.sort((a, b) => rank[a.market.tier] - rank[b.market.tier] || a.kickoff.localeCompare(b.kickoff) || a.home.localeCompare(b.home));
  return fixtures;
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

async function cachedSide(uid, fetchImpl, now) {
  const hit = teamCache.get(uid);
  if (hit && now - hit.at < TEAM_TTL_MS) return hit.side;
  const side = await loadTeamLast10(uid, fetchImpl);
  teamCache.set(uid, { at: now, side });
  return side;
}

export async function loadBothAgree({ events, fetchImpl = fetch, now = Date.now() } = {}) {
  const chosen = selectFixtures(events, now);
  await attachTableSides(chosen, fetchImpl);
  const uids = [...new Set(chosen.flatMap((event) => [competitorUid(event.homeId), competitorUid(event.awayId)]))];
  const sides = new Map();
  await mapLimit(uids, FETCH_LIMIT, async (uid) => {
    sides.set(uid, await cachedSide(uid, fetchImpl, now));
  });
  return { fixtures: buildAgreeBoard(events, sides, now) };
}

export async function cachedBothAgree(options, now = Date.now()) {
  if (boardCache.body && now - boardCache.at < BOARD_TTL_MS) return boardCache.body;
  if (boardCache.pending) return boardCache.pending;
  boardCache.pending = loadBothAgree({ ...options, now })
    .then((body) => {
      boardCache.body = body;
      boardCache.at = now;
      return body;
    })
    .finally(() => {
      boardCache.pending = null;
    });
  return boardCache.pending;
}

export function clearAgreeCache() {
  teamCache.clear();
  boardCache.at = 0;
  boardCache.body = null;
  boardCache.pending = null;
}
