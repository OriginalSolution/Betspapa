import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createEngine } from './engine.mjs';

const now = new Date('2026-11-10T12:00:00.000Z');
const events = [
  {
    eventId: 'sr:match:10',
    home: 'Alpha',
    away: 'Beta',
    homeId: 'sr:competitor:4716',
    awayId: 'sr:competitor:4708',
    kickoff: '2026-11-10T18:00:00.000Z',
    tournament: 'Nations League',
    country: 'International',
    odds: { home: 1.9, draw: 3.4, away: 4.2, 'over-15': 1.22, 'over-25': 1.08 },
  },
];

function recentWins() {
  return Array.from({ length: 10 }, (_, index) => ({
    matchId: index + 1,
    uts: 1_000_000 - index,
    teamIsHome: true,
    neutral: false,
    ftHome: 2,
    ftAway: 1,
    htHome: 1,
    htAway: 0,
    cornersHome: null,
    cornersAway: null,
    cardsHome: null,
    cardsAway: null,
  }));
}

function harness(fetchImpl, request) {
  const logs = [];
  const engine = createEngine({
    dir: mkdtempSync(join(tmpdir(), 'betspapa-engine-')),
    fetchImpl,
    request,
    loadHistories: async () => new Map([[4716, recentWins()], [4708, []]]),
    now: () => now,
    retryMs: 0,
    log: (level, message) => logs.push(`${level}:${message}`),
  });
  return { engine, logs };
}

test('books a qualifying leg, keeps the code, and does not mint one when the desk refuses', async () => {
  let down = true;
  const calls = [];
  const { engine, logs } = harness(
    async () => {
      if (down) throw new Error('timeout');
      return { ok: true, json: async () => ({ events }) };
    },
    async (method, url) => {
      calls.push(url);
      if (url.includes('pcUpcomingEvents')) return {};
      if (url.includes('sportybet.com')) return { bizCode: 10000, data: { shareCode: 'SB1001', outcomes: [{ matchStatus: 'Not start' }] } };
      return {};
    },
  );

  const first = await engine.run();
  assert.equal(first.feedError, 'timeout');
  assert.equal(first.legCount, 0);
  assert.equal(calls.length, 0);
  assert.match(logs.join('\n'), /Fixture attempt 1 failed: timeout/);
  down = false;

  const second = await engine.run();
  assert.equal(second.feedError, null);
  assert.equal(second.legCount, 1);
  assert.equal(second.master.legs[0].market, 'home');
  assert.equal(second.master.legs[0].occurrence, 100);
  assert.equal(second.master.legs[0].sample, '10/10');
  assert.equal(second.master.label, '80%+ Master Slip');
  assert.ok(second.trends.some((trend) => trend.id === '80:over15' && trend.label === '80%+ Over 1.5 goals'));
  assert.equal(second.books.sportybet.parts[0].code, 'SB1001');
  assert.equal(second.books.footballcom.parts.length, 0);
  assert.equal(second.books.betway, undefined);

  const before = calls.length;
  const third = await engine.run();
  assert.equal(third.books.sportybet.parts[0].code, 'SB1001');
  assert.ok(calls.length > before);
  const rebooked = calls.slice(before).filter((url) => url.includes('/orders/share') || url.includes('/share'));
  assert.equal(rebooked.some((url) => url.includes('sportybet.com')), false);
  assert.ok(rebooked.some((url) => url.includes('football.com')));
});
