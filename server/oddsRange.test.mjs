import assert from 'node:assert/strict';
import test from 'node:test';
import { assertBookingRanges, boardDirty, priceInRange, priceNearRange, projectSlip, rangeViolations, serveBoard } from './oddsRange.mjs';

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

test('the 1.60 ceiling needs 10/10 on both sides, not an 80% held flag', () => {
  const perfect = { sample: '10/10', opponentSample: '10/10' };
  const heldOnly = { opponentHeld: true, sample: '10/10', opponentSample: '8/10' };
  assert.equal(priceInRange('over15', 1.55, perfect), true);
  assert.equal(priceInRange('over15', 1.6, perfect), true);
  assert.equal(priceInRange('over15', 1.61, perfect), false);
  assert.equal(priceInRange('over15', 1.34, heldOnly), false);
  assert.equal(priceInRange('dc-12', 1.27, heldOnly), false);
  assert.equal(priceInRange('dc-12', 1.28, { opponentHeld: true, sample: '10/10' }), false);
  assert.equal(priceInRange('home-score', 1.52, heldOnly), false);
  assert.equal(priceInRange('away-score', 1.33, heldOnly), false);
  assert.equal(priceInRange('over25', 1.51, heldOnly), false);
  assert.equal(priceInRange('home-score', 1.52, perfect), true);
  assert.equal(priceInRange('dc-12', 1.27, perfect), true);
  assert.equal(rangeViolations([{ market: 'dc-12', odds: 1.27, sample: '10/10', opponentSample: '8/10', match: 'A vs B' }]).length, 1);
  assert.equal(rangeViolations([{ market: 'dc-12', odds: 1.22, sample: '8/10' }]).length, 0);
  assert.throws(() => assertBookingRanges([{ market: 'over15', odds: 1.34, sample: '10/10', opponentHeld: true }]), /blocked booking/);
});

test('listed markets keep the published bands', () => {
  const bands = {
    home: [1.2, 1.49],
    away: [1.2, 1.49],
    'dnb-home': [1.2, 1.33],
    'dnb-away': [1.2, 1.33],
    'home-over15': [1.2, 1.49],
    'away-over15': [1.2, 1.49],
    'btts-no': [1.2, 1.49],
    under15: [1.2, 1.3],
    under25: [1.2, 1.49],
    under35: [1.2, 1.6],
  };
  for (const [market, [min, max]] of Object.entries(bands)) {
    assert.equal(priceInRange(market, min), true, market);
    assert.equal(priceInRange(market, max), true, market);
    assert.equal(priceInRange(market, Math.round((max + 0.02) * 100) / 100), false, market);
  }
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

test('a 1.27 double chance 12 leaves the leg list even when both samples are 10/10', () => {
  const perfect = { sample: '10/10', opponentSample: '10/10', exception: true };
  const slip = {
    id: 'tier:100:dc-12',
    legs: [
      { eventId: 'sr:match:1', market: 'dc-12', odds: 1.22, kickoff: future, match: 'A vs B' },
      { eventId: 'sr:match:2', market: 'dc-12', odds: 1.27, kickoff: future, match: 'C vs D', ...perfect },
    ],
    books: {
      sportybet: { parts: [{ code: 'CN7MDY', legs: 1, matches: ['sr:match:1'] }], dropped: [], kept: [] },
    },
  };
  const shown = projectSlip(slip);
  assert.deepEqual(shown.legs.map((leg) => leg.eventId), ['sr:match:1']);
  assert.equal(shown.books.sportybet.parts[0].code, 'CN7MDY');
});

test('a finished board is not served, and the note says so', () => {
  const served = serveBoard({
    updatedAt: '2026-11-13T20:48:52.783Z',
    books: { sportybet: { parts: [{ code: 'OLD', matches: ['sr:match:1'] }] } },
    master: {
      id: 'master',
      legs: [{ eventId: 'sr:match:1', market: 'over15', odds: 1.25, kickoff: past, match: 'A vs B' }],
      books: { sportybet: { parts: [{ code: 'OLD', matches: ['sr:match:1'] }] } },
    },
    trends: [],
    tiers: [],
    issues: ['27 lines were at 80%+ but had no price at or above 1.20.'],
  });
  assert.equal(served.legCount ?? served.master.legCount, 0);
  assert.deepEqual(served.books, {});
  assert.equal(served.master.books.sportybet, undefined);
  assert.match(served.cycleNotes[0], /Finished matches are not shown/);
  assert.equal(JSON.stringify(served).includes('1.20'), false);
});
