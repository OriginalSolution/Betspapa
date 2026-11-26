import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { acceptDevice, BASELINE_MAX_AGE_MS, builderSlipFrom, CARRY_MS, carryForward, tokenIsDead, ttlFor, channelFor, createDeviceBook, diffMatches, fcmConfigured, messageFor, normalizeLive, notesForDevice, publicFcm, PUSH_TTL, slipNote, startPushWatch, teamFollows, trendNotes } from './push.mjs';

test('FCM stays off until a service account is configured', () => {
  assert.equal(fcmConfigured({}), false);
  assert.equal(fcmConfigured({ FCM_SERVICE_ACCOUNT_JSON: '{"project_id":"betspapa"}' }), false);
  assert.equal(
    fcmConfigured({
      FCM_SERVICE_ACCOUNT_JSON: '{"project_id":"betspapa-app","client_email":"push@betspapa-app.iam.gserviceaccount.com","private_key":"test-key"}',
    }),
    true,
  );
});

test('the logged FCM response never includes the key', () => {
  const body = publicFcm({
    name: 'projects/betspapa-app/messages/1',
    private_key: 'secret-key',
    access_token: 'secret-token',
    error: { code: 401, status: 'UNAUTHENTICATED', message: 'rejected', private_key: 'secret-key' },
  });
  const printed = JSON.stringify(body);
  assert.equal(body.name, 'projects/betspapa-app/messages/1');
  assert.equal(body.error.status, 'UNAUTHENTICATED');
  assert.equal(printed.includes('secret'), false);
  assert.equal(printed.includes('private_key'), false);
  assert.equal(printed.includes('access_token'), false);
});

test('channels match the Android sound ids', () => {
  assert.equal(channelFor('goal', { goalSound: 'horn' }), 'betspapa.goal.horn.v4');
  assert.equal(channelFor('goal', { goalSound: 'arp' }), 'betspapa.goal.arp.v4');
  assert.equal(channelFor('red', {}), 'betspapa.redcard.v1');
  assert.equal(channelFor('var', {}), 'betspapa.var.v1');
  assert.equal(channelFor('penalty', { penaltySound: false }), 'betspapa.goal.off.v4');
});

test('a score change is a goal and a missing timeline does not invent a red card', () => {
  const before = normalizeLive({
    data: [{ events: [{ eventId: 'sr:match:1', homeTeamName: 'Hearts', awayTeamName: 'Kotoko', matchStatus: 'H1', status: 1, setScore: '0:0' }] }],
  });
  const after = normalizeLive({
    data: [{ events: [{ eventId: 'sr:match:1', homeTeamName: 'Hearts', awayTeamName: 'Kotoko', matchStatus: 'H2', status: 1, setScore: '1:0' }] }],
  });
  const notes = diffMatches(before, after);
  assert.equal(notes.some((note) => note.kind === 'goal'), true);
  assert.equal(notes.some((note) => note.kind === 'red' || note.kind === 'var' || note.kind === 'penalty'), false);
  const withCard = normalizeLive({
    data: [{
      events: [{
        eventId: 'sr:match:1',
        homeTeamName: 'Hearts',
        awayTeamName: 'Kotoko',
        matchStatus: 'H2',
        status: 1,
        setScore: '1:0',
        timeline: [{ type: 'red card', minute: 50, side: 'away', player: 'Keeper' }],
      }],
    }],
  });
  const cards = diffMatches(after, withCard);
  assert.equal(cards.some((note) => note.kind === 'red'), true);
});

test('a followed team matches a different live spelling of the same club', () => {
  const manCity = { id: 'man-city', name: 'Man City' };
  const live = { id: 'sr:match:1', home: 'Manchester City', away: 'Arsenal', homeId: 'manchester-city', awayId: 'arsenal' };
  assert.equal(teamFollows(manCity, live), true);
  assert.equal(teamFollows({ id: 'sr:competitor:17', name: 'Other' }, { ...live, homeCompetitor: 'sr:competitor:17' }), true);
  assert.equal(teamFollows({ id: 'hearts', name: 'Hearts' }, live), false);
  const device = acceptDevice({
    token: 'fcm-token-value-that-is-long-enough',
    follows: { matches: [], teams: [manCity] },
  }).device;
  const notes = [
    { id: 'sr:match:1:goal:home:1', matchId: 'sr:match:1', kind: 'goal', title: 'Goal', body: 'City', match: live },
  ];
  assert.equal(notesForDevice(notes, device).length, 1);
});

