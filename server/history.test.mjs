import assert from 'node:assert/strict';
import test from 'node:test';
import { parseMatchStats, rowFromMatch, rowsFromLastX } from './history.mjs';

test('reads a finished result and skips a virtual or unfinished match', () => {
  const payload = {
    doc: [
      {
        data: {
          matches: [
            {
              _id: 10,
              canceled: false,
              postponed: false,
              walkover: false,
              neutralground: false,
              teams: {
                home: { uid: 5, name: 'Alpha', virtual: false },
                away: { uid: 9, name: 'Beta SRL', virtual: false },
              },
              result: { home: 1, away: 1 },
              periods: { p1: { home: 0, away: 1 }, ft: { home: 1, away: 1 } },
              time: { uts: 100 },
            },
            {
              _id: 11,
              teams: { home: { uid: 5, name: 'Alpha', virtual: true }, away: { uid: 8, name: 'Gamma', virtual: false } },
              result: { home: 2, away: 0 },
              time: { uts: 90 },
            },
            {
              _id: 12,
              teams: { home: { uid: 5, name: 'Alpha' }, away: { uid: 8, name: 'Gamma' } },
              result: { home: null, away: null },
              time: { uts: 80 },
            },
          ],
        },
      },
    ],
  };
  assert.equal(rowsFromLastX(payload, 5).length, 0);
  const real = rowFromMatch(
    {
      _id: 13,
      teams: { home: { uid: 8, name: 'Gamma' }, away: { uid: 5, name: 'Alpha' } },
      result: { home: 0, away: 2 },
      periods: { p1: { home: 0, away: 1 } },
      time: { uts: 50 },
    },
    5,
  );
  assert.equal(real.teamIsHome, false);
  assert.equal(real.ftAway, 2);
  assert.equal(real.htAway, 1);
});

test('reads corner and card counts', () => {
  const stats = parseMatchStats({
    doc: [
      {
        data: {
          values: {
            124: { value: { home: 7, away: 3 } },
            40: { value: { home: 2, away: 1 } },
            45: { value: { home: 0, away: 1 } },
            50: { value: { home: 0, away: 1 } },
          },
        },
      },
    ],
  });
  assert.deepEqual(stats, { cornersHome: 7, cornersAway: 3, cardsHome: 2, cardsAway: 3 });
  assert.equal(parseMatchStats({ doc: [{ data: { values: {} } }] }), null);
});
