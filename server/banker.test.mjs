import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { rulesFor, SHIELD_GA_RATIO, U45_LEG_MAX, U45_O25_XG } from './bankerConfig.mjs';
import { createBanker } from './banker.mjs';
import { defenceFor } from './bankerDefence.mjs';
import { dropReason, isCupLeague, tableClash } from './bankerFilters.mjs';
import { gradeBanker, mismatchNote } from './bankerGrade.mjs';
import { findAhMinus1 } from './bankerMarkets.mjs';
import { parseShare, sameSelections } from './bankerRead.mjs';
import { assemble, pickLeg, priceStillOk, under45Expected } from './bankerRules.mjs';
import { createResults } from './results.mjs';
import { channelFor } from './push.mjs';

const clock = Date.parse('2026-11-23T07:00:00.000Z');

function game(patch = {}) {
  return {
    eventId: 'sr:match:1',
    home: 'Nantes',
    away: 'Grenoble Foot',
    country: 'France',
    league: 'Ligue 2',
    cup: false,
    kickMs: clock + 86400000,
    open: true,
    senior: true,
    ah: { side: 'H', price: 1.55, spec: 'hcp=-1', oid: '1711' },
    fav1x2: 1.45,
    up2: { mid: '60100', spec: '', oid: '1', price: 1.32 },
    up1: { mid: '60200', spec: '', oid: '1', price: 1.22 },
    o25: { mid: '18', spec: 'total=2.5', oid: '12', price: 1.44 },
    teamO15: { mid: '19', spec: 'total=1.5', oid: '12', price: 1.35 },
    hpos: 8,
    apos: 14,
    tableN: 18,
    defence: null,
    awayForm: null,
    weakScored: 7,
    weakN: 10,
    favScored2: 4,
    capable: true,
    busy: false,
    ...patch,
  };
}

test('name filters keep Willem II and II Liga, and drop Jong, U21 and women', () => {
  assert.equal(dropReason('Netherlands', 'Eredivisie', 'Willem II', 'Ajax'), '');
  assert.equal(dropReason('Poland', 'II Liga', 'Pogon', 'Wisla'), '');
  assert.equal(dropReason('France', 'Ligue 2', 'Nantes', 'Grenoble'), '');
  assert.match(dropReason('Netherlands', 'Eredivisie', 'Jong Ajax', 'Ajax'), /Jong/);
  assert.match(dropReason('England', 'Premier League 2', 'Arsenal U21', 'Chelsea'), /youth|U-age|reserve/i);
  assert.match(dropReason('Spain', 'Liga F', 'Barcelona', 'Madrid'), /youth|women/i);
  assert.equal(isCupLeague('FA Cup'), true);
  assert.equal(isCupLeague('Ligue 2'), false);
  assert.equal(tableClash(2, 4, 20), 'top-5 v top-5');
  assert.equal(tableClash(8, 14, 18), '');
});

test('AH −1 reads the home giving line and the away giving line', () => {
  const home = findAhMinus1({ markets: [{ id: '16', specifier: 'hcp=-1', outcomes: [{ id: '1711', desc: 'Home', odds: '1.7', isActive: 1 }] }] });
  assert.equal(home.side, 'H');
  assert.equal(home.price, 1.7);
  const away = findAhMinus1({ markets: [{ id: '16', specifier: 'hcp=+1', outcomes: [{ id: '1713', desc: 'Away -1', odds: '1.9', isActive: 1 }] }] });
  assert.equal(away.side, 'A');
});

