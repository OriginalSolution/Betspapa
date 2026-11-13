import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { coverage, resolveOne, teamsFromEvents } from './crestResolve.mjs';

function harness(routes) {
  const calls = [];
  const root = mkdtempSync(join(tmpdir(), 'crests-'));
  const deps = {
    root,
    memory: {},
    overrides: { byName: {}, byId: {} },
    wikipediaOnly: false,
    paceSports: async () => {},
    paceWiki: async () => {},
    fetchImpl: async (url) => {
      calls.push(String(url));
      const hit = routes.find((route) => String(url).includes(route.match));
      if (!hit) return { ok: false, status: 404, text: async () => '', headers: { get: () => null } };
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () => JSON.stringify(hit.body),
        arrayBuffer: async () => new ArrayBuffer(0),
      };
    },
    storeImage: async (url) => `/crests/img/${encodeURIComponent(url).slice(-12)}.png`,
  };
  return { deps, calls, root };
}

test('a fixture logo is stored and TheSportsDB is not called', async () => {
  const { deps, calls } = harness([{ match: 'thesportsdb', body: { teams: null } }]);
  const resolved = await resolveOne(
    { name: 'Arsenal', crest: 'https://crests.football-data.org/57.png' },
    { area: 'England', competition: 'Premier League' },
    deps,
  );
  assert.equal(resolved.source, 'fixture');
  assert.match(resolved.file, /^\/crests\/img\//);
  assert.equal(calls.some((url) => url.includes('thesportsdb')), false);
});

test('TheSportsDB wins over Wikipedia, and a SofaScore badge is ignored', async () => {
  const { deps, calls } = harness([
    {
      match: 'searchteams.php',
      body: {
        teams: [
          {
            idTeam: '133604',
            strTeam: 'Arsenal',
            strTeamAlternate: 'Arsenal FC',
            strSport: 'Soccer',
            strCountry: 'England',
            strLeague: 'English Premier League',
            strBadge: 'https://img.sofascore.com/arsenal.png',
          },
          {
            idTeam: '9',
            strTeam: 'Arsenal',
            strSport: 'Soccer',
            strCountry: 'England',
            strLeague: 'English Premier League',
            strBadge: 'https://r2.thesportsdb.com/images/media/team/badge/arsenal.png',
          },
        ],
      },
    },
  ]);
  const resolved = await resolveOne({ name: 'Arsenal' }, { area: 'England', competition: 'Premier League' }, deps);
  assert.equal(resolved.source, 'thesportsdb');
  assert.match(resolved.url, /thesportsdb\.com/);
  assert.equal(calls.some((url) => url.includes('wikipedia')), false);
  assert.equal(resolved.source === 'sportybet', false);
});

test('a national side with no club badge uses the flag', async () => {
  const { deps } = harness([
    { match: 'searchteams.php', body: { teams: null } },
    { match: 'wbsearchentities', body: { search: [] } },
    { match: 'wikipedia', body: { query: { pages: {} } } },
  ]);
  const resolved = await resolveOne(
    { name: 'San Marino' },
    { area: 'International', competition: 'UEFA Nations League' },
    deps,
  );
  assert.equal(resolved.source, 'flag');
  assert.match(resolved.url, /flagcdn\.com\/w160\/sm\.png$/);
});

test('coverage counts fixtures where both crests resolved, and skips a simulated row', () => {
  const events = [
    { home: 'Arsenal', away: 'Chelsea', country: 'England', tournament: 'Premier League', kickoff: '2026-11-12T15:00:00.000Z' },
    { home: 'Sim Town', away: 'Sim City', country: 'Simulated Reality League', tournament: 'SRL', kickoff: '2026-11-12T15:00:00.000Z' },
  ];
  const teams = teamsFromEvents(events);
  assert.equal(teams.length, 2);
  const catalog = { byKey: { arsenal: '/crests/img/a.png', chelsea: '/crests/img/c.png' }, byId: {}, teams: [] };
  const report = coverage(events, catalog, { Arsenal: true });
  assert.equal(report.fixtures, 1);
  assert.equal(report.after.both, 1);
  assert.equal(report.missingTeams, 0);
  assert.equal(report.before.both, 0);
});
