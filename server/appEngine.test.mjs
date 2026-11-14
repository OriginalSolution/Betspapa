import assert from 'node:assert/strict';
import test from 'node:test';
import { appEngineState } from './engine.mjs';

test('the app view drops duplicated tier legs and keeps the codes', () => {
  const leg = (id) => ({ eventId: id, market: 'dc-12', match: 'A vs B', kickoff: '2026-11-14T12:00:00.000Z', odds: 1.22, occurrence: 80, sample: '8/10', form: ['W'], opponentHeld: true, extra: 'drop me' });
  const state = appEngineState({
    updatedAt: '2026-11-14T10:00:00.000Z',
    legCount: 40,
    master: { id: 'master', label: 'Master', legCount: 40, legs: Array.from({ length: 40 }, (_, index) => leg(`sr:match:${index}`)), books: { sportybet: { parts: [{ code: 'MASTER1', link: 'https://www.sportybet.com/gh/?shareCode=MASTER1', totalOdds: 2, legs: 18, matches: ['sr:match:0'] }], dropped: [{ eventId: 'x' }], kept: [{ odds: 1.2 }] } } },
    trends: [{ id: '80:dc-12', label: '80%+ Double chance 12', market: 'dc-12', legs: [leg('sr:match:1')], books: {} }],
    tiers: [{ id: 'tier:100:dc-12', label: '100% Double chance 12', market: 'dc-12', legCount: 74, legs: Array.from({ length: 74 }, (_, index) => leg(`sr:match:t${index}`)), books: { sportybet: { parts: [{ code: 'DC12100', link: 'https://www.sportybet.com/gh/?shareCode=DC12100', totalOdds: 3, legs: 18 }], error: null } } }],
  });
  assert.equal(state.master.legs.length, 18);
  assert.equal(state.master.books.sportybet.parts[0].code, 'MASTER1');
  assert.equal(state.master.books.sportybet.dropped.length, 0);
  assert.equal(state.trends[0].legs.length, 1);
  assert.equal(state.tiers[0].legs.length, 0);
  assert.equal(state.tiers[0].legCount, 74);
  assert.equal(state.tiers[0].books.sportybet.parts[0].code, 'DC12100');
  assert.equal(JSON.stringify(state).includes('drop me'), false);
});