test('strategies follow their own prices and the HARD cap is not applied', () => {
  const classic = pickLeg('classic', game());
  assert.equal(classic.label, 'Home 2UP');
  const high = pickLeg('classic', game({ ah: { side: 'H', price: 1.9, spec: 'hcp=-1', oid: '1' }, up1: null }));
  assert.equal(high.drop, 'no 1UP');
  const gold = pickLeg('gold', game({ o25: { mid: '18', spec: 'total=2.5', oid: '12', price: 1.44 } }));
  assert.equal(gold.drop, 'Over 2.5 not under 1.40');
  const shield = pickLeg('shield', game({ defence: { found: true, missing: false, good: false } }));
  assert.equal(shield.label, 'Over 2.5');
  const leaky = pickLeg('shield', game({ defence: { found: true, missing: false, good: false }, o25: { mid: '18', spec: 'total=2.5', oid: '12', price: 1.97 } }));
  assert.match(leaky.drop, /1\.60/);
  const thin = pickLeg('shield', game({ defence: { found: true, missing: true } }));
  assert.equal(thin.drop, 'no defence data');
  const capped = pickLeg('capped', game({ ah: { side: 'H', price: 1.7, spec: 'hcp=-1', oid: '1' }, up2: { mid: '60100', spec: '', oid: '1', price: 1.7 }, teamO15: { mid: '19', spec: 'total=1.5', oid: '12', price: 1.4 } }));
  assert.equal(capped.label, 'Home 2+');
  const ladder = pickLeg('ladder', game({ o25: { mid: '18', spec: 'total=2.5', oid: '12', price: 1.7 } }));
  assert.equal(ladder.label, 'Home 2UP');
  const rare = pickLeg('ladder', game({ weakScored: 2, favScored2: 6 }));
  assert.equal(rare.label, 'Home 2+');
  const cup = pickLeg('classic', game({ cup: true, hpos: 1, apos: 1, tableN: 4 }));
  assert.equal(cup.label, 'Home 2UP');
  const clash = pickLeg('classic', game({ hpos: 1, apos: 2, tableN: 20 }));
  assert.equal(clash.drop, 'top-5 v top-5');
});

function goalSample(scoredAvg, concededAvg, scoredGames = 8, n = 10) {
  return { n, scoredAvg, concededAvg, scoredGames };
}

function underGame(patch = {}) {
  return {
    eventId: 'sr:match:45',
    home: 'Frosinone',
    away: 'Parma',
    country: 'Italy',
    league: 'Serie B',
    kickMs: clock + 86400000,
    open: true,
    u45: { mid: '18', spec: 'total=4.5', oid: '13', price: 1.32 },
    o15: { mid: '18', spec: 'total=1.5', oid: '12', price: 1.28 },
    o25: { mid: '18', spec: 'total=2.5', oid: '12', price: 1.44 },
    homeGoals: goalSample(1.6, 1.2),
    awayGoals: goalSample(1.4, 1.3),
    hpos: 8,
    apos: 14,
    tableN: 18,
    ...patch,
  };
}

