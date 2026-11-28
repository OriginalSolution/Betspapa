import assert from 'node:assert/strict';
import test from 'node:test';
import { agreeFixture, buildAgreeBoard, competitorUid, selectFixtures } from './bothAgree.mjs';

const now = Date.parse('2026-11-28T00:00:00.000Z');

function event(id, homeId, awayId, kickoff) {
  return {
    eventId: id,
    home: 'Home',
    away: 'Away',
    homeId,
    awayId,
    kickoff,
    tournament: 'League',
  };
}

function side(name, markets) {
  return { name, n: 10, markets };
}

test('competitor ids are the sportradar number and placeholders are skipped', () => {
  assert.equal(competitorUid('sr:competitor:43734'), '43734');
  assert.equal(competitorUid('2504'), '2504');
  assert.equal(competitorUid('sr:team:1'), '');
  const events = [
    event('sr:match:1', 'sr:competitor:1', 'sr:competitor:2', '2026-11-28T10:00:00.000Z'),
    event('sr:match:2', '', 'sr:competitor:2', '2026-11-28T11:00:00.000Z'),
    event('sr:match:3', 'sr:competitor:3', 'sr:competitor:4', '2026-11-26T10:00:00.000Z'),
    event('sr:match:4', 'sr:competitor:5', 'sr:competitor:6', '2026-11-30T12:00:00.000Z'),
  ];
  assert.deepEqual(selectFixtures(events, now).map((row) => row.eventId), ['sr:match:1']);
});

test('a fixture is listed from real last-10 samples and a short sample does not agree', () => {
  const home = side('Freiburg', [
    { id: 'over15', label: 'Over 1.5', hit: 10, n: 10 },
    { id: 'team15', label: 'Team over 1.5', hit: 9, n: 10 },
    { id: '1h15', label: '1st half over 1.5', hit: 9, n: 10 },
    { id: 's1h', label: 'Scored in 1st half', hit: 4, n: 4 },
  ]);
  const away = side('Heidenheim', [
    { id: 'over15', label: 'Over 1.5', hit: 10, n: 10 },
    { id: 'team15', label: 'Team over 1.5', hit: 8, n: 10 },
    { id: '1h15', label: '1st half over 1.5', hit: 5, n: 10 },
    { id: 's1h', label: 'Scored in 1st half', hit: 4, n: 4 },
  ]);
  const row = agreeFixture(event('sr:match:9', 'sr:competitor:9', 'sr:competitor:8', '2026-11-28T10:00:00.000Z'), home, away);
  assert.equal(row.market.id, 'over15');
  assert.equal(row.market.tier, '100');
  assert.equal(row.also[0].id, 'team15');
  assert.equal(row.also.some((market) => market.id === '1h15' || market.id === 's1h'), false);
  assert.equal(row.miss.id, '1h15');
  assert.equal(row.miss.away.hit, 5);
  const sides = new Map([
    ['9', home],
    ['8', away],
  ]);
  const board = buildAgreeBoard([event('sr:match:9', 'sr:competitor:9', 'sr:competitor:8', '2026-11-28T10:00:00.000Z')], sides, now);
  assert.equal(board.length, 1);
  assert.equal(board[0].home, 'Freiburg');
  assert.equal(board[0].quote, null);
  const priced = agreeFixture(
    { ...event('sr:match:9', 'sr:competitor:9', 'sr:competitor:8', '2026-11-28T10:00:00.000Z'), odds: { 'over-15': 1.25, 'over-25': 1.9 } },
    home,
    away,
  );
  assert.deepEqual(priced.quote, { market: 'over15', odds: 1.25 });
});
