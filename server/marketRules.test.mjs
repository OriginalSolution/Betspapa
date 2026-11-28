import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { buildOccurrenceBoard } from './occurrence.mjs';
import { loadMarketRules, normaliseMarketRules, resetMarketRules } from './marketRules.mjs';
import { priceInRange } from './oddsRange.mjs';
import { minConfidence } from './thresholds.mjs';

const now = new Date('2026-11-13T12:00:00.000Z');

function row(partial = {}) {
  return {
    matchId: 1,
    uts: 1,
    teamIsHome: true,
    neutral: false,
    ftHome: 2,
    ftAway: 1,
    htHome: 1,
    htAway: 0,
    tournament: 'Friendly',
    ...partial,
  };
}

/** `hits` games clear over 1.5, both teams score, a home win, and a second-half goal. The rest are 0-0. */
function games(count, hits, idStart, teamIsHome) {
  return Array.from({ length: count }, (_, index) => {
    const on = index < hits;
    return row({
      matchId: idStart + index,
      uts: 800 - index,
      teamIsHome,
      ftHome: on ? 2 : 0,
      ftAway: on ? 1 : 0,
      htHome: on ? 1 : 0,
      htAway: 0,
    });
  });
}

function event(id, odds) {
  return {
    eventId: id,
    home: 'Alpha',
    away: 'Beta',
    homeId: 'sr:competitor:1',
    awayId: 'sr:competitor:2',
    kickoff: '2026-11-13T18:00:00.000Z',
    tournament: 'Friendly',
    country: 'International',
    odds,
  };
}

function boardFor(homeHits, awayHits, odds) {
  const histories = new Map([
    [1, games(10, homeHits, 1, true)],
    [2, games(10, awayHits, 100, false)],
  ]);
  return buildOccurrenceBoard([event('sr:match:1', odds)], histories, now, {
    leagueIndex: new Map(),
    leagueRisk: { leagues: {} },
  });
}

function published(board) {
  return board.legs.map((leg) => leg.market).sort();
}

describe('market thresholds', { concurrency: 1 }, () => {
test('several markets publish only inside their odds band and at 80% or better', () => {
  resetMarketRules();
  const kept = boardFor(8, 8, {
    'over-15': 1.25,
    home: 1.3,
    'btts-yes': 1.4,
    'sh-over-05': 1.2,
    'dc-12': 1.22,
  });
  for (const market of ['over15', 'home', 'btts', 'sh-over05']) {
    assert.equal(kept.legs.some((leg) => leg.market === market && leg.rate + 1e-12 >= 0.8), true, market);
  }
  assert.equal(kept.legs.some((leg) => leg.market === 'dc-12'), false);

  const weak = boardFor(10, 6, {
    'over-15': 1.25,
    home: 1.3,
    'btts-yes': 1.4,
    'sh-over-05': 1.2,
    'dc-12': 1.22,
  });
  assert.deepEqual(published(weak), []);
  assert.match(weak.notes.join('\n'), /under that market's minimum/);

  const pricedOut = boardFor(10, 10, {
    'over-15': 1.7,
    home: 1.7,
    'btts-yes': 1.7,
    'sh-over-05': 1.7,
    'dc-12': 1.7,
  });
  assert.deepEqual(published(pricedOut), []);
});

test('a rules file can raise one market without moving the others', () => {
  const dir = mkdtempSync(join(tmpdir(), 'betspapa-rules-'));
  const file = join(dir, 'market-rules.json');
  writeFileSync(file, JSON.stringify({
    markets: {
      over15: { minConfidence: 0.9, max: 1.22 },
      'not-a-market': { minConfidence: 0.5, min: 1.01, max: 5 },
      home: { min: 2, max: 1.1 },
    },
  }));
  const previous = process.env.MARKET_RULES_PATH;
  process.env.MARKET_RULES_PATH = file;
  try {
    const rules = loadMarketRules();
    assert.equal(rules.markets.over15.minConfidence, 0.9);
    assert.equal(rules.markets.over15.max, 1.22);
    assert.equal(rules.markets['not-a-market'], undefined);
    assert.equal(rules.markets.home, undefined);
    assert.equal(minConfidence('over15'), 0.9);
    assert.equal(minConfidence('btts'), 0.8);
    assert.equal(priceInRange('over15', 1.25), false);
    assert.equal(priceInRange('over15', 1.22), true);
    assert.equal(priceInRange('home', 1.49), true);
    const board = boardFor(8, 8, { 'over-15': 1.22, 'btts-yes': 1.4 });
    assert.equal(board.legs.some((leg) => leg.market === 'over15'), false);
    assert.equal(board.legs.some((leg) => leg.market === 'btts' && leg.rate === 0.8), true);
  } finally {
    if (previous == null) delete process.env.MARKET_RULES_PATH;
    else process.env.MARKET_RULES_PATH = previous;
    resetMarketRules();
  }
});

test('a broken rules file keeps the built-in bands', () => {
  assert.deepEqual(normaliseMarketRules(null).markets, {});
  assert.equal(normaliseMarketRules({ markets: { over15: { minConfidence: 2 } } }).markets.over15, undefined);
});
});
