import assert from 'node:assert/strict';
import test from 'node:test';
import { contextOf, posterFrom, priced, shareCardFrom, weekendBankers } from './plan.mjs';
import { fontFiles, svgToPng } from './raster.mjs';
import { shareSvg } from './art.mjs';
import { playerSvg, starFor } from './players.mjs';

const engine = {
  master: {
    bookedAt: '2026-11-13T16:57:00.000Z',
    legs: [
      { eventId: 'sr:match:1', market: 'over15', match: 'Heart of Lions vs Dreams FC', kickoff: '2026-11-14T15:00:00.000Z', odds: 1.68, occurrence: 84, sample: '8/10' },
      { eventId: 'sr:match:2', market: 'home', match: 'Short vs Price', kickoff: '2026-11-14T15:00:00.000Z', odds: 1.08, occurrence: 90, sample: '9/10' },
    ],
    books: {
      sportybet: { parts: [{ code: 'REAL1042', totalOdds: 3.84, legs: 8 }] },
      footballcom: { parts: [{ code: 'x', link: 'bad' }] },
      betika: { parts: [] },
    },
  },
  trends: [
    {
      label: 'Over 1.5',
      market: 'over15',
      legs: [{ eventId: 'sr:match:9', market: 'over15', match: 'Kosovo vs Israel', kickoff: '2026-11-14T17:00:00.000Z', odds: 1.23, occurrence: 88, sample: '8/10' }],
      books: { msport: { parts: [{ code: 'MSPORT88', totalOdds: 2.1, legs: 4 }] } },
    },
  ],
};

test('a share card keeps real codes and drops a price under 1.20', () => {
  assert.equal(priced(1.19), null);
  assert.equal(priced(1.2), 1.2);
  const card = shareCardFrom(engine);
  assert.equal(card.codes.map((row) => row.name).join(','), 'SportyBet');
  assert.equal(card.legs.some((leg) => leg.odds < 1.2), false);
  assert.equal(card.code, 'REAL1042');
});

test('a poster needs a big fixture inside the three-hour window and a real code', () => {
  const now = new Date('2026-11-14T12:00:00.000Z');
  const event = { eventId: 'sr:match:1', home: 'Heart of Lions', away: 'Dreams FC', kickoff: '2026-11-14T15:00:00.000Z', tournament: 'Ghana Premier League', country: 'Ghana' };
  assert.equal(contextOf(event), 'club');
  const poster = posterFrom(event, engine, now);
  assert.equal(poster.code, 'REAL1042');
  assert.equal(poster.kicker, 'CLUB MATCH DAY');
  assert.equal(posterFrom({ ...event, kickoff: '2026-11-14T20:00:00.000Z' }, engine, now), null);
  assert.equal(posterFrom({ ...event, tournament: 'Regional Cup' }, engine, now), null);
});

test('weekend bankers run at 06:00 Accra and need a real code', () => {
  const saturday = new Date('2026-11-14T06:00:00.000Z');
  const card = weekendBankers(engine, saturday);
  assert.equal(card.code, 'MSPORT88');
  assert.equal(card.picks.every((pick) => pick.odds >= 1.2), true);
  assert.equal(weekendBankers(engine, new Date('2026-11-14T07:00:00.000Z')), null);
});

test('a huge master is replaced by a real 4-to-8 leg code', () => {
  const huge = {
    master: {
      bookedAt: '2026-11-13T16:57:00.000Z',
      legs: [{ eventId: 'sr:match:1', market: 'over15', match: 'A vs B', kickoff: '2026-11-14T15:00:00.000Z', odds: 1.4, occurrence: 90, sample: '9/10' }],
      books: { sportybet: { parts: [{ code: 'BIGMASTER', totalOdds: 47280.9, legs: 30 }] } },
    },
    trends: [
      {
        label: 'Double chance 12',
        legs: [{ eventId: 'sr:match:9', market: 'dc-12', match: 'Kosovo vs Israel', kickoff: '2026-11-14T17:00:00.000Z', odds: 1.4, occurrence: 88, sample: '8/10' }],
        books: { sportybet: { parts: [{ code: 'SMALL88', totalOdds: 5.62, legs: 8, matches: ['sr:match:9'] }] } },
      },
    ],
  };
  const card = shareCardFrom(huge);
  assert.equal(card.code, 'SMALL88');
  assert.equal(card.total, 5.62);
  assert.equal(card.legCount, 8);
  assert.equal(card.fullNote, 'Full 30-leg master in the app');
  assert.equal(card.codes.some((row) => row.code === 'BIGMASTER'), false);
});

test('the away shirt number is not inside the mirrored body', () => {
  const svg = playerSvg('away', starFor('arsenal'), { mirror: true, x: 10, y: 20, scale: 2 });
  const body = svg.slice(svg.indexOf('scale(-'), svg.indexOf('</g>'));
  assert.equal(body.includes('<text'), false);
  assert.match(svg, />7</);
});

test('the share card renders to a PNG with the app fonts', () => {
  assert.ok(fontFiles().some((file) => file.endsWith('BarlowCondensed-Bold.ttf')));
  assert.ok(fontFiles().some((file) => file.endsWith('Outfit-Bold.ttf')));
  const card = shareCardFrom(engine);
  const svg = shareSvg(card, {});
  assert.match(svg, /Barlow Condensed/);
  assert.match(svg, /Outfit/);
  const png = svgToPng(svg);
  assert.equal(png[0], 0x89);
  assert.equal(png[1], 0x50);
  assert.ok(png.length > 1000);
});
