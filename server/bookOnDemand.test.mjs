import assert from 'node:assert/strict';
import test from 'node:test';
import { resetBookerCache } from './bookers.mjs';
import { allowBooking, bookGroups, emptyBookReason, prepareLegs, resetBookingLimits } from './bookOnDemand.mjs';

const future = '2026-11-13T22:00:00.000Z';
const now = new Date('2026-11-13T18:00:00.000Z');

test('on-demand booking drops a short price and a kicked-off leg, then reuses the code', async () => {
  resetBookingLimits();
  const legs = prepareLegs(
    [
      { eventId: 'sr:match:1', market: 'over15', odds: 1.3, kickoff: future, match: 'Alpha vs Beta' },
      { eventId: 'sr:match:2', market: 'home', odds: 1.1, kickoff: future },
      { eventId: 'sr:match:3', market: 'over25', odds: 1.4, kickoff: '2026-11-13T12:00:00.000Z' },
      { eventId: 'nope', market: 'over15', odds: 1.4, kickoff: future },
    ],
    now,
  );
  assert.deepEqual(legs.map((leg) => leg.eventId), ['sr:match:1']);
  assert.match(emptyBookReason([{ kickoff: '2026-11-13T12:00:00.000Z', market: 'over25', odds: 1.4 }], now), /kicked off/);
  let calls = 0;
  const request = async (method, url) => {
    calls += 1;
    if (String(url).includes('pcUpcomingEvents')) return { data: { tournaments: [], totalNum: 0 } };
    return { bizCode: 10000, data: { shareCode: 'REAL1', outcomes: [{ matchStatus: 'Not start' }] } };
  };
  const first = await bookGroups([{ id: 'all', legs }], request, now);
  assert.equal(first.groups[0].books.sportybet.parts[0].code, 'REAL1');
  assert.equal(first.groups[0].books.betway, undefined);
  const again = await bookGroups([{ id: 'all', legs }], request, now);
  assert.equal(again.groups[0].books.sportybet.parts[0].code, 'REAL1');
  const bookedCalls = calls;
  await bookGroups([{ id: 'all', legs }], request, now);
  assert.equal(calls, bookedCalls);
});

test('a burst of different lists is rate limited', () => {
  resetBookingLimits();
  for (let i = 0; i < 8; i += 1) assert.equal(allowBooking('203.0.113.8', 1_000 + i), true);
  assert.equal(allowBooking('203.0.113.8', 1_007), false);
  assert.equal(allowBooking('203.0.113.9', 1_007), true);
});

test('a timed-out on-demand book is not cached', async () => {
  resetBookingLimits();
  resetBookerCache();
  const legs = prepareLegs(
    [{ eventId: 'sr:match:9', market: 'over15', odds: 1.3, kickoff: future, match: 'A vs B' }],
    now,
  );
  const request = async (method, url) => {
    if (String(url).includes('pcUpcomingEvents')) return { data: { tournaments: [], totalNum: 0 } };
    return { bizCode: 10000, data: { shareCode: 'REAL9', outcomes: [{ matchStatus: 'Not start' }] } };
  };
  const first = await bookGroups([{ id: 'all', legs }], request, now, 'local', { deadlineMs: 0 });
  assert.match(first.groups[0].books.sportybet.error, /took too long/i);
  const again = await bookGroups([{ id: 'all', legs }], request, now, 'local', { deadlineMs: 5_000 });
  assert.equal(again.groups[0].books.sportybet.parts[0].code, 'REAL9');
});

test('a green light does not book the team that is lower on the table', () => {
  const stronger = prepareLegs(
    [{ eventId: 'sr:match:1', market: 'dnb-home', odds: 1.25, kickoff: future, hpos: 2, apos: 9 }],
    now,
  );
  assert.equal(stronger.length, 1);
  const weaker = prepareLegs(
    [{ eventId: 'sr:match:1', market: 'dnb-away', odds: 1.25, kickoff: future, hpos: 2, apos: 9, greenlit: true }],
    now,
  );
  assert.equal(weaker.length, 0);
  const guessed = prepareLegs(
    [{ eventId: 'sr:match:1', market: 'home-score', odds: 1.22, kickoff: future, greenlit: true }],
    now,
  );
  assert.equal(guessed.length, 0);
});
