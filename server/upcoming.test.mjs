import assert from 'node:assert/strict';
import test from 'node:test';
import { flattenPage, isDummyId, isSimulated, loadUpcomingEvents, overlayLive, parseOdds } from './upcoming.mjs';

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

test('drops a 11111111 placeholder id and keeps a real match id', () => {
  const events = flattenPage({
    data: {
      tournaments: [
        {
          name: 'Professional League Cup',
          events: [
            {
              eventId: 'sr:match:111111114672527',
              homeTeamName: 'Al-Seeb',
              awayTeamName: 'Al Nahda',
              estimateStartTime: Date.UTC(2026, 10, 13, 16),
              sport: { category: { name: 'Oman' } },
            },
            {
              eventId: 'sr:match:75803688',
              homeTeamName: 'Comoros',
              awayTeamName: 'Congo',
              estimateStartTime: Date.UTC(2026, 10, 13, 13),
              sport: { category: { name: 'International' } },
            },
          ],
        },
      ],
    },
  });
  assert.deepEqual(events.map((event) => event.eventId), ['sr:match:75803688']);
  assert.equal(isDummyId('sr:match:111111114672527'), true);
  assert.equal(isDummyId('sr:match:75803688'), false);
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

function futurePage(kickoffMs, markets) {
  return {
    bizCode: 10000,
    data: {
      totalNum: 1,
      tournaments: [
        {
          name: 'Premier League',
          events: [{ eventId: 'sr:match:9', homeTeamName: 'Chelsea', awayTeamName: 'Leeds United', estimateStartTime: kickoffMs, sport: { category: { name: 'England' } }, markets }],
        },
      ],
    },
  };
}
const oneXTwo = { id: '1', outcomes: [{ id: '1', odds: '1.40' }, { id: '2', odds: '4.5' }, { id: '3', odds: '7.0' }] };
const ggNg = { id: '29', outcomes: [{ id: '74', desc: 'Yes', odds: '1.8' }, { id: '76', desc: 'No', odds: '1.9' }] };

test('a timed-out full request loads in smaller market groups and merges the prices', async () => {
  const kickoff = Date.now() + 4 * 3_600_000;
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    const markets = decodeURIComponent(new URL(url).searchParams.get('marketId') || '');
    if (markets.split(',').length > 4) return { ok: false, status: 504, json: async () => ({}) };
    if (markets.startsWith('1,')) return { ok: true, json: async () => futurePage(kickoff, [oneXTwo]) };
    if (markets.startsWith('19,')) return { ok: true, json: async () => futurePage(kickoff, [ggNg]) };
    return { ok: false, status: 504, json: async () => ({}) };
  };
  const events = await loadUpcomingEvents({ force: true, fetchImpl });
  assert.equal(events.length, 1);
  assert.equal(events[0].home, 'Chelsea');
  assert.ok(events[0].odds.home, '1X2 price from the first group');
  assert.ok(Object.keys(events[0].odds).length > 3, 'GG/NG prices merged from the second group');
  assert.ok(!urls.some((url) => url.includes('liveOrPrematchEvents')), 'the live list is not needed');
});

test('a failed catalogue keeps the last good one and lays live-list rows over it', async () => {
  const kickoff = Date.now() + 4 * 3_600_000;
  const live = {
    bizCode: 10000,
    data: [{ name: 'Serie A', events: [{ eventId: 'sr:match:77', homeTeamName: 'Como 1907', awayTeamName: 'Lazio', estimateStartTime: Date.now() - 30 * 60_000, sport: { category: { name: 'Italy' } }, markets: [] }] }],
  };
  await loadUpcomingEvents({ force: true, fetchImpl: async () => ({ ok: true, json: async () => futurePage(kickoff, [oneXTwo]) }) });
  const fetchImpl = async (url) =>
    url.includes('liveOrPrematchEvents') ? { ok: true, json: async () => live } : { ok: false, status: 504, json: async () => ({}) };
  const events = await loadUpcomingEvents({ force: true, fetchImpl });
  assert.deepEqual(events.map((event) => event.eventId).sort(), ['sr:match:77', 'sr:match:9']);
});

test('overlayLive drops long-finished kept rows and lets the live list win', () => {
  const now = Date.UTC(2026, 10, 21, 12);
  const kept = [
    { eventId: 'a', kickoff: '2026-11-21T06:00:00.000Z', odds: {} },
    { eventId: 'b', kickoff: '2026-11-21T15:00:00.000Z', odds: { home: 1.3, gg: 1.8 } },
  ];
  const live = [{ eventId: 'b', kickoff: '2026-11-21T15:00:00.000Z', odds: { home: 1.35 } }];
  const merged = overlayLive(kept, live, now);
  assert.deepEqual(merged.map((event) => event.eventId), ['b']);
  assert.deepEqual(merged[0].odds, { home: 1.35, gg: 1.8 });
});
