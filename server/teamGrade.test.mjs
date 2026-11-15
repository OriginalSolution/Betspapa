import assert from 'node:assert/strict';
import test from 'node:test';
import { SUPPORT_RATE, TREND_RATE, gradeWithTeams } from './teamGrade.mjs';

function record(hits, sample = 10) {
  return { hits, sample, rate: hits / sample };
}

test('a missing team sample leaves the 80% trend in charge', () => {
  assert.equal(gradeWithTeams({ trend: record(7), home: record(7), away: null }), null);
  const kept = gradeWithTeams({ trend: record(10), home: record(10), away: null });
  assert.equal(kept.agreement, 'unknown');
  assert.equal(kept.teamsAgree, false);
  assert.equal(kept.rate, 1);
  assert.equal(kept.keptBy, 'trend');
  assert.equal(gradeWithTeams({ trend: record(8), home: null, away: null }).rate, TREND_RATE);
});

test('both teams supporting keeps a line the 80% trend would drop, graded on the weaker side', () => {
  const rescued = gradeWithTeams({ trend: record(7), home: record(7), away: record(6) });
  assert.equal(rescued.teamsAgree, true);
  assert.equal(rescued.keptBy, 'teams');
  assert.equal(rescued.rate, SUPPORT_RATE);
  assert.equal(rescued.hits, 6);
  assert.equal(rescued.sample, 10);
  assert.equal(rescued.homeSample, '7/10');
  assert.equal(rescued.awaySample, '6/10');
});

test('a 10/10 trend is not a sure pick unless the other team is perfect too', () => {
  const marked = gradeWithTeams({ trend: record(10), home: record(10), away: record(8) });
  assert.equal(marked.teamsAgree, true);
  assert.equal(marked.keptBy, 'agree');
  assert.equal(marked.rate, 0.8);
  assert.equal(marked.hits, 8);
  assert.equal(marked.sample, 10);
  const sure = gradeWithTeams({ trend: record(10), home: record(10), away: record(10) });
  assert.equal(sure.rate, 1);
  assert.equal(sure.hits, 10);
});

test('teams that do not both support are excluded, including a one-sided 10/10', () => {
  assert.equal(gradeWithTeams({ trend: record(10), home: record(10), away: record(2) }), null);
  assert.equal(gradeWithTeams({ trend: record(10), home: record(10), away: record(5) }), null);
  assert.equal(gradeWithTeams({ trend: record(4), home: record(4), away: record(4) }), null);
  assert.equal(gradeWithTeams({ trend: record(6), home: record(6), away: record(5) }), null);
});
