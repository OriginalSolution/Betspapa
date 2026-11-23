import assert from 'node:assert/strict';
import test from 'node:test';
import { OCCURRENCE_MARKETS } from './occurrence.mjs';
import { indexLeagues, judgeLeague, oddsBand, rememberSettled, reviewPick, scoringProfile } from './research.mjs';

function row(partial) {
  return {
    matchId: 1,
    uts: 1,
    teamIsHome: true,
    neutral: false,
    ftHome: 1,
    ftAway: 0,
    tournament: 'Premier League',
    ...partial,
  };
}

test('a settled odds band blocks a price the league has not been landing', () => {
  const market = OCCURRENCE_MARKETS.find((item) => item.id === 'over25');
  const matches = Array.from({ length: 16 }, (_, index) => row({ matchId: index + 1, uts: 100 - index, ftHome: 3, ftAway: 1 }));
  const settled = Array.from({ length: 8 }, (_, index) => ({
    key: `sr:match:${index}|over25`,
    league: 'premier league',
    market: 'over25',
    band: oddsBand('over25', 1.4).id,
    status: 'bust',
  }));
  const verdict = judgeLeague({ matches, market, odds: 1.4, settled, leagueName: 'premier league' });
  assert.equal(verdict.action, 'block');
  assert.match(verdict.reasons.join(' '), /odds band is blocked/);
});

test('both teams can hit a line while their scoring average does not support it', () => {
  const market = OCCURRENCE_MARKETS.find((item) => item.id === 'over25');
  const home = Array.from({ length: 10 }, (_, index) => row({ matchId: index + 1, uts: 50 - index, ftHome: index < 6 ? 3 : 0, ftAway: 0, tournament: '' }));
  const away = home.map((item, index) => ({ ...item, matchId: index + 30, teamIsHome: false, ftHome: index < 6 ? 3 : 0, ftAway: 0 }));
  const homeRate = { hits: 6, sample: 10, rate: 0.6 };
  const awayRate = { hits: 6, sample: 10, rate: 0.6 };
  const review = reviewPick({
    market,
    trend: { hits: 6, sample: 10, rate: 0.6 },
    records: { home: homeRate, away: awayRate },
    homeRows: home,
    awayRows: away,
    odds: 1.4,
    event: { tournament: 'Premier League', country: 'England' },
    leagueIndex: indexLeagues(new Map()),
    settled: [],
    leagueTable: { leagues: {} },
  });
  assert.equal(review.publish, false);
  assert.equal(review.teamPass, false);
  assert.match(review.reasons.join(' '), /does not support over 2.5/);
  assert.ok(scoringProfile(home).total < 2.2);
});

test('settled results are stored once per match and market', () => {
  const band = oddsBand('over15', 1.25);
  const rows = rememberSettled([], [
    { eventId: 'sr:match:1', market: 'over15', odds: 1.25, status: 'won', tournament: 'Premier League' },
    { eventId: 'sr:match:1', market: 'over15', odds: 1.25, status: 'bust', tournament: 'Premier League' },
    { eventId: 'sr:match:2', market: 'over15', odds: 1.25, status: 'open', tournament: 'Premier League' },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'bust');
  assert.equal(rows[0].band, band.id);
  assert.equal(rows[0].league, 'premier league');
});
