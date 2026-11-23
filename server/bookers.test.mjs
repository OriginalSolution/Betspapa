import assert from 'node:assert/strict';
import test from 'node:test';
import { bookAll, resetBookerCache } from './bookers.mjs';
import { stillOffered, toSelection } from './selection.mjs';

test('maps price markets onto the Betradar ids the share route expects', () => {
  const over = toSelection({ eventId: 'sr:match:76482544', market: 'over15', odds: 1.04, match: 'CD Anaitasuna vs Alaves' });
  assert.deepEqual(
    { marketId: over.marketId, outcomeId: over.outcomeId, specifier: over.specifier },
    { marketId: '18', outcomeId: '12', specifier: 'total=1.5' },
  );
  assert.equal(toSelection({ eventId: 'sr:match:1', market: 'home', odds: 1.4 }).outcomeId, '1');
  assert.equal(toSelection({ eventId: 'sr:match:1', market: 'btts', odds: 1.5 }).outcomeId, '74');
  assert.equal(toSelection({ eventId: 'sr:match:1', market: 'btts-no', odds: 1.5 }).outcomeId, '76');
  assert.equal(toSelection({ eventId: 'sr:match:1', market: 'home-score', odds: 1.2 }).specifier, 'total=0.5');
  assert.equal(toSelection({ eventId: 'ars-liv', market: 'home', odds: 1.4 }), null);
  assert.equal(toSelection({ eventId: 'sr:match:1', market: 'clean', odds: 1.2 }), null);
});

test('drops a listed outcome that is not active and keeps an unscanned match', () => {
  const leg = toSelection({ eventId: 'sr:match:1', market: 'home', odds: 1.4 });
  assert.equal(stillOffered({ events: new Set(['sr:match:1']), keys: new Set(['sr:match:1|1||2']) }, leg), false);
  assert.equal(stillOffered({ events: new Set(), keys: new Set() }, leg), true);
});

test('books an open SportyBet slip, splits a long slip, and reports the other desks', async () => {
  resetBookerCache();
  const calls = [];
  const request = async (method, url, opts = {}) => {
    const count = opts.body?.selections?.length || opts.body?.betslip?.length || 0;
    calls.push({ method, url, count });
    if (url.includes('pcUpcomingEvents')) return {};
    if (url.includes('sportybet.com')) {
      if (count > 50) return { bizCode: 19000, message: 'too many' };
      if (count === 2) {
        return { bizCode: 10000, data: { shareCode: 'BOTH', outcomes: [{ matchStatus: 'Not start' }, { matchStatus: 'Ended' }] } };
      }
      const id = opts.body.selections[0].eventId;
      if (count === 1 && id === 'sr:match:2') return { bizCode: 19000, message: 'closed' };
      return {
        bizCode: 10000,
        data: { shareCode: `SB${count}`, outcomes: opts.body.selections.map(() => ({ matchStatus: 'Not start' })) },
      };
    }
    if (url.includes('football.com')) return { bizCode: 19999, message: 'closed' };
    if (url.includes('msport.com')) {
      if (method === 'GET') return { data: { bettableBetSlip: [{ event: { eventId: 'sr:match:1' }, market: { id: '18', specifiers: 'total=1.5' }, outcome: { id: '12', odds: '1.25' } }] } };
      return { bizCode: 10000, data: { shareCode: 'MS1' } };
    }
    if (url.includes('betika.com')) {
      if (url.includes('decode')) return { data: [{ valid: '1', odd_value: '1.28', parent_match_id: '1', sub_type_id: '18', special_bet_value: 'total=1.5', outcome_id: '12' }, { valid: '0', odd_value: '1.2', parent_match_id: '2', sub_type_id: '18', special_bet_value: 'total=1.5', outcome_id: '12' }] };
      return { code: 'BK1' };
    }
    if (url.includes('betpawa.com')) return url.includes('search') ? { events: [] } : {};
    return {};
  };

  const closed = await bookAll(
    [
      { eventId: 'sr:match:1', market: 'over15', odds: 1.25, match: 'A vs B' },
      { eventId: 'sr:match:2', market: 'over15', odds: 1.25, match: 'C vs D' },
    ],
    request,
  );
  assert.equal(closed.sportybet.parts[0].code, 'SB1');
  assert.equal(closed.sportybet.parts[0].legs, 1);
  assert.match(closed.sportybet.parts[0].link, /^https:\/\/www\.sportybet\.com\/gh\/\?shareCode=SB1$/);
  assert.equal(closed.betika.parts[0].code, 'BK1');
  assert.equal(closed.betika.parts[0].legs, 1);
  assert.equal(closed.footballcom.parts.length, 0);
  assert.match(closed.footballcom.error, /No open selections/);
  assert.equal(closed.betpawa.error && closed.betpawa.parts.length, 0);
  assert.equal('betway' in closed, false);

  resetBookerCache();
  const longLegs = Array.from({ length: 31 }, (_, index) => ({
    eventId: `sr:match:${index + 10}`,
    market: 'home',
    odds: 1.2,
    match: `Home ${index} vs Away ${index}`,
  }));
  const long = await bookAll(longLegs, request);
  const sportySizes = calls.filter((call) => call.url.includes('sportybet.com') && call.count > 1).map((call) => call.count);
  assert.ok(sportySizes.includes(31));
  assert.equal(long.sportybet.parts.length, 1);
  assert.equal(long.sportybet.parts[0].legs, 31);
  const betikaSizes = calls.filter((call) => call.url.includes('betika.com') && call.url.includes('encode') && call.count > 1).map((call) => call.count);
  assert.ok(betikaSizes.includes(20) && betikaSizes.includes(11));
});

