import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { compareXi, createLineups, lineupNote, lineupWanted, playerName, readPlayers } from './lineups.mjs';

test('a change is a starter missing from the previous match', () => {
  assert.equal(playerName('Brady, Chris'), 'Chris Brady');
  const current = readPlayers([
    { playerid: 1, playername: 'Brady, Chris', pos: 'G', order: 1 },
    { playerid: 2, playername: 'Elliott, Jack', pos: 'D', order: 2 },
  ]);
  const previous = readPlayers([
    { playerid: 1, playername: 'Brady, Chris', pos: 'G', order: 1 },
    { playerid: 9, playername: 'Old, Bob', pos: 'D', order: 2 },
  ]);
  const diff = compareXi(current, previous);
  assert.equal(diff.changes, 1);
  assert.deepEqual(diff.incoming.map((player) => player.name), ['Jack Elliott']);
  assert.deepEqual(diff.dropped.map((player) => player.name), ['Bob Old']);
  assert.equal(compareXi(current, []).changes, null);
});

test('an announced XI is stored once and alerts a followed team', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'betspapa-xi-'));
  const squad = (home, away, previousHome = []) => ({
    ok: true,
    json: async () => ({
      doc: [{
        data: {
          match: { teams: { home: { uid: 2505, name: 'Chicago' }, away: { uid: 863473, name: 'Charlotte' } } },
          home: { startinglineup: { players: home } },
          away: { startinglineup: { players: away } },
          previous: { home: { startinglineup: { players: previousHome } }, away: { startinglineup: { players: [] } } },
        },
      }],
    }),
  });
  const players = (ids) => ids.map((id, index) => ({ playerid: id, playername: `Player, ${id}`, pos: 'M', order: index + 1 }));
  let calls = 0;
  const lineups = createLineups({
    dir,
    now: () => Date.parse('2026-11-23T00:00:00.000Z'),
    log: { log() {}, error() {} },
    fetchImpl: async (url) => {
      calls += 1;
      if (String(url).includes('lastx')) {
        return { ok: true, json: async () => ({ doc: [{ data: { matches: [{ _id: 50, periods: { ft: { home: 1, away: 0 } } }] } }] }) };
      }
      if (String(url).endsWith('/50')) return squad(players([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]), players([21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31]));
      return squad(players([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12]), players([21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31]), []);
    },
  });
  const event = { eventId: 'sr:match:76609138', home: 'Chicago Fire', away: 'Charlotte FC', kickoff: '2026-11-23T00:30:00.000Z', homeId: 'sr:competitor:2505', awayId: 'sr:competitor:863473' };
  const first = await lineups.scan([event]);
  assert.equal(first.length, 2);
  assert.equal(lineups.list()[0].homeChanges, 1);
  assert.equal(lineups.list()[0].homeIn[0], '12 Player');
  const again = await lineups.scan([event]);
  assert.equal(again.length, 0);
  assert.ok(calls >= 2);
  const device = { follows: { matches: [], teams: [{ id: 'sr:competitor:2505' }] }, settings: { lineups: true, lineupBig: true }, lineupOff: [] };
  assert.equal(lineupWanted(device, first.find((row) => row.side === 'home')), false);
  device.settings.lineupBig = false;
  assert.equal(lineupWanted(device, first[0]), true);
  device.lineupOff = ['sr:competitor:2505'];
  assert.equal(lineupWanted({ ...device, follows: { matches: ['sr:match:76609138'], teams: [] } }, first.find((row) => row.side === 'home')), false);
  const note = lineupNote(first.find((row) => row.side === 'home'));
  assert.equal(note.kind, 'lineup');
  assert.equal(note.matchId, 'sr:match:76609138');
  assert.match(note.title, /Chicago Fire v Charlotte FC: Chicago Fire make 1 change/);
  assert.equal(note.id, 'lineup:sr:match:76609138:home');
});
