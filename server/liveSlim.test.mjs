import assert from 'node:assert/strict';
import test from 'node:test';
import { slimLivePayload } from './liveSlim.mjs';

test('the live payload keeps scores and the lines the board reads', () => {
  const slim = slimLivePayload({
    data: [
      {
        name: 'Premier League',
        events: [
          {
            eventId: 'sr:match:1',
            homeTeamName: 'Alpha',
            awayTeamName: 'Beta',
            matchStatus: 'H1',
            status: 1,
            setScore: '1-0',
            markets: [
              { id: '1', outcomes: [{ id: '1', odds: '1.4' }] },
              { id: '890', outcomes: [{ id: 'x', odds: '9' }, { id: 'y', odds: '9' }] },
            ],
          },
        ],
      },
    ],
  });
  const event = slim.data[0].events[0];
  assert.equal(event.setScore, '1-0');
  assert.deepEqual(event.markets.map((market) => String(market.id)), ['1']);
  assert.ok(Buffer.byteLength(JSON.stringify(slim)) < 800);
});
