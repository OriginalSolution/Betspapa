import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createResults, finalScore, gradePick, voidReason } from './results.mjs';

const clock = Date.parse('2026-11-22T18:00:00.000Z');

function board() {
  return {
    events: [
      {
        eventId: 'sr:match:100',
        home: 'Como 1907',
        away: 'Cagliari',
        homeId: 'sr:competitor:1',
        awayId: 'sr:competitor:2',
        tournament: 'Serie A',
        country: 'Italy',
      },
      {
        eventId: 'sr:match:200',
        home: 'Aston Villa',
        away: 'Sunderland',
        homeId: 'sr:competitor:3',
        awayId: 'sr:competitor:4',
        tournament: 'Premier League',
        country: 'England',
      },
    ],
    legs: [],
    master: {
      id: 'master',
      label: '80%+ Master Slip',
      bookedAt: '2026-11-22T12:00:00.000Z',
      legs: [
        { eventId: 'sr:match:100', market: 'fh-over05', odds: 1.22, rate: 0.86, sample: '8/10', kickoff: '2026-11-22T19:00:00.000Z', match: 'Como 1907 vs Cagliari', tournament: 'Serie A' },
        { eventId: 'sr:match:200', market: 'over15', odds: 1.25, rate: 0.9, sample: '9/10', opponentSample: '10/10', kickoff: '2026-11-22T20:00:00.000Z', match: 'Aston Villa vs Sunderland', tournament: 'Premier League' },
      ],
      books: {
        sportybet: {
          parts: [{ code: 'BRHPUB', link: 'https://www.sportybet.com/gh/?shareCode=BRHPUB', totalOdds: 1.52, legs: 2, matches: ['sr:match:100', 'sr:match:200'] }],
        },
        footballcom: { parts: [] },
      },
    },
    trends: [
      {
        id: '80:btts',
        label: 'Both teams to score',
        legs: [
          { eventId: 'sr:match:100', market: 'btts', odds: 1.7, rate: 0.7, sample: '7/10', kickoff: '2026-11-22T19:00:00.000Z', match: 'Como 1907 vs Cagliari' },
        ],
        books: { sportybet: { parts: [{ code: 'LOWONLY', matches: ['sr:match:100'] }] } },
      },
    ],
    tiers: [],
  };
}

function ended(ft, ht = { home: 1, away: 0 }) {
  return {
    status: { _id: 100, name: 'Ended' },
    periods: { ft, p1: ht },
    result: ft,
  };
}

test('grades the 90-minute score and waits for half-time on half markets', () => {
  assert.equal(gradePick('over15', { home: 2, away: 0 }, null), 'won');
  assert.equal(gradePick('over15', { home: 1, away: 0 }, null), 'lost');
  assert.equal(gradePick('dnb-home', { home: 1, away: 1 }, null), 'void');
  assert.equal(gradePick('dc-12', { home: 0, away: 0 }, null), 'lost');
  assert.equal(gradePick('sh-over05', { home: 2, away: 0 }, null), 'open');
  assert.equal(gradePick('sh-over05', { home: 2, away: 0 }, { home: 1, away: 0 }), 'won');
  assert.equal(gradePick('fh-over05', { home: 0, away: 0 }, { home: 0, away: 0 }), 'lost');
  assert.equal(finalScore({ status: { _id: 7, name: '2nd half' }, result: { home: 1, away: 0 }, periods: { p1: { home: 1, away: 0 } } }), null);
  assert.deepEqual(finalScore(ended({ home: 0, away: 1 })), { home: 0, away: 1 });
  assert.equal(voidReason({ postponed: true, status: { _id: 0, name: 'Not started' } }), 'Postponed');
  assert.equal(voidReason({ status: { _id: 7, name: '2nd half' }, result: { home: 0, away: 0 } }), '');
  assert.equal(voidReason({ status: { _id: 80, name: 'Interrupted' } }), '');
});