test('Under 4.5 Goals uses last-10 averages and ignores the general odds table', () => {
  const base = underGame();
  assert.equal(Number(under45Expected(base.homeGoals, base.awayGoals).toFixed(2)), 2.75);
  const over15 = pickLeg('under45', base);
  assert.equal(over15.label, 'Over 1.5');
  assert.equal(over15.odds, 1.28);
  const keptShort = pickLeg('under45', underGame({ o15: { mid: '18', spec: 'total=1.5', oid: '12', price: 1.18 } }));
  assert.equal(keptShort.label, 'Over 1.5');
  assert.equal(keptShort.odds, 1.18);
  const atFloor = pickLeg('under45', underGame({ o15: { mid: '18', spec: 'total=1.5', oid: '12', price: 1.17 } }));
  assert.equal(atFloor.label, 'Over 1.5');
  const filter = pickLeg('under45', underGame({ u45: { mid: '18', spec: 'total=4.5', oid: '13', price: 1.25 } }));
  assert.equal(filter.drop, 'Under 4.5 not above 1.25');
  const thin = pickLeg('under45', underGame({ homeGoals: goalSample(1.0, 0.6), awayGoals: goalSample(0.9, 0.5) }));
  assert.match(thin.drop, /under 2\.00/);
  const pushed = pickLeg('under45', underGame({
    homeGoals: goalSample(2.0, 1.4, 8),
    awayGoals: goalSample(1.8, 1.6, 8),
    o15: { mid: '18', spec: 'total=1.5', oid: '12', price: 1.1 },
    o25: { mid: '18', spec: 'total=2.5', oid: '12', price: 1.44 },
  }));
  assert.equal(under45Expected(goalSample(2.0, 1.4, 8), goalSample(1.8, 1.6, 8)) >= U45_O25_XG, true);
  assert.equal(pushed.label, 'Over 2.5');
  assert.equal(pushed.odds, 1.44);
  const shortStay = pickLeg('under45', underGame({ o15: { mid: '18', spec: 'total=1.5', oid: '12', price: 1.1 } }));
  assert.equal(shortStay.drop, 'Over 1.5 under 1.17 and goal stats miss Over 2.5');
  const dear = pickLeg('under45', underGame({
    homeGoals: goalSample(2.0, 1.4, 8),
    awayGoals: goalSample(1.8, 1.6, 8),
    o25: { mid: '18', spec: 'total=2.5', oid: '12', price: 1.55 },
  }));
  assert.equal(dear.drop, 'Over 2.5 over 1.50');
  const quiet = pickLeg('under45', underGame({
    homeGoals: goalSample(2.0, 1.4, 4),
    awayGoals: goalSample(1.8, 1.6, 4),
    o15: { mid: '18', spec: 'total=1.5', oid: '12', price: 1.22 },
  }));
  assert.equal(quiet.label, 'Over 1.5');
  assert.equal(pickLeg('under45', underGame({ blacklisted: true })).drop, 'blacklisted');
  assert.match(pickLeg('under45', underGame({ home: 'Jong Ajax' })).drop, /Jong|reserve/);
  assert.equal(priceStillOk('under45', { odds: 1.18, specifier: 'total=1.5' }), true);
  assert.equal(priceStillOk('under45', { odds: 1.1, specifier: 'total=1.5' }), false);
  assert.equal(priceStillOk('under45', { odds: U45_LEG_MAX + 0.01, specifier: 'total=2.5' }), false);
  const many = Array.from({ length: 51 }, (_, index) => underGame({ eventId: `sr:match:${index + 1}`, kickMs: clock + index * 1000 }));
  const built = assemble('under45', many, { slot: 'week' });
  assert.equal(built.legs.length, 51);
  assert.match(rulesFor('under45').join(' '), /2\.8/);
  assert.match(rulesFor('under45').join(' '), /above 1\.25/);
  assert.match(rulesFor('under45').join(' '), /does not use the general odds table/);
  const plusShort = pickLeg('under45plus', underGame({
    homeGoals: goalSample(2.0, 1.4, 8),
    awayGoals: goalSample(1.8, 1.6, 8),
    o25: { mid: '18', spec: 'total=2.5', oid: '12', price: 1.28 },
  }));
  assert.equal(plusShort.drop, 'Over 2.5 under 1.29');
  const plusFloor = pickLeg('under45plus', underGame({
    homeGoals: goalSample(2.0, 1.4, 8),
    awayGoals: goalSample(1.8, 1.6, 8),
    o15: { mid: '18', spec: 'total=1.5', oid: '12', price: 1.1 },
    o25: { mid: '18', spec: 'total=2.5', oid: '12', price: 1.29 },
  }));
  assert.equal(plusFloor.label, 'Over 2.5');
  assert.equal(plusFloor.odds, 1.29);
  const plusStay = pickLeg('under45plus', underGame({ o15: { mid: '18', spec: 'total=1.5', oid: '12', price: 1.29 } }));
  assert.equal(plusStay.label, 'Over 1.5');
  assert.equal(plusStay.odds, 1.29);
  const plusPush = pickLeg('under45plus', underGame({ o15: { mid: '18', spec: 'total=1.5', oid: '12', price: 1.18 } }));
  assert.equal(plusPush.drop, 'Over 1.5 under 1.29 and goal stats miss Over 2.5');
  assert.equal(priceStillOk('under45plus', { odds: 1.28, specifier: 'total=2.5' }), false);
  assert.equal(priceStillOk('under45plus', { odds: 1.29, specifier: 'total=1.5' }), true);
  assert.equal(priceStillOk('under45plus', { odds: 1.5, specifier: 'total=2.5' }), true);
  assert.equal(priceStillOk('under45plus', { odds: 1.51, specifier: 'total=2.5' }), false);
  const plusMany = Array.from({ length: 51 }, (_, index) => underGame({
    eventId: `sr:match:${index + 1}`,
    kickMs: clock + index * 1000,
    o15: { mid: '18', spec: 'total=1.5', oid: '12', price: 1.3 },
  }));
  assert.equal(assemble('under45plus', plusMany, { slot: 'week' }).legs.length, 51);
  assert.match(rulesFor('under45plus').join(' '), /1\.29 to 1\.50/);
  assert.match(rulesFor('under45').join(' '), /below 1\.17/);
  assert.equal(pickLeg('under45', underGame({ hpos: 0, apos: 0, tableN: 0 })).drop, 'no league table');
  assert.equal(pickLeg('under45', underGame({ hpos: 2, apos: 4, tableN: 20 })).drop, 'top-5 v top-5');
  assert.equal(pickLeg('under45plus', underGame({ hpos: 18, apos: 20, tableN: 20 })).drop, 'bottom-3 v bottom-3');
  assert.equal(pickLeg('under45', underGame({ hpos: 2, apos: 18, tableN: 20 })).label, 'Over 1.5');
  assert.match(rulesFor('under45').join(' '), /Top-5 v top-5/);
  assert.match(rulesFor('under45plus').join(' '), /bottom-3 v bottom-3/);
});

