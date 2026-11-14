import assert from 'node:assert/strict';
import test from 'node:test';
import { bookAll, resetBookerCache } from './bookers.mjs';
import { CODE_LIMIT, bookSlips, bookableLegs, codeGroups, codeLegs, tierSlips, trendGroups } from './slips.mjs';

const now = new Date('2026-11-13T10:00:00.000Z');
const leg = (id, market, odds = 1.3) => ({ eventId: `sr:match:${id}`, market, odds, match: `T${id} vs U${id}`, kickoff: '2026-11-13T18:00:00.000Z', status: 'open' });

test('drops legs under 1.20 and started games, keeps exactly 1.20', () => {
  const legs = bookableLegs([leg(1, 'over15', 1.05), leg(2, 'over15', 1.2), { ...leg(3, 'home'), kickoff: '2026-11-13T09:00:00.000Z' }], now);
  assert.deepEqual(legs.map((row) => row.eventId), ['sr:match:2']);
});

test('a tier code is capped and labelled once, without a second 80% prefix', () => {
  const rows = Array.from({ length: 25 }, (_, index) => ({
    ...leg(index + 1, 'dc-12', 1.22),
    occurrence: index < 3 ? 100 : 80,
    sample: index < 3 ? '10/10' : '8/10',
    kickoff: `2026-11-13T${String(18 + (index % 5)).padStart(2, '0')}:00:00.000Z`,
  }));
  const chosen = codeLegs(rows);
  assert.equal(chosen.length, CODE_LIMIT);
  assert.equal(chosen[0].occurrence, 100);
  assert.ok(chosen.every((row) => row.odds === 1.22));
  const wide = { ...leg(99, 'dc-12', 1.28), opponentHeld: true, sample: '10/10', opponentSample: '8/10' };
  assert.equal(codeLegs([wide, ...rows]).some((row) => row.eventId === 'sr:match:99'), false);
  const tagged = { ...leg(98, 'dc-12', 1.27), sample: '10/10', opponentSample: '10/10', exception: true };
  assert.equal(bookableLegs([tagged, leg(2, 'dc-12', 1.22)], now).some((row) => row.eventId === 'sr:match:98'), false);
  assert.equal(codeLegs([tagged, ...rows]).some((row) => row.eventId === 'sr:match:98'), false);
  const hundred = Array.from({ length: 12 }, (_, index) => ({ ...leg(index + 1, 'dc-12', 1.22), rate: 1, occurrence: 100 }));
  const ninety = Array.from({ length: 12 }, (_, index) => ({ ...leg(index + 50, 'dc-12', 1.22), rate: 0.92, occurrence: 92 }));
  const bandEighty = Array.from({ length: 12 }, (_, index) => ({ ...leg(index + 80, 'over15', 1.25), rate: 0.84, occurrence: 84 }));
  const top = codeGroups(hundred, '100')[0].map((row) => row.eventId).join();
  const mixed = codeGroups([...hundred, ...ninety], '90')[0];
  assert.ok(mixed.some((row) => row.rate === 0.92));
  assert.ok(mixed.some((row) => row.rate === 1));
  assert.notEqual(mixed.map((row) => row.eventId).join(), top);
  const lower = codeGroups([...hundred, ...ninety, ...bandEighty], '80')[0];
  assert.ok(lower.some((row) => row.rate === 0.84));
  assert.ok(lower.some((row) => row.rate >= 0.9));
  const covered = codeGroups(hundred, '100');
  assert.equal(covered.flat().length, hundred.length);
  assert.ok(covered.every((group) => group.length <= 20));
  const many = codeGroups(Array.from({ length: 60 }, (_, index) => ({ ...leg(index + 1, 'over15', 1.25), rate: 1 })), '100');
  assert.deepEqual(many.map((group) => group.length), [50, 10]);
  const slips = tierSlips([
    { ...leg(1, 'dc-12', 1.22), occurrence: 80, rate: 0.8 },
    { ...leg(2, 'over15', 1.25), occurrence: 100, rate: 1, sample: '10/10' },
  ]);
  assert.equal(slips.find((slip) => slip.id === 'tier:100:dc-12'), undefined);
  assert.equal(slips.find((slip) => slip.id === 'tier:100:over15').label, '100% Over 1.5 goals');
  const eighty = slips.find((slip) => slip.id === 'tier:80:dc-12');
  assert.equal(eighty.label, '80%+ Double chance 12');
  assert.equal(eighty.name, '80%+ Double chance 12');
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

test('a tier books a second part instead of dropping the extra legs', async () => {
  const calls = [];
  const linkFor = (desk, code) => ({
    sportybet: `https://www.sportybet.com/gh/?shareCode=${code}`,
    footballcom: `https://www.football.com/gh/?shareCode=${code}`,
    msport: `https://www.msport.com/gh/?shareCode=${code}`,
    betika: `https://betika.com/en-gh/share/${code}`,
    betpawa: `https://www.betpawa.com.gh/share-betslip/${code}`,
  })[desk];
  const book = async (legs, desks) => {
    calls.push({ n: legs.length, desks: desks.slice() });
    const code = `P${calls.length}CODE`;
    if (desks.length === 1 && desks[0] === 'betpawa') {
      const kept = legs.slice(0, Math.min(12, legs.length));
      return {
        betpawa: {
          parts: [{ code, link: linkFor('betpawa', code), legs: kept.length, matches: kept.map((row) => row.eventId) }],
          kept: kept.map((row) => ({ eventId: row.eventId, market: row.market, odds: row.odds })),
          dropped: legs.slice(kept.length).map((row) => ({ eventId: row.eventId, reason: 'Not listed or not open on betPawa.' })),
          scanned: legs.length,
          error: null,
        },
      };
    }
    return Object.fromEntries(desks.map((desk) => [desk, {
      parts: [{ code, link: linkFor(desk, code), legs: legs.length, matches: legs.map((row) => row.eventId) }],
      kept: [],
      dropped: [],
      error: null,
    }]));
  };
  const slip = {
    id: 'tier:100',
    tier: '100',
    name: '100% all picks',
    legs: Array.from({ length: 60 }, (_, index) => ({ ...leg(index + 1, 'over15', 1.25), rate: 1 })),
  };
  const out = await bookSlips({ slips: [slip], book, now: now.getTime(), log: () => {} });
  const parts = out.results[0].books.sportybet.parts;
  assert.equal(parts.length, 2);
  assert.deepEqual(parts.map((part) => part.legs), [50, 10]);
  assert.ok(calls.every((call) => call.n === 50 || call.n === 10));
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
  assert.equal(books.betpawa.scanned, 1);
});

test('betPawa fills past unlisted legs up to the code cap', async () => {
  resetBookerCache();
  const request = async (method, url) => {
    if (url.includes('pcUpcomingEvents')) return {};
    if (url.includes('betpawa') && url.includes('v3/search')) {
      const term = decodeURIComponent(url.split('name=')[1] || '');
      const listed = /^Listed(\d+)/.exec(term);
      if (!listed) return { events: [] };
      return { events: [{ id: `E${listed[1]}`, widgets: [{ type: 'SPORTRADAR', id: listed[1] }] }] };
    }
    if (url.includes('betpawa') && url.includes('/v4/events/E')) {
      const id = url.split('/').pop();
      return { markets: [{ marketType: { id: '3743' }, row: [{ prices: [{ name: '1', id: `P${id}`, odds: 1.25 }] }] }] };
    }
    if (method === 'POST' && url.includes('v3/booking-number')) return { code: 'PAWA1234' };
    if (url.includes('v3/booking-number/')) return { items: [] };
    return {};
  };
  const missing = Array.from({ length: 5 }, (_, index) => ({ eventId: `sr:match:${index + 1}`, market: 'home', odds: 1.25, match: `Missing${index} vs Other${index}` }));
  const listed = Array.from({ length: 12 }, (_, index) => ({ eventId: `sr:match:${index + 20}`, market: 'home', odds: 1.25, match: `Listed${index + 20} vs Other${index + 20}` }));
  const books = await bookAll([...missing, ...listed], request, undefined, ['betpawa']);
  assert.equal(books.betpawa.parts.length, 1);
  assert.equal(books.betpawa.parts[0].code, 'PAWA1234');
  assert.equal(books.betpawa.parts[0].legs, 12);
  assert.equal(books.betpawa.scanned, 17);
  assert.ok(books.betpawa.dropped.some((row) => /Not listed/.test(row.reason)));
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
