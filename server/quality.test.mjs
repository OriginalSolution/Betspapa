import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectBooks, repairSettlement, validPart } from './quality.mjs';
import { qualifyEvents } from './qualify.mjs';

test('keeps a real share code and retries an empty or invalid one', () => {
  const checked = inspectBooks({
    sportybet: { parts: [{ code: '8W4Q7Z', link: 'https://www.sportybet.com/gh/?shareCode=8W4Q7Z', legs: 1 }], error: null },
    footballcom: { parts: [{ code: 'not a code', link: 'https://www.football.com/gh/?shareCode=bad', legs: 1 }], error: null },
    msport: { parts: [], error: 'timeout' },
    betika: { parts: [{ code: 'BK12', link: 'https://example.com/share/BK12', legs: 1 }], error: null },
    betpawa: { parts: [{ code: 'PW1234', link: 'https://www.betpawa.com.gh/share-betslip/PW1234', legs: 1 }], error: null },
    betway: { parts: [{ code: 'SHOULDNOT', link: 'https://betway.com/SHOULDNOT' }] },
  });
  assert.equal(validPart('sportybet', checked.books.sportybet.parts[0]), true);
  assert.deepEqual(checked.retry.sort(), ['betika', 'footballcom', 'msport']);
  assert.equal(checked.books.sportybet.parts[0].code, '8W4Q7Z');
  assert.equal(checked.books.footballcom.parts.length, 0);
  assert.equal(checked.books.betika.parts.length, 0);
  assert.match(checked.issues.join(' '), /Betway/);
  assert.equal(JSON.stringify(checked).includes('SHOULDNOT'), false);
});

test('corrects a won mark that the score does not support', () => {
  const repaired = repairSettlement([
    { eventId: 'sr:match:1', market: 'over15', match: 'A vs B', status: 'won', homeScore: 0, awayScore: 0, finished: true },
    { eventId: 'sr:match:2', market: 'over15', match: 'C vs D', status: 'open', homeScore: null, awayScore: null, finished: false },
  ]);
  assert.equal(repaired.changed, true);
  assert.equal(repaired.legs[0].status, 'bust');
  assert.equal(repaired.legs[1].status, 'open');
  assert.equal(repaired.status, 'bust');
  assert.match(repaired.issues[0], /was won and is bust/);
});

test('qualifies a short total and drops a started match', () => {
  const now = new Date('2026-11-10T12:00:00.000Z');
  const legs = qualifyEvents(
    [
      {
        eventId: 'sr:match:10',
        home: 'Alpha',
        away: 'Beta',
        kickoff: '2026-11-10T18:00:00.000Z',
        odds: { home: 1.9, draw: 3.4, away: 4.2, 'over-15': 1.22, 'over-25': 1.08, 'over-35': 1.2 },
      },
      {
        eventId: 'sr:match:11',
        home: 'Old',
        away: 'Side',
        kickoff: '2026-11-10T10:00:00.000Z',
        odds: { 'over-15': 1.05 },
      },
    ],
    now,
  );
  assert.deepEqual(legs.map((leg) => leg.market), ['over15', 'over35']);
  assert.equal(legs[0].eventId, 'sr:match:10');
  assert.equal(legs[0].odds, 1.22);
  assert.equal(legs[1].odds, 1.2);
  assert.equal(legs.some((leg) => leg.odds < 1.2), false);
});
