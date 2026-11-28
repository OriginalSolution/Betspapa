import assert from 'node:assert/strict';
import test from 'node:test';
import { finishedRows, last10Side, loadMatchInsight, parseH2H, parseLiveStats, parseTable } from './matchInsight.mjs';

function doc(data) {
  return { doc: [{ data }] };
}

test('head to head keeps scored meetings and drops the current match', () => {
  const payload = doc({
    matches: [
      { _id: 9, teams: { home: { mediumname: 'Home' }, away: { mediumname: 'Away' } }, result: { home: 1, away: 0 }, time: { uts: 100 } },
      { _id: 8, teams: { home: { mediumname: 'Away' }, away: { mediumname: 'Home' } }, result: { home: 2, away: 2 }, time: { uts: 200 } },
      { _id: 7, postponed: true, teams: { home: { name: 'Home' }, away: { name: 'Away' } }, result: { home: 3, away: 0 }, time: { uts: 300 } },
      { _id: 6, teams: { home: { name: 'Home' }, away: { name: 'Away' } }, result: { home: null, away: null }, time: { uts: 400 } },
    ],
  });
  const rows = parseH2H(payload, 'sr:match:9');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, '8');
  assert.equal(rows[0].homeScore, 2);
  assert.equal(rows[0].date, '1 Jan');
});

test('last 10 counts only finished matches for that team', () => {
  const payload = doc({
    team: { mediumname: 'Dinamo' },
    matches: [
      { _id: 1, teams: { home: { uid: 5, name: 'Dinamo' }, away: { uid: 9, name: 'Other' } }, result: { home: 3, away: 1 }, time: { uts: 30 } },
      { _id: 2, teams: { home: { uid: 9, name: 'Other' }, away: { uid: 5, name: 'Dinamo' } }, result: { home: 0, away: 0 }, time: { uts: 20 } },
      { _id: 3, teams: { home: { uid: 5, virtual: true, name: 'Dinamo' }, away: { uid: 8, name: 'X' } }, result: { home: 5, away: 0 }, time: { uts: 10 } },
      { _id: 4, teams: { home: { uid: 5, name: 'Dinamo' }, away: { uid: 8, name: 'X' } }, result: { home: null, away: null }, time: { uts: 40 } },
    ],
  });
  const rows = finishedRows(payload, 5);
  assert.equal(rows.length, 2);
  const side = last10Side(payload, 5, 'Fallback');
  assert.equal(side.name, 'Dinamo');
  assert.equal(side.n, 2);
  assert.deepEqual(
    side.markets.map((market) => [market.id, market.hit, market.n]),
    [
      ['over15', 1, 2],
      ['over25', 1, 2],
      ['over35', 1, 2],
      ['btts', 1, 2],
      ['scored', 1, 2],
      ['conceded', 1, 2],
      ['team15', 1, 2],
      ['dc1x', 2, 2],
      ['dcx2', 1, 2],
      ['dc12', 1, 2],
      ['dnb', 1, 2],
    ],
  );
  assert.equal(side.markets.some((market) => market.id === '1h05'), false);
  assert.equal(last10Side(doc({ matches: [] }), 5, 'X'), null);
});

test('half lines use the first-half score and drop a half that exceeds full time', () => {
  const payload = doc({
    team: { mediumname: 'Crew' },
    matches: [
      {
        _id: 1,
        teams: { home: { uid: 5, name: 'Crew' }, away: { uid: 9, name: 'Other' } },
        result: { home: 3, away: 1 },
        periods: { p1: { home: 2, away: 0 }, ft: { home: 3, away: 1 } },
        time: { uts: 30 },
      },
      {
        _id: 2,
        teams: { home: { uid: 9, name: 'Other' }, away: { uid: 5, name: 'Crew' } },
        result: { home: 1, away: 0 },
        periods: { p1: { home: 2, away: 0 }, ft: { home: 1, away: 0 } },
        time: { uts: 20 },
      },
    ],
  });
  const side = last10Side(payload, 5, 'Crew');
  const byId = Object.fromEntries(side.markets.map((market) => [market.id, market]));
  assert.equal(byId['1h05'].hit, 1);
  assert.equal(byId['1h05'].n, 1);
  assert.equal(byId['2h05'].hit, 1);
  assert.equal(byId.s1h.hit, 1);
  assert.equal(byId.s2h.hit, 1);
  assert.equal(byId.sboth.hit, 1);
  assert.equal(byId['1h15'].hit, 1);
  assert.equal(finishedRows(payload, 5)[1].first, null);
});

test('table prefers the standings that contain both teams', () => {
  const payload = doc({
    tables: [
      {
        name: 'Group',
        tablerows: [{ pos: 1, total: 2, goalDiffTotal: 1, pointsTotal: 4, team: { uid: 5, mediumname: 'Only home' } }],
      },
      {
        name: 'League',
        groupname: '',
        tablerows: [
          { pos: 2, total: 10, goalDiffTotal: 4, pointsTotal: 18, team: { uid: 5, mediumname: 'Home' } },
          { pos: 8, total: 10, goalDiffTotal: -3, pointsTotal: 9, team: { uid: 9, mediumname: 'Away' } },
        ],
      },
    ],
  });
  const table = parseTable(payload, 5, 9);
  assert.equal(table.name, 'League');
  assert.equal(table.rows.length, 2);
  assert.equal(table.rows[0].side, 'home');
  assert.equal(table.rows[1].points, 9);
  assert.equal(parseTable(doc({ tables: [{ name: 'Other', tablerows: [{ pos: 1, total: 1, goalDiffTotal: 0, pointsTotal: 3, team: { uid: 1, name: 'Nobody' } }] }] }), 5, 9), null);
});

test('live stats stay hidden before kick-off and omit a missing row', () => {
  const values = { 110: { value: { home: 61, away: 39 } }, 125: { value: { home: 0, away: 3 } }, 126: { value: { home: 2, away: 1 } }, 171: { value: { home: 1, away: 1 } } };
  assert.equal(parseLiveStats(doc({ values }), { name: 'Not started' }), null);
  const live = parseLiveStats(doc({ values }), { name: '1st half' });
  assert.deepEqual(live.possession, { home: 61, away: 39 });
  assert.deepEqual(live.shots, { home: 3, away: 5 });
  assert.deepEqual(live.shotsOn, { home: 0, away: 3 });
  const partial = parseLiveStats(doc({ values: { 125: { value: { home: 1, away: 0 } } } }), { name: '2nd half' });
  assert.equal(partial.possession, null);
  assert.equal(partial.shots, null);
  assert.deepEqual(partial.shotsOn, { home: 1, away: 0 });
});

test('loader returns only the blocks the feeds actually fill', async () => {
  const routes = {
    'match_info/42': doc({
      match: {
        _id: 42,
        _seasonid: 7,
        status: { name: '1st half' },
        teams: { home: { uid: 5, mediumname: 'Home' }, away: { uid: 9, mediumname: 'Away' } },
      },
    }),
    'stats_team_versus/5/9': doc({ matches: [] }),
    'stats_team_lastx/5/10': doc({ matches: [] }),
    'stats_team_lastx/9/10': doc({ matches: [] }),
    'stats_season_tables/7': doc({ tables: [] }),
    'match_detailsextended/42': doc({ values: {} }),
  };
  const body = await loadMatchInsight('sr:match:42', async (url) => {
    const path = String(url).split('/gismo/')[1];
    return { ok: true, json: async () => routes[path] || doc({}) };
  });
  assert.deepEqual(body, { h2h: null, last10: null, table: null, stats: null });
});