test('records published in-range picks, keeps them after kick-off, and maps code legs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'betspapa-results-'));
  let time = clock;
  const results = createResults({ dir, now: () => time, crestFor: (id) => (id ? `https://api.betspapa.com/crests/id/${String(id).split(':').pop()}.png` : null), log: { log() {}, error() {} } });
  assert.equal(results.ingest(board()), 2);
  assert.equal(results.ingest(board()), 0);
  const view = results.view('2026-11-22');
  assert.equal(view.summary.picks, 2);
  assert.equal(view.summary.graded, 0);
  assert.equal(view.picks.some((pick) => pick.market === 'btts'), false);
  assert.match(view.picks[0].homeCrest, /\/crests\/id\/1\.png$/);
  assert.equal(view.codes.length, 1);
  assert.deepEqual(view.codes[0].legs.sort(), ['sr:match:100|fh-over05', 'sr:match:200|over15'].sort());
  assert.equal(view.codes[0].code, 'BRHPUB');
  time = Date.parse('2026-11-22T21:30:00.000Z');
  const later = board();
  later.master.legs = [];
  later.master.books = { sportybet: { parts: [] } };
  assert.equal(results.ingest(later), 0);
  assert.equal(results.view('2026-11-22').summary.picks, 2);
  const again = createResults({ dir, now: () => time, log: { log() {}, error() {} } });
  assert.equal(again.view('2026-11-22').since, view.since);
  assert.equal(again.view('2026-11-22').summary.picks, 2);
});

test('updates a price before kick-off and freezes it after', () => {
  const dir = mkdtempSync(join(tmpdir(), 'betspapa-results-'));
  let time = clock;
  const results = createResults({ dir, now: () => time, log: { log() {}, error() {} } });
  results.ingest(board());
  const next = board();
  next.master.legs[1].odds = 1.28;
  results.ingest(next);
  assert.equal(results.record.picks['sr:match:200|over15'].odds, 1.28);
  time = Date.parse('2026-11-22T20:05:00.000Z');
  next.master.legs[1].odds = 1.27;
  results.ingest(next);
  assert.equal(results.record.picks['sr:match:200|over15'].odds, 1.28);
});

test('grades only a final score, voids a postponement, and settles a code when its last leg ends', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'betspapa-results-'));
  let time = Date.parse('2026-11-22T22:00:00.000Z');
  const seen = [];
  const results = createResults({
    dir,
    now: () => time,
    log: { log() {}, error() {} },
    fetchImpl: async (url) => {
      const id = String(url).split('/').pop();
      seen.push(id);
      const match = id === '100'
        ? { status: { _id: 7, name: '2nd half' }, result: { home: 1, away: 0 }, periods: { p1: { home: 1, away: 0 } } }
        : id === '200'
          ? { postponed: true, status: { _id: 60, name: 'Postponed' } }
          : ended({ home: 0, away: 0 }, { home: 0, away: 0 });
      return { ok: true, json: async () => ({ doc: [{ data: { match } }] }) };
    },
  });
  results.ingest(board());
  assert.equal(await results.settle(), 1);
  assert.equal(results.record.picks['sr:match:100|fh-over05'].status, 'open');
  assert.equal(results.record.picks['sr:match:200|over15'].status, 'void');
  assert.equal(results.record.picks['sr:match:200|over15'].note, 'Postponed');
  assert.equal(results.record.picks['sr:match:200|over15'].ft, null);
  assert.equal(results.record.codes['master:sportybet:BRHPUB'].status, 'open');
  time = Date.parse('2026-11-22T22:20:00.000Z');
  const next = createResults({
    dir,
    now: () => time,
    log: { log() {}, error() {} },
    fetchImpl: async (url) => {
      const id = String(url).split('/').pop();
      const match = id === '100' ? ended({ home: 1, away: 0 }, { home: 0, away: 0 }) : { postponed: true, status: { _id: 60, name: 'Postponed' } };
      return { ok: true, json: async () => ({ doc: [{ data: { match } }] }) };
    },
  });
  next.record.picks['sr:match:100|fh-over05'].checkedAt = null;
  assert.equal(await next.settle(), 1);
  assert.equal(next.record.picks['sr:match:100|fh-over05'].status, 'lost');
  assert.equal(next.record.picks['sr:match:100|fh-over05'].ft, '1-0');
  assert.equal(next.record.picks['sr:match:100|fh-over05'].ht, '0-0');
  assert.equal(next.record.codes['master:sportybet:BRHPUB'].status, 'lost');
  const graded = next.view('2026-11-22');
  assert.equal(graded.summary.graded, 1);
  assert.equal(graded.summary.won, 0);
  assert.equal(graded.summary.lost, 1);
  assert.equal(graded.summary.void, 1);
  assert.notEqual(graded.summary.picks, 316);
  assert.ok(seen.includes('100'));
});

