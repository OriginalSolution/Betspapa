import test from 'node:test';
import assert from 'node:assert/strict';
import { diffMatches, messageFor, slipNote, trendNotes } from './push.mjs';
import { codeNoticeCopy } from './banker.mjs';
import { goalCopy, kickoffCopy, legScore, scoreLine } from '../src/lib/noteCopy.mjs';

const row = (patch = {}) => ({
  id: 'sr:match:9',
  home: 'Manchester United',
  away: 'Brighton & Hove Albion',
  homeCompetitor: 'sr:competitor:35',
  awayCompetitor: 'sr:competitor:30',
  status: 'live',
  minute: 10,
  homeScore: 0,
  awayScore: 0,
  competition: 'Premier League',
  incidents: [],
  ...patch,
});

const device = { token: 't'.repeat(40), settings: { goalSound: 'crowd' } };

test('every match alert names both clubs in full', () => {
  const kickoff = diffMatches([row({ status: 'scheduled', minute: null })], [row({ minute: 1 })]);
  assert.equal(kickoff[0].title, 'Kick-off: Manchester United vs Brighton & Hove Albion');
  assert.equal(kickoff[0].body, 'Premier League · underway');

  const goal = diffMatches([row()], [row({ minute: 23, awayScore: 1 })]);
  assert.equal(goal[0].title, 'GOAL! Manchester United 0-1 Brighton & Hove Albion');
  assert.equal(goal[0].body, '23′ · Brighton & Hove Albion score');

  const red = diffMatches(
    [row({ homeScore: 1 })],
    [row({ homeScore: 1, minute: 61, incidents: [{ type: 'red', side: 'away', minute: 60, player: 'Lewis Dunk', key: 'red:away:60' }] })],
  );
  assert.equal(red[0].title, 'RED CARD! Manchester United 1-0 Brighton & Hove Albion');
  assert.equal(red[0].body, 'Lewis Dunk 60′ · Brighton & Hove Albion');

  const ht = diffMatches([row({ homeScore: 1, minute: 45 })], [row({ homeScore: 1, status: 'halftime', minute: 45 })]);
  assert.equal(ht[0].title, 'Half-time: Manchester United 1-0 Brighton & Hove Albion');

  const ft = diffMatches([row({ homeScore: 2, awayScore: 2, minute: 90 })], [row({ homeScore: 2, awayScore: 2, status: 'finished', minute: 90 })]);
  assert.equal(ft[0].title, 'Full-time: Manchester United 2-2 Brighton & Hove Albion');

  const disallowed = diffMatches([row({ homeScore: 1 })], [row({ homeScore: 0, minute: 30 })]);
  assert.equal(disallowed[0].title, 'GOAL DISALLOWED! Manchester United 0-0 Brighton & Hove Albion');
  assert.equal(disallowed[0].body, '30′ · VAR rules out the Manchester United goal');

  const review = diffMatches([row({ homeScore: 1 })], [row({ homeScore: 1, minute: 33, varReview: { teamId: 'sr:competitor:35', player: 'Rasmus Hojlund', minute: 32 } })]);
  assert.equal(review[0].title, 'VAR CHECK: Manchester United 1-0 Brighton & Hove Albion');
  assert.equal(review[0].body, 'Rasmus Hojlund 32′ · Manchester United goal under review');

  for (const note of [...kickoff, ...goal, ...red, ...ht, ...ft, ...disallowed, ...review]) {
    assert.doesNotMatch(`${note.title} ${note.body}`, /\bHome\b|\bAway\b|\bMU\b|\bBH\b|undefined|null/);
  }
});

test('the push carries the scorer, side and minute so the phone card can show them', () => {
  const [red] = diffMatches(
    [row()],
    [row({ minute: 61, incidents: [{ type: 'red', side: 'away', minute: 60, player: 'Lewis Dunk', key: 'red:away:60' }] })],
  );
  const data = messageFor(red, device).message.data;
  assert.equal(data.player, 'Lewis Dunk');
  assert.equal(data.side, 'away');
  assert.equal(data.minute, '60');
  assert.equal(data.home, 'Manchester United');
  assert.equal(data.away, 'Brighton & Hove Albion');
});

test('a trend hit names the fixture and score in full', () => {
  const notes = trendNotes([row({ homeScore: 1, awayScore: 1 })], [row({ homeScore: 2, awayScore: 1, minute: 70 })], { trends: ['sr:match:9:over25'] });
  assert.equal(notes.length, 1);
  assert.equal(notes[0].body, 'Manchester United 2-1 Brighton & Hove Albion · 70′ · Over 2.5');
  assert.equal(notes[0].fixture, 'Manchester United 2-1 Brighton & Hove Albion');
  assert.equal(notes[0].marketLabel, 'Over 2.5');
  assert.equal(notes[0].clock, '70′');
  assert.notEqual(notes[0].body, 'Trend hit');
  const data = messageFor(notes[0], device).message.data;
  assert.match(data.body, /Manchester United 2-1 Brighton & Hove Albion · 70′/);
  assert.match(data.body, /Over 2.5/);
  assert.equal(data.home, 'Manchester United');
  assert.equal(data.away, 'Brighton & Hove Albion');
  assert.equal(data.homeScore, '2');
  assert.equal(data.awayScore, '1');
  assert.notEqual(data.body, 'Trend hit');
});

