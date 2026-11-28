import assert from 'node:assert/strict';
import test from 'node:test';
import { normaliseLeagueRisk } from './leagueRisk.mjs';
import { buildOccurrenceBoard, explainTip, lastForm, masterPick, measureMarket, mirroredRecords, OCCURRENCE_MARKETS, rateOf, teamRecords } from './occurrence.mjs';

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
      odds: { home: 1.35, 'over-15': 1.25, 'over-25': 1.05, 'btts-yes': 1.4, 'corners-over-85': 1.73, 'cards-over-35': 1.4 },
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
  assert.equal(markets.includes('btts'), false);
  assert.equal(markets.includes('corners-over85'), false);
  assert.equal(markets.includes('cards-over35'), false);
  assert.equal(markets.includes('home'), false);
  assert.equal(markets.includes('over25'), false);
  assert.equal(board.legs.some((leg) => leg.eventId !== 'sr:match:10'), false);
  const over = board.legs.find((leg) => leg.market === 'over15');
  assert.equal(over.occurrence, 100);
  assert.equal(over.sample, '10/10');
  assert.equal(over.odds, 1.25);
  const master = masterPick(board.legs.filter((leg) => leg.eventId === 'sr:match:10'));
  assert.equal(master.length, 1);
  assert.equal(master[0].market, 'over15');
  assert.equal(master[0].teamsAgree, true);
  const shown = board.byEvent['sr:match:10'].find((row) => row.market === 'home');
  assert.equal(shown.hits, 0);
  assert.equal(shown.sample, 10);
});

test('form and the opponent check come from the same history and stay quiet when the sample is short', () => {
  const homeRows = [
    ...played(5, (index) => row({ matchId: index + 1, uts: 50 - index, teamIsHome: true, ftHome: index === 0 ? 1 : 2, ftAway: index === 0 ? 1 : 0 })),
    ...played(5, (index) => row({ matchId: index + 10, uts: 20 - index, teamIsHome: true, ftHome: 0, ftAway: 3 })),
  ];
  const awayRows = played(8, (index) => row({ matchId: index + 40, uts: 80 - index, teamIsHome: false, ftHome: 2, ftAway: 0 }));
  const spoiled = played(8, (index) => row({ matchId: index + 60, uts: 80 - index, teamIsHome: false, ftHome: 0, ftAway: 2 }));
  const home = OCCURRENCE_MARKETS.find((market) => market.id === 'home');
  const over = OCCURRENCE_MARKETS.find((market) => market.id === 'over15');
  assert.deepEqual(lastForm(homeRows.filter((item) => item.teamIsHome)), ['W', 'W', 'W', 'W', 'D']);
  const held = explainTip(home, homeRows, awayRows);
  assert.deepEqual(held.form, ['W', 'W', 'W', 'W', 'D']);
  assert.equal(held.opponentHeld, true);
  assert.equal(explainTip(home, homeRows, spoiled).opponentHeld, null);
  const both = explainTip(over, homeRows, awayRows);
  assert.equal(both.opponentHeld, true);
  assert.ok(both.form && both.form.length === 5);
  assert.equal(explainTip(over, homeRows, []).opponentHeld, null);
  assert.equal(explainTip(over, [], []).form, null);
  const homePerfect = played(10, (index) => row({ matchId: index + 1, uts: 100 - index, teamIsHome: true, ftHome: 2, ftAway: 0 }));
  const awayPerfect = played(10, (index) => row({ matchId: index + 20, uts: 100 - index, teamIsHome: false, ftHome: 0, ftAway: 2 }));
  const score = OCCURRENCE_MARKETS.find((market) => market.id === 'home-score');
  assert.equal(score.oddsKey, 'home-over-05');
  assert.equal(OCCURRENCE_MARKETS.find((market) => market.id === 'away-score').oddsKey, 'away-over-05');
  assert.equal(mirroredRecords(home, homePerfect, awayPerfect).exception, true);
  assert.equal(mirroredRecords(home, homePerfect, awayRows).exception, false);
  assert.equal(mirroredRecords(score, homePerfect, awayRows).exception, false);
});

