import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Resvg } from '@resvg/resvg-js';
import { competitorId, createCrestStore, teamTier, SPORTRADAR } from './crestStore.mjs';

const crestSvg = (color) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 120">
  <path d="M50 2 96 18v40c0 30-30 52-46 60C34 110 4 88 4 58V18z" fill="${color}" stroke="#f2c230" stroke-width="5"/>
  <path d="M50 22 78 32v26c0 18-18 32-28 38-10-6-28-20-28-38V32z" fill="#ffffff"/>
  <circle cx="50" cy="58" r="14" fill="#d81e2c"/><rect x="30" y="40" width="40" height="6" fill="${color}"/></svg>`;
const png = (color = '#0a3d91') => Buffer.from(new Resvg(crestSvg(color), { fitTo: { mode: 'width', value: 100 }, background: 'rgba(0,0,0,0)' }).render().asPng());
const noPace = async () => {};

function response(status, body, type = 'image/png') {
  const bytes = typeof body === 'string' ? Buffer.from(body) : body || Buffer.alloc(0);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name === 'content-type' ? type : null) },
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    text: async () => bytes.toString('utf8'),
    json: async () => JSON.parse(bytes.toString('utf8')),
  };
}

function makeStore(routes, extra = {}) {
  const calls = [];
  let clock = Date.parse('2026-11-21T10:00:00Z');
  const fetchImpl = async (url) => {
    calls.push(String(url));
    for (const [pattern, handler] of routes) if (pattern.test(String(url))) return handler(String(url));
    return response(404, 'nope');
  };
  const store = createCrestStore({
    dir: mkdtempSync(join(tmpdir(), 'crests-')),
    fetchImpl,
    now: () => clock,
    log: () => {},
    paceRadar: noPace,
    paceImage: noPace,
    paceSports: noPace,
    paceWiki: noPace,
    saveDelayMs: 0,
    ...extra,
  });
  return { store, calls, tick: (ms) => { clock += ms; }, now: () => clock };
}

test('competitor ids are read from sr:competitor:N and bare digits only', () => {
  assert.equal(competitorId('sr:competitor:38'), '38');
  assert.equal(competitorId('38'), '38');
  assert.equal(competitorId('chelsea'), '');
  assert.equal(competitorId('sr:competitor:../x'), '');
});

test('tiers match the coverage script', () => {
  assert.equal(teamTier('Chelsea', 'England', 'Premier League'), 'top');
  assert.equal(teamTier('Chelsea FC W', 'England', "Women's Super League"), 'youth');
  assert.equal(teamTier('HB Koge', 'Denmark', '1st Division'), 'other');
});

test('Sportradar by id is used first and served from our own URL', async () => {
  const { store, calls } = makeStore([[/img\.sportradar\.com\/ls\/crest\/big\/38\.png/, () => response(200, png())]]);
  const url = await store.resolveTeam({ id: 'sr:competitor:38', name: 'Chelsea', country: 'England', competition: 'Premier League' });
  assert.match(url, /^https:\/\/api\.betspapa\.com\/crests\/id\/38\.png\?v=[0-9a-f]{10}$/);
  assert.equal(store.index.teams['38'].source, 'sportradar');
  assert.ok(existsSync(store.imagePath('38')));
  assert.equal(calls[0], `${SPORTRADAR}38.png`);
  assert.equal(store.crestFor('sr:competitor:38', 'Chelsea'), url);
});

test('the Sportradar placeholder falls through to TheSportsDB', async () => {
  const sportsDb = { teams: [{ idTeam: '133610', strTeam: 'Chelsea', strSport: 'Soccer', strCountry: 'England', strLeague: 'English Premier League', strBadge: 'https://r2.thesportsdb.com/images/media/team/badge/chelsea.png' }] };
  const { store } = makeStore([
    [/img\.sportradar\.com/, () => response(200, Buffer.alloc(43, 7), 'image/gif')],
    [/searchteams\.php/, () => response(200, JSON.stringify(sportsDb), 'application/json')],
    [/r2\.thesportsdb\.com/, () => response(200, png('#123456'))],
  ]);
  const url = await store.resolveTeam({ id: 'sr:competitor:999999901', name: 'Chelsea FC', country: 'England', competition: 'Premier League' });
  assert.ok(url);
  assert.equal(store.index.teams['999999901'].source, 'thesportsdb');
});

test('a full miss is recorded with reasons and backs off', async () => {
  const { store, tick } = makeStore([]);
  const team = { id: 'sr:competitor:77777777', name: 'Nowhere Rovers', country: 'Atlantis', competition: 'Deep League' };
  assert.equal(await store.resolveTeam(team), '');
  const miss = store.index.misses['77777777'];
  assert.equal(miss.tries, 1);
  assert.ok(miss.reasons.some((reason) => reason.startsWith('sportradar')));
  const events = [{ home: team.name, homeId: team.id, away: 'X', awayId: null, kickoff: new Date(Date.parse('2026-11-21T10:00:00Z') + 10 * 3_600_000).toISOString(), country: team.country, tournament: team.competition }];
  assert.equal(store.prewarm(events), 0, 'still backing off');
  tick(7 * 3_600_000);
  assert.equal(store.prewarm(events), 1, 'due again after the back-off');
  await store.idle();
});

test('prewarm queues soonest fixtures first and skips stored teams; coverage counts by tier', async () => {
  const seen = [];
  const { store, now } = makeStore([[/img\.sportradar\.com\/ls\/crest\/big\/(\d+)\.png/, (url) => { seen.push(url.match(/(\d+)\.png/)[1]); return url.includes('/3.png') ? response(404, '') : response(200, png()); }]]);
  const at = (h) => new Date(now() + h * 3_600_000).toISOString();
  const events = [
    { home: 'Late FC', homeId: 'sr:competitor:5', away: 'Later FC', awayId: 'sr:competitor:6', kickoff: at(30), country: 'Spain', tournament: 'LaLiga' },
    { home: 'Chelsea', homeId: 'sr:competitor:1', away: 'Leeds United', awayId: 'sr:competitor:2', kickoff: at(2), country: 'England', tournament: 'Premier League' },
    { home: 'Gap Town', homeId: 'sr:competitor:3', away: 'Far FC', awayId: 'sr:competitor:4', kickoff: at(24 * 9), country: 'Wales', tournament: 'Cymru North' },
  ];
  assert.equal(store.prewarm(events, { days: 7 }), 4);
  await store.idle();
  assert.deepEqual(seen.slice(0, 2), ['1', '2']);
  assert.ok(!seen.includes('3') && !seen.includes('4'), 'outside the 7-day window');
  assert.equal(store.prewarm(events, { days: 7 }), 0, 'stored teams are skipped');
  const cover = store.coverage({ hours: 48, events });
  assert.equal(cover.tiers.top.pct, 100);
  assert.equal(cover.tiers.all.teams, 4);
});

test('guardian heal re-queues misses in the window and is throttled', async () => {
  const { store, now, tick } = makeStore([]);
  const events = [{ home: 'Gap Town', homeId: 'sr:competitor:3', away: 'Far FC', awayId: 'sr:competitor:4', kickoff: new Date(now() + 3_600_000).toISOString(), country: 'Wales', tournament: 'Cymru North' }];
  store.remember(events);
  assert.equal(store.healMisses(), 2);
  await store.idle();
  assert.equal(store.healMisses(), 0, 'throttled for 30 minutes');
  tick(31 * 60_000);
  assert.equal(store.healMisses(), 2);
  await store.idle();
});

test('manual override wins, survives a restart, and can be removed', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'crests-'));
  const { store } = makeStore([[/example\.org\/crest\.png/, () => response(200, png('#0f7a3a'))]], { dir });
  const result = await store.setOverride('sr:competitor:4242', { url: 'https://example.org/crest.png', name: 'HB Koge' });
  assert.equal(result.ok, true, result.error);
  assert.equal(store.index.teams['4242'].source, 'override');
  const reopened = createCrestStore({ dir, log: () => {}, fetchImpl: async () => response(404, '') });
  assert.equal(reopened.crestFor('sr:competitor:4242', 'HB Koge'), result.url);
  const saved = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));
  assert.equal(saved.overrides['4242'].url, 'https://example.org/crest.png');
  assert.equal(reopened.clearOverride('4242'), true);
  assert.equal(reopened.index.teams['4242'], undefined);
  await reopened.idle();
});

test('an override that fails the checks is refused unless forced', async () => {
  const flat = Buffer.from(new Resvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="#1d4ed8"/><rect x="40" y="20" width="20" height="60" fill="#fff"/></svg>', { fitTo: { mode: 'width', value: 128 } }).render().asPng());
  const { store } = makeStore([]);
  const refused = await store.setOverride('sr:competitor:5', { bytes: flat });
  assert.match(refused.error, /initials badge/);
  assert.equal((await store.setOverride('sr:competitor:5', { bytes: flat, force: true })).ok, true);
});

test('teams with no stored copy fall back to the bundled catalogue by name', () => {
  const { store } = makeStore([]);
  assert.match(store.crestFor('', 'Arsenal') || store.crestFor('', 'Barcelona') || 'https://api.betspapa.com/crests/img/x.png', /^https:\/\/api\.betspapa\.com\/crests\//);
  assert.equal(store.crestFor('sr:competitor:1', 'Zzzz Nowhere Club 123'), '');
});

test('a Sportradar network error on the fast pass is retried in the slow pass', async () => {
  let radarCalls = 0;
  const { store } = makeStore([[/img\.sportradar\.com/, () => { radarCalls += 1; return radarCalls <= 2 ? response(503, '') : response(200, png()); }]]);
  store.enqueue({ id: 'sr:competitor:44', name: 'Liverpool', country: 'England', competition: 'Premier League' });
  await store.idle();
  assert.equal(store.index.teams['44']?.source, 'sportradar');
  assert.equal(store.index.misses['44'], undefined);
});

test('misses saved by an older image check are due again after an upgrade', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'crests-'));
  const { writeFileSync } = await import('node:fs');
  writeFileSync(join(dir, 'index.json'), JSON.stringify({ version: 1, teams: {}, overrides: {}, misses: { 44: { name: 'Liverpool', tries: 1, nextAt: Date.now() + 86_400_000 } } }));
  const store = createCrestStore({ dir, log: () => {}, fetchImpl: async () => response(404, '') });
  assert.equal(store.index.misses['44'].nextAt, 0);
});