test('overlap is counted inside one strategy, and Ladder has no week code', () => {
  const counts = new Map([['sr:match:1', 2]]);
  const blocked = assemble('classic', [game()], { slot: 'daily', counts });
  assert.equal(blocked.legs.length, 0);
  assert.match(blocked.dropped[0].reason, /2 codes/);
  const week = assemble('ladder', [game()], { slot: 'week' });
  assert.equal(week.legs.length, 0);
  assert.match(week.note, /dailies only/);
});

test('Shield needs six venue games and conceded goals at or below the league average', () => {
  assert.equal(SHIELD_GA_RATIO, 1);
  const rows = (homePlayed, homeAgainst, otherPlayed, otherAgainst) => ({
    tablerows: [
      { team: { uid: 1 }, total: homePlayed, home: homePlayed, away: 0, goalsAgainstTotal: homeAgainst, goalsAgainstHome: homeAgainst, goalsAgainstAway: 0, pos: 4 },
      { team: { uid: 2 }, total: otherPlayed, home: otherPlayed, away: 0, goalsAgainstTotal: otherAgainst, goalsAgainstHome: otherAgainst, goalsAgainstAway: 0, pos: 8 },
    ],
  });
  const opts = { minVenueGames: 6, gaRatio: SHIELD_GA_RATIO };
  assert.equal(defenceFor(rows(5, 4, 10, 10), 1, 'H', opts).missing, true);
  assert.equal(defenceFor(rows(8, 12, 10, 10), 1, 'H', opts).good, false);
  assert.equal(defenceFor(rows(10, 10, 10, 10), 1, 'H', opts).good, true);
  assert.equal(defenceFor(rows(10, 9, 10, 10), 1, 'H', opts).good, true);
  assert.equal(defenceFor(rows(10, 12, 10, 10), 1, 'H', opts).good, false);
  assert.match(rulesFor('shield').join(' '), /at or below the league average/);
  assert.match(rulesFor('shield').join(' '), /under 1\.60/);
});

