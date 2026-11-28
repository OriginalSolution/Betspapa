import assert from 'node:assert/strict';
import test from 'node:test';
import { agreedRows, bookableAgreed, nearestMiss, quoteFor, rateTier } from './agreeMarkets.mjs';

const row = (id, label, hit, n = 10) => ({ id, label, hit, n });

test('the tier is the lower last-10 rate and both sides must clear 8 from a real sample', () => {
  assert.equal(rateTier(10, 10), '100');
  assert.equal(rateTier(9, 10), '90');
  assert.equal(rateTier(8, 10), '80');
  assert.equal(rateTier(7, 10), null);
  assert.equal(rateTier(8, 8), '90');
  assert.equal(rateTier(6, 7), null);
  const agreed = agreedRows(
    [row('over15', 'Over 1.5', 10), row('team15', 'Team over 1.5', 9), row('dc1x', 'Double chance 1X', 10), row('over25', 'Over 2.5', 7)],
    [row('over15', 'Over 1.5', 10), row('team15', 'Team over 1.5', 8), row('dc1x', 'Double chance 1X', 8), row('over25', 'Over 2.5', 10)],
  );
  assert.deepEqual(agreed.map((market) => [market.id, market.tier]), [
    ['over15', '100'],
    ['team15', '80'],
    ['dc1x', '80'],
  ]);
  assert.equal(agreed[1].home.hit, 9);
  assert.equal(agreed[1].away.hit, 8);
});

test('a one-sided 10 from 10 is a miss, not an agreement', () => {
  const miss = nearestMiss(
    [row('team15', 'Team over 1.5', 9), row('1h15', '1st half over 1.5', 4)],
    [row('team15', 'Team over 1.5', 7), row('1h15', '1st half over 1.5', 3)],
  );
  assert.equal(miss.id, 'team15');
  assert.equal(miss.away.hit, 7);
});

test('green light does not book a price outside the band or a different market', () => {
  assert.equal(bookableAgreed({ marketId: 'over15', odds: 1.05, greenlit: true }), false);
  assert.equal(bookableAgreed({ marketId: 'over15', odds: 1.25, blocked: true, greenlit: true }), false);
  assert.equal(bookableAgreed({ marketId: 'dc1x', odds: 1.22, greenlit: true }), false);
  assert.equal(quoteFor('dc1x', { 'dc-1x': 1.22 }), null);
  assert.equal(quoteFor('over15', { 'over-15': 1.05 }), null);
  assert.deepEqual(quoteFor('over15', { 'over-15': 1.25 }), { market: 'over15', odds: 1.25 });
  assert.equal(quoteFor('dc12', { 'dc-12': 1.2 }), null);
  assert.equal(bookableAgreed({ marketId: 'over15', odds: 1.25 }), true);
  assert.equal(bookableAgreed({ marketId: '1h05', odds: 1.2 }), true);
  assert.equal(bookableAgreed({ marketId: '1h15', odds: 1.8 }), false);
});
