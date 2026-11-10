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
      if (count > 30) return { bizCode: 19000, message: 'too many' };
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
      if (method === 'GET') return { data: { bettableBetSlip: [{ outcome: { odds: '1.50' } }] } };
      return { bizCode: 10000, data: { shareCode: 'MS1' } };
    }
    if (url.includes('betika.com')) {
      if (url.includes('decode')) return { data: [{ valid: '1', odd_value: '1.5', parent_match_id: '1' }, { valid: '0', odd_value: '1.2', parent_match_id: '2' }] };
      return { code: 'BK1' };
    }
    if (url.includes('betpawa.com')) return url.includes('search') ? { events: [] } : {};
    return {};
  };

  const closed = await bookAll(
    [
      { eventId: 'sr:match:1', market: 'over15', odds: 1.04, match: 'A vs B' },
      { eventId: 'sr:match:2', market: 'over15', odds: 1.04, match: 'C vs D' },
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
  assert.ok(sportySizes.includes(30));
  assert.equal(long.sportybet.parts.length, 2);
  assert.deepEqual(long.sportybet.parts.map((part) => part.legs).sort((a, b) => a - b), [1, 30]);
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