test('both teams have to support the outcome, and a one-sided 10/10 is not booked', () => {
  const over = (hits, teamIsHome, idStart, goals = 2) => played(10, (index) => row({
    matchId: idStart + index,
    uts: 200 - index,
    teamIsHome,
    ftHome: index < hits ? goals : 0,
    ftAway: 0,
  }));
  const homeMarket = OCCURRENCE_MARKETS.find((market) => market.id === 'home');
  const homeWins = played(10, (index) => row({ matchId: index + 1, uts: 100 - index, teamIsHome: true, ftHome: index < 8 ? 2 : 0, ftAway: 0 }));
  const awayLosses = played(10, (index) => row({ matchId: index + 30, uts: 100 - index, teamIsHome: false, ftHome: 2, ftAway: 0 }));
  const awayWins = played(10, (index) => row({ matchId: index + 50, uts: 100 - index, teamIsHome: false, ftHome: 0, ftAway: 2 }));
  assert.equal(teamRecords(homeMarket, homeWins, awayLosses).home.hits, 8);
  assert.equal(teamRecords(homeMarket, homeWins, awayLosses).away.hits, 10);
  assert.equal(teamRecords(homeMarket, homeWins, awayWins).away.hits, 0);

  const histories = new Map([
    [1, over(7, true, 1)],
    [2, over(6, false, 40)],
  ]);
  const split = new Map([
    [1, over(10, true, 1)],
    [2, over(2, false, 40)],
  ]);
  const event = {
    eventId: 'sr:match:30',
    home: 'Alpha',
    away: 'Beta',
    homeId: 'sr:competitor:1',
    awayId: 'sr:competitor:2',
    kickoff: '2026-11-13T18:00:00.000Z',
    tournament: 'Ghana Premier League',
    country: 'Ghana',
    odds: { 'over-15': 1.25, 'over-25': 1.4 },
  };
  const rescued = buildOccurrenceBoard([event], histories, now);
  const over15 = rescued.researchDrops.find((leg) => leg.market === 'over15');
  assert.equal(rescued.legs.some((leg) => leg.market === 'over15'), false);
  assert.equal(over15.publish, false);
  assert.match(over15.reasons.join(' '), /under 80%/);
  assert.match(over15.reasons.join(' '), /Both teams support/);
  const dropped = buildOccurrenceBoard([event], split, now);
  assert.equal(dropped.legs.some((leg) => leg.market === 'over15'), false);
  assert.match(dropped.notes.join('\n'), /scoring records did not support/);

  const risky = normaliseLeagueRisk({
    leagues: {
      'Ghana | Ghana Premier League': [
        { market: 'over15', min: 1.2, max: 1.3, action: 'exclude' },
        { market: 'over25', min: 1.4, max: 1.49, action: 'penalise' },
      ],
    },
  });
  const perfect = new Map([
    [1, over(10, true, 1, 3)],
    [2, over(10, false, 40, 3)],
  ]);
  const blocked = buildOccurrenceBoard([event], perfect, now, { leagueRisk: risky });
  assert.equal(blocked.legs.some((leg) => leg.market === 'over15'), false);
  const marked = blocked.legs.find((leg) => leg.market === 'over25');
  assert.equal(marked.rate, 0.9);
  assert.equal(marked.sample, '10/10');
  assert.equal(marked.leagueRisk, 'penalise');
  assert.equal(marked.occurrence, 90);
  assert.match(blocked.notes.join('\n'), /left off the code because that league/);
  assert.match(blocked.notes.join('\n'), /marked down/);
  assert.match(marked.reasons.join(' '), /scored/);
});

test('a league with rare overs blocks a short price without an owner table', () => {
  const goals = (count, idStart, total, uts) => played(count, (index) => row({
    matchId: idStart + index,
    uts: uts - index,
    teamIsHome: true,
    ftHome: total,
    ftAway: 0,
    tournament: 'Ghana Premier League',
  }));
  const histories = new Map([
    [1, goals(10, 1, 3, 50)],
    [2, goals(10, 20, 3, 40)],
    [3, goals(20, 100, 1, 500)],
  ]);
  const event = {
    eventId: 'sr:match:40',
    home: 'Alpha',
    away: 'Beta',
    homeId: 'sr:competitor:1',
    awayId: 'sr:competitor:2',
    kickoff: '2026-11-13T18:00:00.000Z',
    tournament: 'Ghana Premier League',
    country: 'Ghana',
    odds: { 'over-25': 1.4 },
  };
  const board = buildOccurrenceBoard([event], histories, now, { leagueRisk: { leagues: {} } });
  assert.equal(board.legs.some((leg) => leg.market === 'over25'), false);
  const drop = board.researchDrops.find((leg) => leg.market === 'over25');
  assert.ok(drop);
  assert.match(drop.reasons.join(' '), /blocked/);
  assert.match(drop.reasons.join(' '), /Ghana Premier League|ghana premier league/i);
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

test('team score lines back the higher-placed side and are dropped without a table', () => {
  const homeRows = played(10, (index) => row({ matchId: index + 1, uts: 100 - index, teamIsHome: true, ftHome: 2, ftAway: 1 }));
  const awayRows = played(10, (index) => row({ matchId: index + 40, uts: 100 - index, teamIsHome: false, ftHome: 1, ftAway: 2 }));
  const histories = new Map([[1, homeRows], [2, awayRows]]);
  const base = {
    home: 'Alpha',
    away: 'Beta',
    homeId: 'sr:competitor:1',
    awayId: 'sr:competitor:2',
    kickoff: '2026-11-13T18:00:00.000Z',
    odds: { 'home-over-05': 1.22, 'away-over-05': 1.22, 'over-15': 1.25 },
  };
  const weakerHome = buildOccurrenceBoard([{ ...base, eventId: 'sr:match:20', hpos: 8, apos: 2 }], histories, now);
  const markets = weakerHome.legs.filter((leg) => leg.eventId === 'sr:match:20').map((leg) => leg.market);
  assert.equal(markets.includes('away-score'), true);
  assert.equal(markets.includes('home-score'), false);
  assert.equal(markets.includes('over15'), true);
  assert.match(weakerHome.notes.join('\n'), /home-score left off: away is higher on the table/);

  const noTable = buildOccurrenceBoard([{ ...base, eventId: 'sr:match:21' }], histories, now);
  const hidden = noTable.legs.filter((leg) => leg.eventId === 'sr:match:21').map((leg) => leg.market);
  assert.equal(hidden.includes('home-score'), false);
  assert.equal(hidden.includes('away-score'), false);
  assert.equal(hidden.includes('over15'), true);
  assert.match(noTable.notes.join('\n'), /no league table, so the side was not guessed/);
});