test('a device only hears followed matches and the message is high priority', () => {
  const rejected = acceptDevice({ token: 'short' });
  assert.equal(rejected.error.includes('token'), true);
  const accepted = acceptDevice({
    token: 'fcm-token-value-that-is-long-enough',
    follows: { matches: [], teams: [{ id: 'hearts', name: 'Hearts' }] },
    settings: { goalSound: 'horn', red: true },
  });
  const notes = [
    { id: 'sr:match:1:goal:home:1', matchId: 'sr:match:1', kind: 'goal', title: 'Goal', body: 'Hearts', match: { id: 'sr:match:1', homeId: 'hearts', awayId: 'kotoko' } },
    { id: 'sr:match:2:goal:home:1', matchId: 'sr:match:2', kind: 'goal', title: 'Goal', body: 'Other', match: { id: 'sr:match:2', homeId: 'other', awayId: 'away' } },
  ];
  const mine = notesForDevice(notes, accepted.device);
  assert.equal(mine.length, 1);
  const message = messageFor({
    ...mine[0],
    match: { id: 'sr:match:1', home: 'Hearts', away: 'Kotoko', homeScore: 1, awayScore: 0, minute: 12, status: 'live' },
  }, accepted.device);
  assert.equal(message.message.android.priority, 'HIGH');
  assert.equal(message.message.android.ttl, '900s');
  assert.equal(PUSH_TTL, '3600s');
  assert.equal(message.message.data.sentAt.length > 0, true);
  assert.equal(message.message.notification, undefined);
  assert.equal(message.message.android.notification, undefined);
  assert.equal(message.message.data.channel, 'betspapa.goal.horn.v4');
  assert.equal(message.message.data.id, 'sr:match:1:goal:home:1');
  assert.equal(message.message.data.home, 'Hearts');
  assert.equal(message.message.data.homeScore, '1');
  assert.equal(message.message.data.minute, '12');
});

test('a match that appears in play is a kick-off, and a simulated row is ignored', () => {
  const live = normalizeLive({
    data: [
      { name: 'Premier League', categoryName: 'England', events: [{ eventId: 'sr:match:9', homeTeamName: 'Hearts', awayTeamName: 'Kotoko', matchStatus: 'H1', status: 1, setScore: '0:0' }] },
      { name: 'Premier League SRL', categoryName: 'Simulated Reality League', events: [{ eventId: 'sr:match:srl', homeTeamName: 'Andorra SRL', awayTeamName: 'Gibraltar SRL', matchStatus: 'H1', status: 1, setScore: '1:0' }] },
    ],
  });
  assert.equal(live.some((match) => match.id === 'sr:match:srl'), false);
  const notes = diffMatches([], live);
  assert.equal(notes.some((note) => note.kind === 'kickoff' && note.matchId === 'sr:match:9'), true);
});

test('a followed trend pushes when it lands, and a price under 1.20 does not', () => {
  const before = [{ id: 'sr:match:1', home: 'Hearts', away: 'Kotoko', status: 'live', homeScore: 0, awayScore: 0, htHome: null, htAway: null }];
  const after = [{ id: 'sr:match:1', home: 'Hearts', away: 'Kotoko', status: 'live', homeScore: 2, awayScore: 0, htHome: null, htAway: null }];
  const device = acceptDevice({
    token: 'fcm-token-value-that-is-long-enough',
    trends: ['sr:match:1:over15', 'sr:match:1:home'],
    bookings: [
      { id: 'sr:match:1:over15', odds: 1.25 },
      { id: 'sr:match:1:home', odds: 1.6 },
    ],
  }).device;
  const notes = trendNotes(before, after, device);
  assert.deepEqual(notes.map((note) => note.id), ['trend:sr:match:1:over15:hit']);
  assert.equal(notes[0].kind, 'win');
  assert.equal(notes[0].title.includes('Over 1.5'), true);
});

test('a corrupt device list is restored from the backup and not replaced by an empty file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'betspapa-devices-'));
  const book = createDeviceBook(dir);
  const token = 'fcm-token-value-that-is-long-enough';
  book.register({ token, follows: { matches: [], teams: [] } });
  book.register({ token, follows: { matches: ['sr:match:1'], teams: [] } });
  writeFileSync(join(dir, 'devices.json'), '{');
  const restored = createDeviceBook(dir);
  assert.equal(restored.list().length, 1);
  assert.equal(restored.list()[0].token, token);
  assert.equal(JSON.parse(readFileSync(join(dir, 'devices.json'), 'utf8'))[0].token, token);
});

