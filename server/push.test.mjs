import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { acceptDevice, channelFor, createDeviceBook, diffMatches, fcmConfigured, messageFor, normalizeLive, notesForDevice, publicFcm, PUSH_TTL, startPushWatch, trendNotes } from './push.mjs';

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
  assert.equal(message.message.android.ttl, PUSH_TTL);
  assert.equal(PUSH_TTL, '3600s');
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
  assert.equal(sent[0].message.android.ttl, '3600s');
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