test('a code stays open while a leg is still in play, then wins when every leg lands', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'betspapa-results-'));
  const time = Date.parse('2026-11-22T22:00:00.000Z');
  const results = createResults({
    dir,
    now: () => time,
    log: { log() {}, error() {} },
    fetchImpl: async (url) => {
      const id = String(url).split('/').pop();
      const match = id === '100' ? ended({ home: 2, away: 0 }, { home: 1, away: 0 }) : { status: { _id: 7, name: '2nd half' }, result: { home: 1, away: 0 }, periods: { p1: { home: 0, away: 0 } } };
      return { ok: true, json: async () => ({ doc: [{ data: { match } }] }) };
    },
  });
  results.ingest(board());
  await results.settle();
  assert.equal(results.record.picks['sr:match:100|fh-over05'].status, 'won');
  assert.equal(results.record.picks['sr:match:200|over15'].status, 'open');
  assert.equal(results.record.codes['master:sportybet:BRHPUB'].status, 'open');
  const done = createResults({
    dir,
    now: () => time + 20 * 60 * 1000,
    log: { log() {}, error() {} },
    fetchImpl: async () => ({ ok: true, json: async () => ({ doc: [{ data: { match: ended({ home: 2, away: 1 }, { home: 1, away: 0 }) } }] }) }),
  });
  done.record.picks['sr:match:200|over15'].checkedAt = null;
  await done.settle();
  assert.equal(done.record.picks['sr:match:200|over15'].status, 'won');
  assert.equal(done.record.codes['master:sportybet:BRHPUB'].status, 'won');
});

test('two 50-pick parts keep their own codes and only their own legs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'betspapa-results-'));
  const legs = Array.from({ length: 4 }, (_, index) => ({
    eventId: `sr:match:${index + 1}`,
    market: 'over15',
    odds: 1.24,
    rate: 0.85,
    sample: '9/10',
    kickoff: '2026-11-23T15:00:00.000Z',
    match: `Home ${index} vs Away ${index}`,
  }));
  const results = createResults({ dir, now: () => Date.parse('2026-11-23T10:00:00.000Z'), log: { log() {}, error() {} } });
  results.ingest({
    events: legs.map((leg, index) => ({ eventId: leg.eventId, home: `Home ${index}`, away: `Away ${index}` })),
    master: {
      id: 'master',
      label: '80%+ Master Slip',
      legs,
      books: {
        msport: {
          parts: [
            { code: 'PARTONE', matches: ['sr:match:1', 'sr:match:2'] },
            { code: 'PARTTWO', matches: ['sr:match:3', 'sr:match:4'] },
          ],
        },
      },
    },
  });
  const codes = results.view('2026-11-23').codes;
  assert.equal(codes.length, 2);
  assert.deepEqual(codes.find((code) => code.code === 'PARTONE').legs.sort(), ['sr:match:1|over15', 'sr:match:2|over15']);
  assert.deepEqual(codes.find((code) => code.code === 'PARTTWO').legs.sort(), ['sr:match:3|over15', 'sr:match:4|over15']);
});
