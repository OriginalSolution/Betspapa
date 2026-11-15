import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { PENALTY_CAP, applyLeagueRisk, dangerousBand, leagueKeys, loadLeagueRisk, normaliseLeagueRisk, unknownLeagueMarkets } from './leagueRisk.mjs';

const event = { tournament: 'Premier League', country: 'Ghana' };

test('an empty table and a league with no band leave the pick alone', () => {
  const empty = normaliseLeagueRisk({ leagues: {} });
  assert.equal(dangerousBand(empty, event, 'over25', 1.4), null);
  assert.deepEqual(leagueKeys(event), ['ghana | premier league', 'premier league']);
  const other = normaliseLeagueRisk({
    leagues: { 'Serie A': [{ market: 'over25', min: 1.2, max: 1.49, action: 'exclude' }] },
  });
  assert.equal(dangerousBand(other, event, 'over25', 1.4), null);
});

test('a matching band is inclusive and a bad band is ignored', () => {
  const table = normaliseLeagueRisk({
    howTo: 'ignored',
    leagues: {
      'Ghana | Premier League': [
        { market: 'over25', min: 1.4, max: 1.49, action: 'exclude' },
        { market: 'home', min: 1.5, max: 1.2 },
      ],
      'Premier League': [{ market: '*', min: 1.2, max: 1.25, action: 'penalise' }],
    },
  });
  assert.equal(dangerousBand(table, event, 'over25', 1.4).action, 'exclude');
  assert.equal(dangerousBand(table, event, 'over25', 1.49).league, 'ghana | premier league');
  assert.equal(dangerousBand(table, event, 'over25', 1.39), null);
  assert.equal(dangerousBand(table, event, 'btts', 1.22).action, 'penalise');
  assert.equal(dangerousBand(table, event, 'btts', 1.3), null);
  assert.deepEqual(table.leagues['ghana | premier league'].map((band) => band.market), ['over25']);
});

test('exclude drops the pick and penalise caps a sure grade at 90%', () => {
  const graded = { rate: 1, hits: 10, sample: 10, agreement: 'agree', teamsAgree: true, keptBy: 'agree' };
  assert.equal(applyLeagueRisk(graded, { action: 'exclude' }), null);
  assert.equal(applyLeagueRisk(null, { action: 'penalise' }), null);
  const marked = applyLeagueRisk(graded, { action: 'penalise' });
  assert.equal(marked.rate, PENALTY_CAP);
  assert.equal(marked.leagueRisk, 'penalise');
  assert.equal(marked.keptBy, 'markdown');
  assert.equal(marked.hits, 10);
  const low = applyLeagueRisk({ ...graded, rate: 0.7, keptBy: 'teams' }, { action: 'penalise' });
  assert.equal(low.rate, 0.7);
  assert.equal(low.leagueRisk, 'penalise');
  assert.equal(low.keptBy, 'teams');
});

test('the shipped table is empty and a data-dir file replaces it', () => {
  const shipped = loadLeagueRisk({});
  assert.deepEqual(shipped.leagues, {});
  const dir = mkdtempSync(join(tmpdir(), 'league-risk-'));
  writeFileSync(join(dir, 'league-risk.json'), JSON.stringify({
    leagues: { 'Nations League': [{ market: 'over15', min: 1.2, max: 1.3, action: 'exclude' }] },
  }));
  const loaded = loadLeagueRisk({ ENGINE_DATA_DIR: dir });
  assert.equal(dangerousBand(loaded, { tournament: 'Nations League', country: 'International' }, 'over15', 1.25).action, 'exclude');
  writeFileSync(join(dir, 'league-risk.json'), '{');
  assert.deepEqual(loadLeagueRisk({ ENGINE_DATA_DIR: dir }).leagues, {});
  assert.deepEqual(unknownLeagueMarkets(loaded, ['over15']), []);
  assert.deepEqual(unknownLeagueMarkets(normaliseLeagueRisk({
    leagues: { 'League One': [{ market: 'not-a-market', min: 1.2, max: 1.3 }] },
  }), ['over15']), ['league one not-a-market']);
});
