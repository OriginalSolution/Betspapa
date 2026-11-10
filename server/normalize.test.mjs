import assert from 'node:assert/strict';
import test from 'node:test';
import { filterByRange, normalizeMatch, providerDates } from './football.mjs';
import { getConfig } from './config.mjs';

test('normalizeMatch maps status, score, goals and cards', () => {
  const match = normalizeMatch({
    id: 55,
    utcDate: '2026-11-10T20:00:00Z',
    status: 'IN_PLAY',
    minute: 67,
    injuryTime: null,
    venue: 'Emirates Stadium',
    area: { name: 'England', code: 'ENG' },
    competition: { id: 2021, name: 'Premier League', code: 'PL' },
    homeTeam: { id: 57, name: 'Arsenal FC', shortName: 'Arsenal', tla: 'ARS', crest: 'https://example.com/ars.png' },
    awayTeam: { id: 64, name: 'Liverpool FC', shortName: 'Liverpool', tla: 'LIV' },
    score: { fullTime: { home: 3, away: 1 }, halfTime: { home: 1, away: 1 } },
    goals: [
      { minute: 67, type: 'PENALTY', team: { id: 57 }, scorer: { name: 'Havertz' }, score: { home: 3, away: 1 } },
      { minute: 40, type: 'OWN', team: { id: 64 }, scorer: { name: 'Saliba' }, score: { home: 1, away: 1 } },
    ],
    bookings: [
      { minute: 73, card: 'RED_CARD', team: { id: 64 }, player: { name: 'Van Dijk' } },
      { minute: 12, card: 'YELLOW_CARD', team: { id: 57 }, player: { name: 'Rice' } },
    ],
  });

  assert.equal(match.status, 'live');
  assert.equal(match.minute, 67);
  assert.equal(match.home.shortName, 'Arsenal');
  assert.equal(match.home.crest, 'https://example.com/ars.png');
  assert.equal(match.homeScore, 3);
  assert.equal(match.htHome, 1);
  assert.equal(match.competition.area, 'England');
  assert.deepEqual(
    match.events.map((event) => event.type),
    ['yellow', 'goal', 'goal', 'red'],
  );
  assert.equal(match.events.find((event) => event.player === 'Havertz').detail, 'Penalty');
  assert.equal(match.events.find((event) => event.player === 'Saliba').detail, 'Own goal');
  assert.equal(match.events.find((event) => event.type === 'red').player, 'Van Dijk');
});

test('paused matches are half-time and unknown status stays scheduled', () => {
  assert.equal(normalizeMatch({ id: 1, utcDate: '2026-11-10T12:00:00Z', status: 'PAUSED', homeTeam: {}, awayTeam: {}, score: {} }).status, 'halftime');
  assert.equal(normalizeMatch({ id: 2, utcDate: '2026-11-10T12:00:00Z', status: 'TIMED', homeTeam: {}, awayTeam: {}, score: { fullTime: {} } }).homeScore, null);
});

test('provider dates and range filter use instants', () => {
  const dates = providerDates('2026-11-10T00:00:00.000Z', '2026-11-10T23:59:59.000Z');
  assert.deepEqual(dates, { dateFrom: '2026-11-10', dateTo: '2026-11-10' });
  assert.equal(providerDates('nope', '2026-11-10T00:00:00.000Z'), null);
  const matches = [
    { utcDate: '2026-11-10T18:00:00.000Z' },
    { utcDate: '2026-11-11T00:30:00.000Z' },
  ];
  assert.equal(filterByRange(matches, '2026-11-10T00:00:00.000Z', '2026-11-10T23:59:59.000Z').length, 1);
});

test('config stays in demo without a token and goes live with one', () => {
  assert.equal(getConfig({}).mode, 'demo');
  assert.equal(getConfig({ FOOTBALL_DATA_API_KEY: 'abc', DATA_MODE: 'live' }).mode, 'live');
  assert.equal(getConfig({ FOOTBALL_DATA_API_KEY: 'abc', DATA_MODE: 'demo' }).mode, 'demo');
  assert.equal(getConfig({ DATA_MODE: 'live' }).mode, 'demo');
});