test('does not share a selection the facts scan says is absent', async () => {
  resetBookerCache();
  const posts = [];
  const request = async (method, url, opts = {}) => {
    if (url.includes('pcUpcomingEvents')) {
      return {
        bizCode: 10000,
        data: {
          totalNum: 1,
          tournaments: [
            {
              events: [
                {
                  eventId: 'sr:match:9',
                  markets: [{ id: '1', specifier: null, outcomes: [{ id: '2', desc: 'Draw', isActive: 1 }] }],
                },
              ],
            },
          ],
        },
      };
    }
    posts.push(url);
    return { bizCode: 19000, message: 'should not book' };
  };
  const books = await bookAll([{ eventId: 'sr:match:9', market: 'home', odds: 1.4, match: 'A vs B' }], request);
  assert.equal(posts.length, 0);
  assert.match(books.sportybet.error, /No open selections/);
});

test('betPawa says which leg it does not sell, and asks again after a miss expires', async () => {
  resetBookerCache();
  let listed = false;
  let searches = 0;
  const events = {
    100: { markets: [{ marketType: { id: '5000' }, row: [{ handicap: 10, prices: [{ id: 'P1', name: 'Over', odds: 1.3, suspended: false }] }] }] },
    200: { markets: [{ marketType: { id: '3743' }, row: [{ prices: [{ id: 'P2', name: '1', odds: 1.4 }] }] }] },
  };
  const request = async (method, url) => {
    if (url.includes('pcUpcomingEvents')) return {};
    if (!url.includes('betpawa.com')) return {};
    if (url.includes('search')) {
      searches += 1;
      if (url.includes('Alpha')) return { events: listed ? [{ id: 100, widgets: [{ type: 'SPORTRADAR', id: '1' }] }] : [] };
      if (url.includes('Gamma')) return { events: [{ id: 200, widgets: [{ type: 'SPORTRADAR', id: '2' }] }] };
      return { events: [] };
    }
    if (url.includes('v4/events/100')) return events[100];
    if (url.includes('v4/events/200')) return events[200];
    if (url.includes('booking-number') && method === 'POST') return { code: 'BP1' };
    if (url.includes('booking-number')) return { items: [{ selections: ['P1'] }] };
    return {};
  };
  const legs = [
    { eventId: 'sr:match:1', market: 'over25', odds: 1.3, match: 'Alpha vs Beta' },
    { eventId: 'sr:match:2', market: 'btts-no', odds: 1.3, match: 'Gamma vs Delta' },
  ];
  const first = await bookAll(legs, request, undefined, ['betpawa']);
  const reasons = Object.fromEntries(first.betpawa.dropped.map((row) => [row.eventId, row.reason]));
  assert.equal(reasons['sr:match:1'], 'betPawa does not list this match.');
  assert.equal(reasons['sr:match:2'], 'betPawa does not list this market for this match.');

  // betPawa lists the match later. Within the miss window it is not searched again.
  listed = true;
  const before = searches;
  await bookAll(legs.slice(0, 1), request, undefined, ['betpawa']);
  assert.equal(searches, before);

  const realNow = Date.now;
  Date.now = () => realNow() + 11 * 60 * 1000;
  try {
    const later = await bookAll(legs.slice(0, 1), request, undefined, ['betpawa']);
    assert.equal(later.betpawa.parts[0]?.code, 'BP1');
  } finally {
    Date.now = realNow;
  }

  // A suspended price is "not open", which the guardian still treats as a gap.
  resetBookerCache();
  events[100].markets[0].row[0].prices[0].suspended = true;
  const closed = await bookAll(legs.slice(0, 1), request, undefined, ['betpawa']);
  assert.equal(closed.betpawa.dropped[0].reason, 'Not open on betPawa.');
});

