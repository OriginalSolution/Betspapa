import assert from 'node:assert/strict';
import test from 'node:test';
import { agreeSideOffers, backedSide, sideAllowed, strongerSide } from './strongerSide.mjs';

test('the higher table place is the stronger side, and a tie or a blank table does not guess', () => {
  assert.equal(strongerSide(2, 9), 'home');
  assert.equal(strongerSide(9, 2), 'away');
  assert.equal(strongerSide(4, 4), null);
  assert.equal(strongerSide(null, 2), null);
  assert.equal(strongerSide(1, 0), null);
});

test('team score, draw no bet, and double chance 1X or X2 follow the stronger side', () => {
  assert.equal(backedSide('over15'), null);
  assert.equal(backedSide('dc-12'), null);
  assert.equal(sideAllowed('over15', null, null).keep, true);
  assert.equal(sideAllowed('dnb-home', 1, 8).keep, true);
  assert.equal(sideAllowed('dnb-away', 1, 8).keep, false);
  assert.equal(sideAllowed('dc-x2', 1, 8, { greenlit: true }).keep, false);
  assert.equal(sideAllowed('dc-x2', 1, 8, { greenlit: true }).reason, 'home is higher on the table');
  assert.equal(sideAllowed('home-score', 6, 6).keep, false);
  assert.equal(sideAllowed('away-over15', null, 3).reason, 'no league table, so the side was not guessed');
  assert.equal(sideAllowed('home-over25', 3, 11).keep, true);
});

test('both-agree offers the stronger side only, and drops the line when the table is missing', () => {
  const markets = [
    { id: 'over15', label: 'Over 1.5' },
    { id: 'dc1x', label: 'Double chance 1X' },
    { id: 'dcx2', label: 'Double chance X2' },
    { id: 'dnb', label: 'Draw no bet' },
    { id: 'team15', label: 'Team over 1.5' },
  ];
  assert.deepEqual(agreeSideOffers(markets, null).map((row) => row.id), ['over15']);
  assert.deepEqual(
    agreeSideOffers(markets, 'away').map((row) => row.label),
    ['Over 1.5', 'Double chance X2', 'Draw no bet · away', 'Away over 1.5'],
  );
});
