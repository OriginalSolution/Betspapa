import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOccurrenceBoard, masterPick, measureMarket, OCCURRENCE_MARKETS, rateOf } from './occurrence.mjs';

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
    cornersHome: null,
    cornersAway: null,
    cardsHome: null,
    cardsAway: null,
    ...partial,
  };
}

function played(count, make) {
  return Array.from({ length: count }, (_, index) => make(index));
}

test('market ids are unique and the goal lines use the app ids', () => {
  const ids = OCCURRENCE_MARKETS.map((market) => market.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(OCCURRENCE_MARKETS.find((market) => market.id === 'over15').oddsKey, 'over-15');
  assert.equal(OCCURRENCE_MARKETS.find((market) => market.id === 'home-score').oddsKey, 'home-over-05');
  assert.equal(OCCURRENCE_MARKETS.find((market) => market.id === 'home-over15').label, 'Home over 1.5 goals');
});

test('needs eight of the last ten and keeps exactly 80%', () => {
  const wins = played(8, (index) => row({ matchId: index + 1, uts: 100 - index, ftHome: 2, ftAway: 0 }));
  const losses = played(2, (index) => row({ matchId: index + 20, uts: 10 - index, ftHome: 0, ftAway: 1 }));
  const home = OCCURRENCE_MARKETS.find((market) => market.id === 'home');
  const rate = rateOf([...wins, ...losses], home.hit);
  assert.deepEqual({ hits: rate.hits, sample: rate.sample }, { hits: 8, sample: 10 });
  assert.equal(rate.rate, 0.8);
  const thin = rateOf(wins.slice(0, 7), home.hit);
  assert.equal(thin, null);
});

test('books every 80% line with a price, one master leg per match, and skips SRL and short prices', () => {
  const homeRows = played(10, (index) => row({ matchId: index + 1, uts: 100 - index, ftHome: 1, ftAway: 1, cornersHome: 6, cornersAway: 4, cardsHome: 3, cardsAway: 2 }));
  const awayRows = played(10, (index) => row({ matchId: index + 50, uts: 100 - index, teamIsHome: false, ftHome: 0, ftAway: 3, cornersHome: 2, cornersAway: 7, cardsHome: 1, cardsAway: 3 }));
  const histories = new Map([
    [1, homeRows],
    [2, awayRows],
  ]);
  const events = [
    {
      eventId: 'sr:match:10',
      home: 'Alpha',
      away: 'Beta',
      homeId: 'sr:competitor:1',
      awayId: 'sr:competitor:2',
      kickoff: '2026-11-13T18:00:00.000Z',
      tournament: 'Nations League',
      country: 'International',
      odds: { home: 3, 'over-15': 1.7, 'over-25': 1.19, 'btts-yes': 1.8, 'corners-over-85': 1.73, 'cards-over-35': 1.4 },
    },
    {
      eventId: 'sr:match:11',
      home: 'Alpha SRL',
      away: 'Beta',
      homeId: 'sr:competitor:1',
      awayId: 'sr:competitor:2',
      kickoff: '2026-11-13T19:00:00.000Z',
      tournament: 'UEFA Nations League SRL',
      country: 'Simulated Reality League',
      odds: { home: 1.5, 'over-15': 1.5 },
    },
    {
      eventId: 'sr:match:12',
      home: 'Old',
      away: 'Side',
      homeId: 'sr:competitor:1',
      awayId: 'sr:competitor:2',
      kickoff: '2026-11-13T09:00:00.000Z',
      odds: { home: 1.5 },
    },
  ];
  const board = buildOccurrenceBoard(events, histories, now);
  const markets = board.legs.filter((leg) => leg.eventId === 'sr:match:10').map((leg) => leg.market);
  assert.ok(markets.includes('over15'));
  assert.ok(markets.includes('btts'));
  assert.ok(markets.includes('corners-over85'));
  assert.ok(markets.includes('cards-over35'));
  assert.equal(markets.includes('home'), false);
  assert.equal(markets.includes('over25'), false);
  assert.equal(board.legs.some((leg) => leg.eventId !== 'sr:match:10'), false);
  const over = board.legs.find((leg) => leg.market === 'over15');
  assert.equal(over.occurrence, 100);
  assert.equal(over.sample, '10/10');
  assert.equal(over.odds, 1.7);
  const master = masterPick(board.legs.filter((leg) => leg.eventId === 'sr:match:10'));
  assert.equal(master.length, 1);
  assert.equal(master[0].market, 'btts');
  const shown = board.byEvent['sr:match:10'].find((row) => row.market === 'home');
  assert.equal(shown.hits, 0);
  assert.equal(shown.sample, 10);
});

test('a home trend uses home games only and ignores neutral grounds', () => {
  const rows = [
    ...played(8, (index) => row({ matchId: index + 1, uts: 40 - index, teamIsHome: true, ftHome: 1, ftAway: 0 })),
    ...played(4, (index) => row({ matchId: index + 30, uts: 10 - index, teamIsHome: true, neutral: true, ftHome: 0, ftAway: 3 })),
  ];
  const home = OCCURRENCE_MARKETS.find((market) => market.id === 'home');
  const rate = measureMarket(home, rows, []);
  assert.equal(rate.hits, 8);
  assert.equal(rate.sample, 8);
});
