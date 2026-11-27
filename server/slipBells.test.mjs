import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { bellNotes, createDeviceBook, slipBellsFrom, startPushWatch, watchedMatchIds } from './push.mjs';

const BELL = {
  id: 'trend:80:over15:2026-11-24',
  label: '80%+ Over 1.5 goals',
  legs: [
    { eventId: 'sr:match:1', market: 'over15', odds: 1.26, home: 'Heart of Lions', away: 'Asante Kotoko', label: 'Over 1.5 goals' },
    { eventId: 'sr:match:2', market: 'dc-12', odds: 1.21, home: 'Accra Hearts of Oak', away: 'Medeama SC', label: 'Double chance 12' },
  ],
};

test('slip bells are cleaned and keyed per leg, with no cap', () => {
  assert.equal(slipBellsFrom({}), undefined);
  assert.deepEqual(slipBellsFrom({ slipBells: [] }), []);
  const [bell] = slipBellsFrom({ slipBells: [{ ...BELL, legs: [...BELL.legs, BELL.legs[0], { eventId: 'bad', market: 'x' }] }] });
  assert.equal(bell.legs.length, 2);
  assert.equal(bell.legs[0].key, 'sr:match:1|over15');
  assert.equal(slipBellsFrom({ slipBells: Array.from({ length: 30 }, (_, i) => ({ ...BELL, id: `s${i}` })) }).length, 30);
  const legs = Array.from({ length: 70 }, (_, i) => ({ eventId: `sr:match:${i + 1}`, market: 'over15', odds: 1.26, home: 'Home', away: 'Away', label: 'Over 1.5 goals' }));
  const [long] = slipBellsFrom({ slipBells: [{ id: 'long', label: 'Long', legs }] });
  assert.equal(long.legs.length, 70);
});

test('a belled slip alerts each leg with full names, then the whole slip once', () => {
  const device = { slipBells: slipBellsFrom({ slipBells: [BELL] }) };
  const live = bellNotes(device, [{ id: 'sr:match:1', status: 'live', homeScore: 1, awayScore: 0, home: 'Lions', away: 'Kotoko' }]);
  assert.equal(live.notes.length, 0);
  const early = bellNotes(device, [{ id: 'sr:match:1', status: 'live', homeScore: 2, awayScore: 0, home: 'Lions', away: 'Kotoko' }]);
  assert.deepEqual(early.notes.map((note) => note.id), ['slipleg:trend:80:over15:2026-11-24:sr:match:1|over15']);
  assert.equal(early.notes[0].kind, 'win');
  assert.equal(early.notes[0].title, 'Leg won · Over 1.5');
  assert.equal(early.notes[0].marketLabel, 'Over 1.5');
  assert.equal(early.notes[0].body, 'Heart of Lions 2-0 Asante Kotoko · Over 1.5 · 80%+ Over 1.5 goals · 1.26 · 1 of 2 won');
  assert.notEqual(early.notes[0].body, 'Trend hit');
  assert.equal(early.notes[0].match.home, 'Heart of Lions');
  assert.equal(early.changed, true);
  // Same leg is not raised again on the next poll.
  assert.equal(bellNotes(device, [{ id: 'sr:match:1', status: 'finished', homeScore: 3, awayScore: 0 }]).notes.length, 0);
  const done = bellNotes(device, [{ id: 'sr:match:2', status: 'finished', homeScore: 1, awayScore: 1, home: 'Hearts', away: 'Medeama' }]);
  assert.deepEqual(done.notes.map((note) => note.id), ['slipleg:trend:80:over15:2026-11-24:sr:match:2|dc-12', 'slip:trend:80:over15:2026-11-24']);
  assert.equal(done.notes[0].kind, 'bust');
  assert.equal(done.notes[0].title, 'Leg lost · Double chance 12');
  assert.equal(done.notes[1].kind, 'slip');
  assert.match(done.notes[1].title, /Slip lost · 1 of 2 legs won/);
});

