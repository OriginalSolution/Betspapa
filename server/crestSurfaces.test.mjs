import assert from 'node:assert/strict';
import test from 'node:test';
import { crestSurfaces } from './crestSurfaces.mjs';
import { paintEngineCrests } from './engine.mjs';

const crestFor = (id) => (id === 'sr:competitor:1' || id === 'sr:competitor:2' ? `https://api.betspapa.com/crests/id/${String(id).split(':').pop()}.png` : '');

test('each surface counts a real file, a shield, and a url whose file is missing', () => {
  const events = [
    { eventId: 'sr:match:1', home: 'Arsenal', away: 'Chelsea', homeId: 'sr:competitor:1', awayId: 'sr:competitor:2', kickoff: '2026-11-23T15:00:00.000Z' },
    { eventId: 'sr:match:2', home: 'Kibera', away: 'Naivas', homeId: 'sr:competitor:9', awayId: 'sr:competitor:8', kickoff: '2026-11-23T12:00:00.000Z' },
  ];
  const engine = {
    master: { legs: [{ eventId: 'sr:match:1', market: 'over15' }] },
    trends: [{ legs: [{ eventId: 'sr:match:2', market: 'over25' }] }],
  };
  const codes = {
    days: ['2026-11-23'],
    strategies: [{ id: 'shield', week: { parts: [{ legs: [{ home: 'Nantes', away: 'Grenoble', homeId: 'sr:competitor:1', awayId: 'sr:competitor:9' }] }] } }],
    dailies: {},
  };
  const rows = crestSurfaces({ events, engine, codes, crestFor, fileExists: (url) => url.endsWith('/1.png') || url.endsWith('/2.png') });
  const today = rows.find((row) => row.name === 'today');
  assert.equal(today.real, 2);
  assert.equal(today.shield, 2);
  assert.equal(today.missing.includes('Kibera'), true);
  const picks = rows.find((row) => row.name === 'picks');
  assert.equal(picks.real, 2);
  assert.equal(picks.shield, 2);
  const codesRow = rows.find((row) => row.name === 'codes');
  assert.equal(codesRow.real, 1);
  assert.equal(codesRow.shield, 1);
});

test('engine crests come from the fixture, and a missing file stays empty', () => {
  const view = paintEngineCrests(
    { master: { legs: [{ eventId: 'sr:match:1', market: 'over15' }, { eventId: 'sr:match:9', market: 'over25' }] }, trends: [] },
    [{ eventId: 'sr:match:1', home: 'Arsenal', away: 'Chelsea', homeId: 'sr:competitor:1', awayId: 'sr:competitor:9' }],
    crestFor,
  );
  assert.match(view.master.legs[0].homeCrest, /\/1\.png$/);
  assert.equal(view.master.legs[0].awayCrest, null);
  assert.equal(view.master.legs[1].homeCrest, undefined);
});

test('code legs count the crest URL they carry', async () => {
  const { crestSurfaces } = await import('./crestSurfaces.mjs');
  const codes = {
    strategies: [{ id: 's', week: { parts: [{ legs: [{ home: 'A', away: 'B', homeCrest: 'https://api.betspapa.com/crests/id/1.png?v=a', awayCrest: '' }] }] } }],
    days: [],
    dailies: {},
  };
  const row = crestSurfaces({ codes, crestFor: () => '' }).find((item) => item.name === 'codes');
  assert.equal(row.real, 1);
  assert.equal(row.shield, 1);
});
