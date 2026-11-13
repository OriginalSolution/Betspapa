import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptDevice, channelFor, diffMatches, fcmConfigured, messageFor, normalizeLive, notesForDevice } from './push.mjs';

test('FCM stays off until a service account is configured', () => {
  assert.equal(fcmConfigured({}), false);
  assert.equal(fcmConfigured({ FCM_SERVICE_ACCOUNT_JSON: '{"project_id":"betspapa"}' }), true);
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
  const message = messageFor(mine[0], accepted.device);
  assert.equal(message.message.android.priority, 'HIGH');
  assert.equal(message.message.android.notification.channel_id, 'betspapa.goal.horn.v4');
  assert.equal(message.message.android.notification.tag, 'sr:match:1:goal:home:1');
});