test('the tracked builder slip keeps its own slip card, the bell adds only the legs', () => {
  const device = { builderSlip: { id: BELL.id, legs: [] }, slipBells: slipBellsFrom({ slipBells: [BELL] }) };
  const notes = bellNotes(device, [
    { id: 'sr:match:1', status: 'finished', homeScore: 2, awayScore: 1 },
    { id: 'sr:match:2', status: 'finished', homeScore: 2, awayScore: 1 },
  ]).notes;
  assert.deepEqual(notes.map((note) => note.kind), ['win', 'win']);
});

test('belled legs are watched, and the registration keeps bells when they are not re-sent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'betspapa-bell-'));
  const book = createDeviceBook(dir);
  book.register({ token: 'fcm-token-value-that-is-long-enough', slipBells: [BELL] });
  assert.deepEqual([...watchedMatchIds(book.list(), [])].sort(), ['sr:match:1', 'sr:match:2']);
  book.register({ token: 'fcm-token-value-that-is-long-enough', follows: { matches: [], teams: [] } });
  assert.equal(book.list()[0].slipBells.length, 1);
  book.register({ token: 'fcm-token-value-that-is-long-enough', slipBells: [] });
  assert.equal(book.list()[0].slipBells.length, 0);
});

test('end to end: a bell turned on in the app pushes kick-off, the goal and the leg result', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'betspapa-bell-'));
  const book = createDeviceBook(dir);
  // The app sends the bell's matches as follows too, so kick-off and goals use the normal path.
  book.register({ token: 'fcm-token-value-that-is-long-enough', follows: { matches: ['sr:match:1', 'sr:match:2'], teams: [] }, slipBells: [BELL] });
  const row = (score, matchStatus = 'H1', status = 1) => ({
    data: [{ events: [{ eventId: 'sr:match:1', homeTeamName: 'Heart of Lions', awayTeamName: 'Asante Kotoko', matchStatus, status, setScore: score }] }],
  });
  let payload = row('0:0');
  const sent = [];
  const env = { FCM_SERVICE_ACCOUNT_JSON: '{"project_id":"betspapa-app","client_email":"push@betspapa-app.iam.gserviceaccount.com","private_key":"test-key"}' };
  const fetchImpl = async () => ({ ok: true, json: async () => payload });
  const send = async (_account, message) => {
    sent.push(message.message.data);
    return { dropped: false, ok: true, status: 200, body: { name: 'projects/betspapa-app/messages/1' } };
  };
  let now = Date.parse('2026-11-24T19:00:00Z');
  const watch = startPushWatch({ dir, book, env, fetchImpl, send, log() {}, now: () => now });
  await watch.tick();
  now += 25_000;
  payload = row('1:0');
  await watch.tick();
  now += 25_000;
  payload = row('2:0');
  await watch.tick();
  const ids = sent.map((data) => data.id);
  assert.ok(ids.includes('sr:match:1:goal:home:2'), ids.join(','));
  const leg = sent.find((data) => data.id === 'slipleg:trend:80:over15:2026-11-24:sr:match:1|over15');
  assert.ok(leg, ids.join(','));
  assert.equal(leg.kind, 'win');
  assert.equal(leg.home, 'Heart of Lions');
  assert.equal(leg.away, 'Asante Kotoko');
  assert.equal(leg.title, 'Leg won · Over 1.5');
  assert.equal(leg.marketLabel, 'Over 1.5');
  assert.match(leg.body, /Heart of Lions 2-0 Asante Kotoko/);
  assert.match(leg.body, /1 of 2 won/);
  assert.match(leg.fixture, /Heart of Lions 2-0 Asante Kotoko/);
  assert.equal(leg.odds, '1.26');
  assert.equal(leg.slip, '80%+ Over 1.5 goals');
  assert.notEqual(leg.body, 'Trend hit');
  now += 25_000;
  await watch.tick();
  assert.equal(sent.filter((data) => data.id === leg.id).length, 1);
});
