import assert from 'node:assert/strict';
import test from 'node:test';
import { bookAll, resetBookerCache } from './bookers.mjs';
import { bookSlips, bookableLegs, trendGroups } from './slips.mjs';

const now = new Date('2026-11-13T10:00:00.000Z');
const leg = (id, market, odds = 1.3) => ({ eventId: `sr:match:${id}`, market, odds, match: `T${id} vs U${id}`, kickoff: '2026-11-13T18:00:00.000Z', status: 'open' });

test('drops legs under 1.20 and started games, keeps exactly 1.20', () => {
  const legs = bookableLegs([leg(1, 'over15', 1.05), leg(2, 'over15', 1.2), { ...leg(3, 'home'), kickoff: '2026-11-13T09:00:00.000Z' }], now);
  assert.deepEqual(legs.map((row) => row.eventId), ['sr:match:2']);
});

test('groups qualifying legs into one trend per market, biggest first', () => {
  const groups = trendGroups([leg(1, 'over15'), leg(2, 'home'), leg(3, 'over15')]);
  assert.deepEqual(groups.map((group) => [group.id, group.legs.length]), [['80:over15', 2], ['80:home', 1]]);
  assert.equal(groups[0].label, '80%+ Over 1.5 goals');
});

test('books each distinct slip once, shares codes with an identical trend, and caps failing retries', async () => {
  const calls = [];
  const book = async (legs, desks) => {
    calls.push({ n: legs.length, desks });
    return Object.fromEntries(desks.map((desk) => [desk, desk === 'betpawa' ? { parts: [], error: 'down' } : { parts: [{ code: `C${legs.length}${desk.slice(0, 2).toUpperCase()}`, link: { sportybet: 'https://www.sportybet.com/x', footballcom: 'https://www.football.com/x', msport: 'https://www.msport.com/x', betika: 'https://betika.com/x' }[desk], legs: legs.length }], error: null }]));
  };
  const master = { id: 'master', name: 'Master slip', legs: [leg(1, 'over15'), leg(2, 'over15')] };
  const same = { id: 'price:over15', name: 'Trend Over 1.5 goals', legs: [leg(2, 'over15'), leg(1, 'over15')] };
  let cache = {};
  for (let cycle = 0; cycle < 5; cycle += 1) {
    const out = await bookSlips({ slips: [master, same], cache, book, now: now.getTime() + cycle * 900_000 });
    cache = out.cache;
    assert.equal(out.results[1].books.sportybet.parts[0].code, out.results[0].books.sportybet.parts[0].code);
  }
  assert.equal(calls[0].desks.length, 5);
  assert.ok(calls.slice(1).every((call) => call.desks.length === 1 && call.desks[0] === 'betpawa'));
  assert.equal(calls.length, 3);
});

test('betPawa drops a price under 1.20 and records why', async () => {
  resetBookerCache();
  const request = async (method, url) => {
    if (url.includes('pcUpcomingEvents')) return {};
    if (url.includes('betpawa') && url.includes('v3/search')) return { events: [{ id: 'E1', widgets: [{ type: 'SPORTRADAR', id: '5' }] }] };
    if (url.includes('betpawa') && url.includes('v4/events/E1')) {
      return { markets: [{ marketType: { id: '3743' }, row: [{ prices: [{ name: '1', id: 'P1', odds: 1.15 }] }] }] };
    }
    return {};
  };
  const books = await bookAll([{ eventId: 'sr:match:5', market: 'home', odds: 1.25, match: 'Alpha vs Beta' }], request, undefined, ['betpawa']);
  assert.equal(books.betpawa.parts.length, 0);
  assert.match(books.betpawa.dropped[0].reason, /1\.15 is outside 1\.20/);
  assert.equal(books.betpawa.dropped[0].market, 'home');
});

test('Betika records a leg it silently left off the shared slip', async () => {
  resetBookerCache();
  const request = async (method, url) => {
    if (url.includes('pcUpcomingEvents')) return {};
    if (url.includes('betika') && url.includes('encode')) return { code: 'BK9' };
    if (url.includes('betika') && url.includes('decode')) {
      return { data: [{ parent_match_id: '7', sub_type_id: '18', special_bet_value: 'total=1.5', outcome_id: '12', odd_value: '1.30', valid: '1' }] };
    }
    return {};
  };
  const books = await bookAll(
    [
      { eventId: 'sr:match:7', market: 'over15', odds: 1.3, match: 'A vs B' },
      { eventId: 'sr:match:8', market: 'over15', odds: 1.3, match: 'C vs D' },
    ],
    request,
    undefined,
    ['betika'],
  );
  assert.equal(books.betika.parts[0].legs, 1);
  assert.equal(books.betika.dropped.length, 1);
  assert.equal(books.betika.dropped[0].eventId, 'sr:match:8');
});