test('2UP uses the goal timeline and an AH −1 one-goal win is void', () => {
  const ft = { home: 2, away: 1 };
  const timeline = [
    { type: 'goal', result: { home: 0, away: 1 } },
    { type: 'goal', result: { home: 1, away: 1 } },
    { type: 'goal', result: { home: 2, away: 1 } },
  ];
  assert.equal(gradeBanker('2up-home', ft, timeline), 'lost');
  assert.equal(gradeBanker('1up-home', ft, timeline), 'won');
  assert.equal(gradeBanker('2up-away', ft, timeline), 'lost');
  assert.equal(gradeBanker('ah-1-home', { home: 1, away: 0 }, null), 'void');
  assert.equal(gradeBanker('ah-1-home', { home: 2, away: 0 }, null), 'won');
  assert.equal(gradeBanker('over25', { home: 2, away: 0 }, null), 'lost');
  assert.equal(gradeBanker('over15', { home: 1, away: 0 }, null), 'lost');
  assert.equal(gradeBanker('over15', { home: 2, away: 0 }, null), 'won');
  assert.equal(gradeBanker('2up-home', ft, [{ type: 'goal', result: { home: 1, away: 0 } }]), 'open');
  assert.equal(mismatchNote('won', 'lost'), 'Sportradar says won. The share readback says lost.');
  assert.equal(mismatchNote('lost', 'lost'), '');
});

test('a share code is shown only when the readback is the Banker markets', () => {
  const good = parseShare('APWHWQ', {
    bizCode: 10000,
    data: {
      shareCode: 'APWHWQ',
      outcomes: [{
        eventId: 'sr:match:9',
        homeTeamName: 'Nantes',
        awayTeamName: 'Grenoble',
        homeTeamId: 'sr:competitor:1',
        awayTeamId: 'sr:competitor:2',
        estimateStartTime: clock,
        matchStatus: 'Not start',
        markets: [{ id: '60100', specifier: null, outcomes: [{ id: '1', desc: 'Home', odds: '1.32', isActive: 1 }] }],
      }],
    },
  });
  assert.equal(good.ok, true);
  assert.equal(good.legs[0].homeCrest, 'https://api.betspapa.com/crests/id/1.png');
  const plain = parseShare('APWHWQ', {
    bizCode: 10000,
    data: {
      shareCode: 'APWHWQ',
      outcomes: [{
        eventId: 'sr:match:9',
        homeTeamName: 'Nantes',
        awayTeamName: 'Grenoble',
        matchStatus: 'Not start',
        markets: [{ id: '1', outcomes: [{ id: '1', desc: 'Home', odds: '1.4', isActive: 1 }] }],
      }],
    },
  });
  assert.equal(plain.ok, false);
  assert.equal(sameSelections(good.legs, good.legs), true);
});

