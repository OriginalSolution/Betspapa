import assert from 'node:assert/strict';
import test from 'node:test';
import { restartSnapshot } from './engine.mjs';
import { projectSlip } from './oddsRange.mjs';

const now = new Date('2026-11-10T12:00:00.000Z');
const legs = Array.from({ length: 6 }, (_, i) => ({
  eventId: `sr:match:${i}`,
  market: 'over15',
  pick: 'Over 1.5',
  match: `Home ${i} vs Away ${i}`,
  kickoff: `2026-11-10T${String(14 + i).padStart(2, '0')}:00:00.000Z`,
  odds: 1.2,
  rate: 0.9,
}));

test('a restored board keeps every code whose matches are still open', () => {
  const master = {
    id: 'master',
    legs,
    books: {
      sportybet: {
        parts: [
          { code: 'AAA', legs: 3, matches: ['sr:match:0', 'sr:match:1', 'sr:match:2'] },
          { code: 'BBB', legs: 3, matches: ['sr:match:3', 'sr:match:4', 'sr:match:5'] },
        ],
      },
    },
  };
  const snap = restartSnapshot({ master }, now);
  const projected = projectSlip(snap.master, now.getTime());
  const codes = projected.books.sportybet.parts.map((part) => part.code);
  assert.deepEqual(codes, ['AAA', 'BBB']);
  assert.equal(projected.legs.length, 6);
});

test('a code whose matches have all kicked off is not stored', () => {
  const master = {
    id: 'master',
    legs,
    books: { sportybet: { parts: [{ code: 'OLD', legs: 1, matches: ['sr:match:gone'] }, { code: 'NEW', legs: 1, matches: ['sr:match:5'] }] } },
  };
  const snap = restartSnapshot({ master }, now);
  assert.deepEqual(snap.master.books.sportybet.parts.map((part) => part.code), ['NEW']);
  assert.deepEqual(snap.master.legs.map((leg) => leg.eventId), ['sr:match:5']);
});