test('a restart sends the goal that landed while the process was down', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'betspapa-push-'));
  const book = createDeviceBook(dir);
  book.register({
    token: 'fcm-token-value-that-is-long-enough',
    follows: { matches: ['sr:match:1'], teams: [] },
  });
  const row = (score) => ({
    data: [{
      events: [{
        eventId: 'sr:match:1',
        homeTeamName: 'Hearts',
        awayTeamName: 'Kotoko',
        matchStatus: 'H1',
        status: 1,
        setScore: score,
      }],
    }],
  });
  let payload = row('0:0');
  const sent = [];
  const env = {
    FCM_SERVICE_ACCOUNT_JSON: '{"project_id":"betspapa-app","client_email":"push@betspapa-app.iam.gserviceaccount.com","private_key":"test-key"}',
  };
  const fetchImpl = async () => ({ ok: true, json: async () => payload });
  const send = async (_account, message) => {
    sent.push(message);
    return { dropped: false, ok: true, status: 200, body: { name: 'projects/betspapa-app/messages/1' } };
  };
  const first = startPushWatch({ dir, book, env, fetchImpl, send, log() {} });
  await first.tick();
  assert.equal(sent.length, 0);
  payload = row('1:0');
  const restarted = startPushWatch({ dir, book, env, fetchImpl, send, log() {} });
  await restarted.tick();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].message.data.kind, 'goal');
  assert.equal(sent[0].message.data.id, 'sr:match:1:goal:home:1');
  assert.equal(sent[0].message.android.ttl, '900s');
});

test('a failed live read does not wipe the stored score baseline', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'betspapa-push-'));
  const book = createDeviceBook(dir);
  book.register({
    token: 'fcm-token-value-that-is-long-enough',
    follows: { matches: ['sr:match:1'], teams: [] },
  });
  const row = (score) => ({
    data: [{
      events: [{
        eventId: 'sr:match:1',
        homeTeamName: 'Hearts',
        awayTeamName: 'Kotoko',
        matchStatus: 'H1',
        status: 1,
        setScore: score,
      }],
    }],
  });
  const env = {
    FCM_SERVICE_ACCOUNT_JSON: '{"project_id":"betspapa-app","client_email":"push@betspapa-app.iam.gserviceaccount.com","private_key":"test-key"}',
  };
  const quiet = async () => ({ dropped: false, ok: true, status: 200, body: {} });
  const first = startPushWatch({
    dir,
    book,
    env,
    fetchImpl: async () => ({ ok: true, json: async () => row('0:0') }),
    send: quiet,
    log() {},
  });
  await first.tick();
  const failed = startPushWatch({
    dir,
    book,
    env,
    fetchImpl: async () => { throw new Error('The operation was aborted due to timeout'); },
    send: async () => { throw new Error('should not send'); },
    log() {},
  });
  await failed.tick();
  assert.equal(failed.stats().feedOk, false);
  const sent = [];
  const again = startPushWatch({
    dir,
    book,
    env,
    fetchImpl: async () => ({ ok: true, json: async () => row('1:0') }),
    send: async (_account, message) => {
      sent.push(message);
      return { dropped: false, ok: true, status: 200, body: { name: 'projects/betspapa-app/messages/2' } };
    },
    log() {},
  });
  await again.tick();
  assert.deepEqual(sent.map((message) => message.message.data.id), ['sr:match:1:goal:home:1']);
});

const ROW = (id, extra = {}) => ({ id, home: 'Hearts', away: 'Kotoko', homeId: 'hearts', awayId: 'kotoko', status: 'live', minute: 30, homeScore: 0, awayScore: 0, htHome: null, htAway: null, incidents: [], varReview: null, ...extra });

test('a match first seen mid-game is not announced as a kick-off', () => {
  assert.deepEqual(diffMatches([], [ROW('sr:match:1', { minute: 63 })]).map((note) => note.kind), []);
  assert.deepEqual(diffMatches([], [ROW('sr:match:1', { minute: 2 })]).map((note) => note.kind), ['kickoff']);
  assert.deepEqual(diffMatches([], [ROW('sr:match:1', { status: 'halftime', minute: 45 })]).map((note) => note.kind), []);
});

