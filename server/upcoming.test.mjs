import assert from 'node:assert/strict';
import test from 'node:test';
import { flattenPage, isSimulated, loadUpcomingEvents, parseOdds } from './upcoming.mjs';

const page = {
  bizCode: 10000,
  data: {
    totalNum: 2,
    tournaments: [
      {
        name: 'Premier League',
        events: [
          {
            eventId: 'sr:match:1',
            homeTeamName: 'Man City',
            awayTeamName: 'Fulham',
            estimateStartTime: Date.UTC(2026, 10, 21, 15),
            sport: { category: { name: 'England' } },
            markets: [
              { id: '1', outcomes: [{ id: '1', odds: '1.30' }, { id: '2', odds: '5.6' }, { id: '3', odds: '9.0' }] },
              { id: '18', specifier: 'total=2.5', outcomes: [{ id: '12', desc: 'Over 2.5', odds: '1.45' }, { id: '13', desc: 'Under 2.5', odds: '2.6' }] },
              { id: '18', specifier: 'total=2', outcomes: [{ id: '12', desc: 'Over 2', odds: '1.2' }] },
              { id: '29', outcomes: [{ id: '74', desc: 'Yes', odds: '1.8' }, { id: '76', desc: 'No', odds: '1.9', isActive: 0 }] },
            ],
          },
        ],
      },
      {
        name: 'UEFA Nations League SRL',
        events: [
          {
            eventId: 'sr:match:2',
            homeTeamName: 'Andorra SRL',
            awayTeamName: 'Gibraltar SRL',
            estimateStartTime: Date.UTC(2026, 10, 13, 8),
            sport: { category: { name: 'Simulated Reality League' } },
            markets: [],
          },
        ],
      },
    ],
  },
};

test('parses 1X2, half-line totals and active BTTS prices only', () => {
  const odds = parseOdds(page.data.tournaments[0].events[0].markets);
  assert.deepEqual(odds, { home: 1.3, draw: 5.6, away: 9, 'over-25': 1.45, 'under-25': 2.6, 'btts-yes': 1.8 });
});

test('drops simulated reality league fixtures and keeps real ones', () => {
  const events = flattenPage(page);
  assert.equal(events.length, 1);
  assert.equal(events[0].home, 'Man City');
  assert.equal(events[0].kickoff, '2026-11-21T15:00:00.000Z');
  assert.equal(isSimulated({ country: 'Italy', tournament: 'Serie C, Group C' }), false);
  assert.equal(isSimulated({ country: 'International', tournament: 'Premier League SRL' }), true);
});

test('loads every page and never invents events when the catalogue fails', async () => {
  const ok = async () => ({ ok: true, json: async () => page });
  const events = await loadUpcomingEvents({ force: true, fetchImpl: ok });
  assert.equal(events.length, 1);
  const down = async () => ({ ok: false, status: 503, json: async () => ({}) });
  await assert.rejects(loadUpcomingEvents({ force: true, fetchImpl: down }), /503/);
});
