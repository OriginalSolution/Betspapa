import assert from 'node:assert/strict';
import test from 'node:test';
import { boardDirty, priceInRange, priceNearRange, projectSlip } from './oddsRange.mjs';

const future = new Date(Date.now() + 3600_000).toISOString();
const past = new Date(Date.now() - 3600_000).toISOString();

test('ranges are inclusive and unlisted markets are excluded', () => {
  assert.equal(priceInRange('over15', 1.2), true);
  assert.equal(priceInRange('over15', 1.3), true);
  assert.equal(priceInRange('over15', 1.31), false);
  assert.equal(priceInRange('over15', 1.19), false);
  assert.equal(priceInRange('home', 1.49), true);
  assert.equal(priceInRange('home', 1.5), false);
  assert.equal(priceInRange('dc-12', 1.18), true);
  assert.equal(priceInRange('dc-12', 1.26), false);
  assert.equal(priceInRange('fh-over15', 1.79), true);
  assert.equal(priceInRange('fh-over15', 1.8), false);
  assert.equal(priceInRange('corners-over85', 1.3), false);
  assert.equal(priceInRange('draw', 1.3), false);
  assert.equal(priceInRange('over05', 1.2), false);
});

test('a 100% record the opponent agrees with may reach 1.60', () => {
  const perfect = { opponentHeld: true, sample: '10/10' };
  const plain = { opponentHeld: false, sample: '10/10' };
  assert.equal(priceInRange('over15', 1.55, perfect), true);
  assert.equal(priceInRange('over15', 1.6, perfect), true);
  assert.equal(priceInRange('over15', 1.61, perfect), false);
  assert.equal(priceInRange('over15', 1.55, plain), false);
  assert.equal(priceInRange('over15', 1.55, { opponentHeld: true, sample: '9/10' }), false);
  assert.equal(priceNearRange('over15', 1.4, plain), true);
  assert.equal(priceNearRange('over15', 1.25, plain), false);
});

test('a kicked-off or out-of-range leg leaves the slip and its code', () => {
  const slip = {
    id: 'master',
    legs: [
      { eventId: 'sr:match:1', market: 'over15', odds: 1.25, kickoff: future, match: 'A vs B' },
      { eventId: 'sr:match:2', market: 'over15', odds: 1.55, kickoff: future, match: 'C vs D' },
      { eventId: 'sr:match:3', market: 'home', odds: 1.3, kickoff: past, match: 'E vs F' },
    ],
    books: {
      sportybet: { parts: [{ code: 'OLD', legs: 3, matches: ['sr:match:1', 'sr:match:2', 'sr:match:3'] }], dropped: [], kept: [] },
    },
  };
  const shown = projectSlip(slip);
  assert.deepEqual(shown.legs.map((leg) => leg.eventId), ['sr:match:1']);
  assert.equal(shown.books.sportybet.parts.length, 0);
  assert.equal(boardDirty({ master: slip, trends: [], tiers: [] }), true);
  assert.equal(boardDirty({ master: shown, trends: [], tiers: [] }), false);
});