test('a body that is only Trend hit is replaced with the score, pick, tier, odds, slip and count', () => {
  const message = messageFor({
    id: 'slipleg:qc:sr:match:1|over15',
    kind: 'win',
    title: 'Leg won',
    body: 'Trend hit',
    marketLabel: 'Over 1.5',
    trendLabel: '80%+ Over 1.5',
    odds: '1.45',
    slip: 'Daily slip',
    code: 'AB12CD',
    progress: '29 of 36 won',
    clock: 'FT',
    fixture: 'Arsenal 2-1 Chelsea',
    match: { home: 'Arsenal', away: 'Chelsea', homeScore: 2, awayScore: 1, status: 'finished' },
  }, device).message;
  assert.equal(message.notification, undefined);
  const data = message.data;
  assert.equal(data.body.includes('Trend hit'), false);
  assert.match(data.body, /Arsenal 2-1 Chelsea · FT/);
  assert.match(data.body, /Over 1.5/);
  assert.match(data.body, /80%\+ Over 1.5/);
  assert.match(data.body, /1\.45/);
  assert.match(data.body, /Daily slip/);
  assert.match(data.body, /AB12CD/);
  assert.match(data.body, /29 of 36 won/);
  assert.equal(data.marketLabel, 'Over 1.5');
  assert.equal(data.slip, 'Daily slip');
  assert.equal(data.progress, '29 of 36 won');
});

test('code alerts name the real fixtures', () => {
  const legs = [
    { home: 'Arsenal', away: 'Chelsea', score: '2:1', bookResult: 'won', label: 'Over 1.5 goals' },
    { home: 'Real Madrid', away: 'Getafe', score: '3-0', bookResult: 'won', label: 'Home win' },
    { home: 'Hearts of Oak', away: 'Asante Kotoko', score: '0-0', bookResult: 'won', label: 'Under 3.5 goals' },
  ];
  const booked = codeNoticeCopy({ code: 'ABC123', legs }, 'booked', 'Daily');
  assert.equal(booked.title, 'Daily ABC123 booked');
  assert.equal(booked.body, '3 legs: Arsenal v Chelsea, Real Madrid v Getafe and 1 more.');
  const won = codeNoticeCopy({ code: 'ABC123', legs }, 'settled', 'Daily');
  assert.equal(won.title, 'Daily ABC123 won');
  assert.equal(won.body, '3 legs landed: Arsenal 2-1 Chelsea, Real Madrid 3-0 Getafe and 1 more.');
  const lostLegs = legs.map((leg, index) => (index === 1 ? { ...leg, bookResult: 'lost', score: '0-1' } : leg));
  const lost = codeNoticeCopy({ code: 'ABC123', legs: lostLegs }, 'settled', 'Daily');
  assert.equal(lost.title, 'Daily ABC123 lost');
  assert.equal(lost.body, 'Real Madrid 0-1 Getafe missed Home win.');
});

test('a slip result names each fixture with its score', () => {
  const device = {
    builderSlip: { id: 's1', legs: [
      { key: 'sr:match:1|over15', eventId: 'sr:match:1', market: 'over15', home: 'Chelsea FC', away: 'Leeds United', label: 'Over 1.5 goals' },
    ] },
  };
  const done = slipNote(device, [{ id: 'sr:match:1', status: 'finished', homeScore: 3, awayScore: 1, home: 'Chelsea FC', away: 'Leeds United' }]);
  assert.equal(done.note.body, 'Chelsea FC 3-1 Leeds United landed.');
});

test('a missing name falls back to a neutral label, never "undefined"', () => {
  assert.equal(scoreLine({ home: '', away: 'Chelsea', homeScore: 1, awayScore: null }), 'Home team 1-0 Chelsea');
  assert.equal(goalCopy({ home: 'Arsenal', away: null, homeScore: 1, awayScore: 0 }, 'home', { minute: null }).title, 'GOAL! Arsenal 1-0 Away team');
  assert.equal(goalCopy({ home: 'Arsenal', away: 'Chelsea', homeScore: 1, awayScore: 0 }, 'home', { player: 'Saka', minute: 54 }).body, 'Saka 54′ · Arsenal');
  assert.equal(kickoffCopy({}).title, 'Kick-off: Home team vs Away team');
  assert.equal(legScore({ home: 'Arsenal' }, '1-0'), 'Arsenal 1-0');
});