function sportyOk(code) {
  return async (method, url) => {
    if (String(url).includes('pcUpcomingEvents')) return { data: { tournaments: [], totalNum: 0 } };
    return { bizCode: 10000, data: { shareCode: code, outcomes: [{ matchStatus: 'Not start' }] } };
  };
}

test('on-demand booking does not wait for a busy engine lane', async () => {
  resetBookerCache();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const hanging = async (method, url) => {
    if (String(url).includes('pcUpcomingEvents')) return { data: { tournaments: [], totalNum: 0 } };
    await gate;
    return { bizCode: 10000, data: { shareCode: 'ENG', outcomes: [{ matchStatus: 'Not start' }] } };
  };
  const leg = { eventId: 'sr:match:1', market: 'over15', odds: 1.25, match: 'A vs B' };
  const pending = [bookAll([leg], hanging, undefined, ['sportybet']), bookAll([{ ...leg, eventId: 'sr:match:2' }], hanging, undefined, ['sportybet'])];
  await new Promise((resolve) => setTimeout(resolve, 20));
  const started = Date.now();
  const result = await bookAll([{ ...leg, eventId: 'sr:match:3' }], sportyOk('NOW'), undefined, ['sportybet'], { interactive: true });
  assert.ok(Date.now() - started < 1000);
  assert.equal(result.sportybet.parts[0].code, 'NOW');
  release();
  await Promise.all(pending);
});

test('a desk deadline returns a timeout instead of hanging', async () => {
  resetBookerCache();
  const hanging = async () => new Promise(() => {});
  const result = await bookAll(
    [{ eventId: 'sr:match:1', market: 'over15', odds: 1.25, match: 'A vs B' }],
    hanging,
    undefined,
    ['sportybet'],
    { deadline: Date.now() + 30 },
  );
  assert.match(result.sportybet.error, /took too long/i);
  assert.equal(result.sportybet.parts.length, 0);
});

test('a slow desk is cut off so the other desks can return', async () => {
  resetBookerCache();
  const request = async (method, url) => {
    if (String(url).includes('pcUpcomingEvents')) return { data: { tournaments: [], totalNum: 0 } };
    if (String(url).includes('betpawa')) return new Promise(() => {});
    return { bizCode: 10000, data: { shareCode: 'NOW', outcomes: [{ matchStatus: 'Not start' }] } };
  };
  const started = Date.now();
  const result = await bookAll(
    [{ eventId: 'sr:match:1', market: 'over15', odds: 1.25, match: 'A vs B' }],
    request,
    undefined,
    ['sportybet', 'betpawa'],
    { interactive: true, deadline: Date.now() + 5_000, deskMs: 40 },
  );
  assert.ok(Date.now() - started < 400);
  assert.equal(result.sportybet.parts[0].code, 'NOW');
  assert.match(result.betpawa.error, /took too long/i);
});