test('full time straight from the second half is not also called half-time', () => {
  const notes = diffMatches([ROW('sr:match:1', { minute: 88, homeScore: 1 })], [ROW('sr:match:1', { status: 'finished', minute: 90, homeScore: 1 })]);
  assert.deepEqual(notes.map((note) => note.kind), ['ft']);
  const ht = diffMatches([ROW('sr:match:1', { minute: 45 })], [ROW('sr:match:1', { status: 'halftime', minute: 45 })]);
  assert.deepEqual(ht.map((note) => note.kind), ['ht']);
});

test('a goal VAR takes back is a disallowed card, and the re-scored goal still alerts', () => {
  const one = ROW('sr:match:1', { homeScore: 1 });
  const zero = ROW('sr:match:1', { homeScore: 0 });
  const cancelled = diffMatches([one], [zero]);
  assert.equal(cancelled.length, 1);
  assert.equal(cancelled[0].kind, 'var');
  assert.equal(cancelled[0].disallowed, true);
  assert.equal(cancelled[0].id, 'sr:match:1:goal:home:1:cancelled');
  assert.equal(cancelled[0].replaces, 'sr:match:1:goal:home:1');
  const again = ROW('sr:match:1', { homeScore: 1 });
  const rescored = diffMatches([zero], [again]);
  assert.deepEqual(rescored.map((note) => note.id), ['sr:match:1:goal:home:1:r1']);
  const message = messageFor(cancelled[0], { token: 'fcm-token-value-that-is-long-enough', settings: {} });
  assert.equal(message.message.data.disallowed, '1');
  assert.equal(message.message.data.replaces, 'sr:match:1:goal:home:1');
});

test('a match missing from one poll keeps its score, so the goal on return is not lost', () => {
  const before = [ROW('sr:match:1', { homeScore: 0 })];
  const gap = carryForward(before, [], 1_000);
  assert.equal(gap.length, 1);
  assert.equal(gap[0].missingSince, 1_000);
  const back = carryForward(gap, [ROW('sr:match:1', { homeScore: 1 })], 31_000);
  const notes = diffMatches(gap, back);
  assert.deepEqual(notes.map((note) => note.id), ['sr:match:1:goal:home:1']);
  assert.equal(carryForward(gap, [], 1_000 + CARRY_MS + 1).length, 0);
});

test('a dead or foreign token is dropped, a server error is retried', () => {
  assert.equal(tokenIsDead(404, {}), true);
  assert.equal(tokenIsDead(400, { error: { status: 'INVALID_ARGUMENT', message: 'The registration token is not a valid FCM registration token' } }), true);
  assert.equal(tokenIsDead(403, { error: { status: 'PERMISSION_DENIED', details: [{ errorCode: 'SENDER_ID_MISMATCH' }] } }), true);
  assert.equal(tokenIsDead(400, { error: { status: 'INVALID_ARGUMENT', message: 'Invalid JSON payload' } }), false);
  assert.equal(tokenIsDead(503, {}), false);
  assert.equal(ttlFor('goal'), '900s');
  assert.equal(ttlFor('win'), '3600s');
});

test('a refreshed token replaces the old one and keeps its sent ids', () => {
  const dir = mkdtempSync(join(tmpdir(), 'betspapa-push-'));
  const book = createDeviceBook(dir);
  book.register({ token: 'old-fcm-token-value-long-enough', follows: { matches: ['sr:match:1'], teams: [] } });
  book.remember('old-fcm-token-value-long-enough', 'sr:match:1:goal:home:1');
  book.register({ token: 'new-fcm-token-value-long-enough', previousToken: 'old-fcm-token-value-long-enough' });
  assert.deepEqual(book.list().map((device) => device.token), ['new-fcm-token-value-long-enough']);
  assert.equal(book.alreadySent('new-fcm-token-value-long-enough', 'sr:match:1:goal:home:1'), true);
  assert.deepEqual(book.list()[0].follows.matches, ['sr:match:1']);
});

