import assert from 'node:assert/strict';
import test from 'node:test';
import { competitiveMatchIds, matchOutsideTotal, outsideTier, pickOutsideLine, shotOutsideBox } from './outsideBox.mjs';

test('the 18-yard box matches the Brentford and Everton edge shots', () => {
  assert.equal(shotOutsideBox({ type: 'shotontarget', team: 'home', X: 83, Y: 40 }), true);
  assert.equal(shotOutsideBox({ type: 'shotontarget', team: 'home', X: 90, Y: 44 }), false);
  assert.equal(shotOutsideBox({ type: 'shotofftarget', team: 'away', X: 16, Y: 32 }), true);
  assert.equal(shotOutsideBox({ type: 'shotontarget', team: 'away', X: 9, Y: 57 }), false);
  assert.equal(shotOutsideBox({ type: 'shotontarget', team: 'home', X: 90, Y: 10 }), true);
  assert.equal(shotOutsideBox({ type: 'shotblocked', team: 'home' }), null);
});

test('a goal is not counted twice and a shot with no position voids the match', () => {
  const shots = [
    { type: 'shotontarget', team: 'home', X: 83, Y: 40 },
    { type: 'goal', team: 'home', X: 83, Y: 40 },
    { type: 'shotblocked', team: 'away', X: 9, Y: 50 },
  ];
  assert.deepEqual(matchOutsideTotal(shots), { valid: true, total: 1 });
  assert.equal(matchOutsideTotal([{ type: 'shotontarget', team: 'home', X: 90 }]).valid, false);
  assert.equal(matchOutsideTotal([]).valid, false);
});

test('the best tier wins, and the highest line wins inside that tier', () => {
  const lines = [
    { line: 11, odds: 1.41, outcomeId: '800054:00000011' },
    { line: 12, odds: 1.63, outcomeId: '800054:00000012' },
    { line: 13, odds: 1.9, outcomeId: '800054:00000013' },
  ];
  const ten = Array.from({ length: 10 }, () => 13);
  const nine = [...Array.from({ length: 9 }, () => 13), 11];
  const eight = [...Array.from({ length: 8 }, () => 11), 9, 9];
  const best = pickOutsideLine(lines, { n: 10, totals: ten }, { n: 10, totals: nine });
  assert.equal(best.tier, '100');
  assert.equal(best.line, 11);
  const high = pickOutsideLine(lines, { n: 10, totals: eight }, { n: 10, totals: eight });
  assert.equal(high.tier, '80');
  assert.equal(high.line, 11);
  assert.equal(outsideTier(10, 10), '100');
  assert.equal(outsideTier(8, 8), '90');
  assert.equal(outsideTier(8, 10), '80');
  assert.equal(outsideTier(7, 10), '');
  assert.equal(pickOutsideLine(lines, { n: 7, totals: ten.slice(0, 7) }, { n: 10, totals: ten }), null);
});

test('friendlies are left out of the last 10', () => {
  const payload = {
    doc: [{ data: {
      tournaments: { 1: { friendly: true }, 2: {} },
      matches: [
        { _id: 1, _tid: 1, result: { home: 1, away: 0 } },
        { _id: 2, _tid: 2, postponed: true, result: { home: 1, away: 0 } },
        { _id: 3, _tid: 2, result: { home: 2, away: 2 } },
      ],
    } }],
  };
  assert.deepEqual(competitiveMatchIds(payload, 10), ['3']);
});