test('seed codes are read back and a refresh never books', async () => {
  const posts = [];
  const request = async (method, url) => {
    posts.push(method);
    const code = String(url).match(/share\/([A-Za-z0-9]+)/)?.[1];
    if (method === 'POST') return { bizCode: 10000, data: { shareCode: 'SHOULDNOT' } };
    if (code === 'APWHWQ' && String(url).includes('sportybet')) {
      return {
        bizCode: 10000,
        data: {
          shareCode: 'APWHWQ',
          outcomes: [{
            eventId: 'sr:match:9',
            homeTeamName: 'Nantes',
            awayTeamName: 'Grenoble',
            homeTeamId: 'sr:competitor:1641',
            awayTeamId: 'sr:competitor:1646',
            estimateStartTime: clock + 3600000,
            matchStatus: 'Not start',
            markets: [{ id: '18', specifier: 'total=2.5', outcomes: [{ id: '12', desc: 'Over 2.5', odds: '1.97', isActive: 1 }] }],
          }],
        },
      };
    }
    if (code === 'APWHWQ') {
      return {
        bizCode: 10000,
        data: {
          shareCode: 'APWHWQ',
          outcomes: [{
            eventId: 'sr:match:9',
            homeTeamName: 'Nantes',
            awayTeamName: 'Grenoble',
            estimateStartTime: clock + 3600000,
            matchStatus: 'Not start',
            markets: [{ id: '18', specifier: 'total=2.5', outcomes: [{ id: '12', desc: 'Over 2.5', odds: '1.97', isActive: 1 }] }],
          }],
        },
      };
    }
    return { bizCode: 19000, message: 'missing' };
  };
  const dir = mkdtempSync(join(tmpdir(), 'banker-'));
  const results = createResults({ dir: join(dir, 'results'), now: () => clock });
  const banker = createBanker({ dir, request, now: () => clock, results, book: true });
  const view = await banker.refresh();
  assert.equal(posts.includes('POST'), false);
  assert.equal(view.reading, false);
  assert.equal(view.oddsLabel, 'Banker rules - own odds limits');
  const shield = view.strategies.find((row) => row.id === 'shield');
  assert.equal(shield.week.parts.length, 1);
  assert.equal(shield.week.parts[0].code, 'APWHWQ');
  assert.equal(shield.week.parts[0].highRisk, true);
  assert.equal(shield.week.parts[0].football, true);
  const classic = view.strategies.find((row) => row.id === 'classic');
  assert.equal(classic.week.parts.length, 0);
  assert.match(classic.week.empty, /No week code/);
  const ladder = view.strategies.find((row) => row.id === 'ladder');
  assert.match(ladder.week.empty, /dailies only/);
  await banker.tick();
  assert.equal(posts.includes('POST'), false);
  assert.equal(channelFor('code', { goalSound: 'crowd' }), 'betspapa.goal.crowd.v4');
});

test('the results tracker grades a Banker leg outside the HARD odds cap', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'banker-results-'));
  let timeline = false;
  const results = createResults({
    dir,
    now: () => Date.parse('2026-11-23T20:00:00.000Z'),
    fetchImpl: async (url) => {
      if (String(url).includes('match_timeline')) {
        timeline = true;
        return { ok: true, json: async () => ({ doc: [{ data: { events: [
          { type: 'goal', result: { home: 1, away: 0 } },
          { type: 'goal', result: { home: 2, away: 0 } },
        ] } }] }) };
      }
      return {
        ok: true,
        json: async () => ({ doc: [{ data: { match: { status: { _id: 100, name: 'Ended' }, periods: { ft: { home: 2, away: 0 }, p1: { home: 1, away: 0 } } } } }] }),
      };
    },
  });
  results.recordBanker({
    code: { id: 'banker:shield:APWHWQ', strategy: 'shield', name: 'Banker Shield', code: 'APWHWQ', totalOdds: 1.97 },
    picks: [
      { key: 'banker:APWHWQ:sr:match:9|over25', eventId: 'sr:match:9', market: 'over25', strategy: 'shield', odds: 1.97, kickoff: '2026-11-23T18:00:00.000Z', home: 'Nantes', away: 'Grenoble', bookResult: 'lost' },
      { key: 'banker:APWHWQ:sr:match:9|2up-home', eventId: 'sr:match:9', market: '2up-home', strategy: 'shield', odds: 1.32, kickoff: '2026-11-23T18:00:00.000Z', home: 'Nantes', away: 'Grenoble', bookResult: 'won' },
    ],
  });
  const graded = await results.settle();
  assert.equal(graded, 2);
  assert.equal(timeline, true);
  assert.equal(results.record.picks['banker:APWHWQ:sr:match:9|over25'].status, 'lost');
  assert.equal(results.record.picks['banker:APWHWQ:sr:match:9|2up-home'].status, 'won');
  assert.equal(results.record.codes['banker:shield:APWHWQ'].status, 'lost');
});