function watchHarness({ detail } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'betspapa-push-'));
  const book = createDeviceBook(dir);
  book.register({
    token: 'fcm-token-value-that-is-long-enough',
    follows: { matches: ['sr:match:1'], teams: [] },
    trends: ['sr:match:1:home'],
    bookings: [{ id: 'sr:match:1:home', odds: 1.3 }],
  });
  const state = { events: [], now: 1_000_000, failNext: 0 };
  const sent = [];
  const env = { FCM_SERVICE_ACCOUNT_JSON: '{"project_id":"betspapa-app","client_email":"push@betspapa-app.iam.gserviceaccount.com","private_key":"test-key"}' };
  const fetchImpl = async () => ({ ok: true, json: async () => ({ data: [{ name: 'League', categoryName: 'Ghana', events: state.events }] }) });
  const send = async (_account, message) => {
    if (state.failNext > 0) {
      state.failNext -= 1;
      const error = new Error('FCM returned 503');
      error.retryable = true;
      throw error;
    }
    sent.push(message.message.data);
    return { dropped: false, ok: true, status: 200, body: { name: 'projects/betspapa-app/messages/1' } };
  };
  const watch = startPushWatch({ dir, book, env, fetchImpl, send, log() {}, now: () => state.now, detailImpl: detail });
  return { watch, state, sent };
}

const EVENT = (score, extra = {}) => ({ eventId: 'sr:match:1', homeTeamName: 'Hearts', awayTeamName: 'Kotoko', matchStatus: 'H2', status: 1, setScore: score, playedSeconds: '84:10', ...extra });

test('a followed match that leaves the live list at the end gets full time and settles its trend', async () => {
  const { watch, state, sent } = watchHarness({ detail: async () => ({ eventId: 'sr:match:1', matchStatus: 'Ended', status: 3, setScore: '2:0' }) });
  state.events = [EVENT('2:0')];
  await watch.tick();
  state.now += 30_000;
  state.events = [];
  await watch.tick();
  const kinds = sent.map((data) => data.kind);
  assert.deepEqual(kinds.sort(), ['ft', 'win']);
  assert.equal(sent.find((data) => data.kind === 'ft').title, 'Full-time: Hearts 2-0 Kotoko');
});

test('a goal FCM refused with 503 is sent on the next poll, once', async () => {
  const { watch, state, sent } = watchHarness();
  state.events = [EVENT('0:0')];
  await watch.tick();
  state.now += 25_000;
  state.events = [EVENT('1:0')];
  state.failNext = 1;
  await watch.tick();
  assert.equal(sent.length, 0);
  state.now += 25_000;
  await watch.tick();
  state.now += 25_000;
  await watch.tick();
  assert.deepEqual(sent.map((data) => data.id), ['sr:match:1:goal:home:1']);
});

test('after a long feed outage the next poll does not replay old goals', async () => {
  const { watch, state, sent } = watchHarness();
  state.events = [EVENT('0:0')];
  await watch.tick();
  state.now += BASELINE_MAX_AGE_MS + 60_000;
  state.events = [EVENT('3:0')];
  await watch.tick();
  assert.equal(sent.length, 0);
  state.now += 25_000;
  state.events = [EVENT('4:0')];
  await watch.tick();
  assert.deepEqual(sent.map((data) => data.id), ['sr:match:1:goal:home:4']);
});

test('a tracked slip alerts once, only after every leg has a final score', () => {
  const device = {
    builderSlip: builderSlipFrom({
      builderSlip: {
        id: 'abc',
        legs: [
          { eventId: 'sr:match:1', market: 'over15', odds: 1.25, home: 'Chelsea', away: 'Leeds', label: 'Over 1.5 goals' },
          { eventId: 'sr:match:2', market: 'over15', odds: 1.22, home: 'Aston Villa', away: 'Sunderland', label: 'Over 1.5 goals' },
        ],
      },
    }),
  };
  const playing = slipNote(device, [{ id: 'sr:match:1', status: 'live', homeScore: 1, awayScore: 0, home: 'Chelsea', away: 'Leeds' }]);
  assert.equal(playing.note, null);
  const one = slipNote(device, [{ id: 'sr:match:1', status: 'finished', homeScore: 2, awayScore: 1, home: 'Chelsea', away: 'Leeds' }]);
  assert.equal(one.note, null);
  const done = slipNote(device, [{ id: 'sr:match:2', status: 'finished', homeScore: 0, awayScore: 0, home: 'Aston Villa', away: 'Sunderland' }]);
  assert.equal(done.note.id, 'slip:abc');
  assert.equal(done.note.kind, 'slip');
  assert.equal(done.note.route, 'slip');
  assert.match(done.note.title, /Slip lost · 1 of 2 legs won/);
  assert.match(done.note.body, /Aston Villa 0-0 Sunderland missed Over 1.5 goals/);
  assert.match(done.note.body, /Chelsea 2-1 Leeds landed/);
  assert.equal(channelFor('slip', {}), 'betspapa.goal.off.v4');
});
