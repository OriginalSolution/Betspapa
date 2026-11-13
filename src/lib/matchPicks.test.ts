import { describe, expect, it } from 'vitest';
import { bestTrendChip, cardsFromEngine, combinedOdds, hitRate, marketFilters, tipsFromEngine, trendChipText } from './matchPicks';
import type { EngineState } from './engineSlips';
import type { Match } from '../types';

function state(): EngineState {
  return {
    updatedAt: '2026-11-13T12:00:00.000Z',
    master: null,
    trends: [
      {
        id: '80:home',
        label: '80%+ Full-time home win',
        market: 'home',
        legCount: 3,
        legs: [
          { eventId: 'sr:match:1', market: 'home', match: 'AL Peshmerga vs Al-Qasim SC', kickoff: '2026-11-13T18:00:00.000Z', odds: 1.01, occurrence: 90, sample: '9/10' },
          { eventId: 'sr:match:2', market: 'home', match: 'Alpha vs Beta', kickoff: '2026-11-13T16:00:00.000Z', odds: 1.04, occurrence: 80, sample: '8/10' },
          { eventId: 'sr:match:3', market: 'home', match: 'Hearts vs Kotoko', kickoff: '2026-11-13T15:00:00.000Z', odds: 1.2, occurrence: 80, sample: '8/10' },
        ],
        sameAsMaster: false,
        bookedAt: null,
        books: {},
      },
      {
        id: '80:over15',
        label: '80%+ Over 1.5',
        market: 'over15',
        legCount: 1,
        legs: [
          { eventId: 'sr:match:3', market: 'over15', match: 'Hearts vs Kotoko', kickoff: '2026-11-13T15:00:00.000Z', odds: 1.55, occurrence: 100, sample: '10/10' },
        ],
        sameAsMaster: false,
        bookedAt: null,
        books: {},
      },
    ],
  };
}

const board: Match[] = [
  {
    id: 'sr:match:3',
    competition: { id: 'gha', name: 'Premier League', area: 'Ghana', code: 'GHA', priority: 4 },
    utcDate: '2026-11-13T15:00:00.000Z',
    status: 'scheduled',
    minute: null,
    injuryTime: null,
    home: { id: 'hearts', name: 'Hearts of Oak', shortName: 'Hearts', abbr: 'HOO', color: '#e11d2e' },
    away: { id: 'kotoko', name: 'Asante Kotoko', shortName: 'Kotoko', abbr: 'AK', color: '#f5c518' },
    homeScore: null,
    awayScore: null,
    htHome: null,
    htAway: null,
    events: [],
    venue: null,
    feed: 'sporty',
  },
];

describe('match-first picks', () => {
  it('drops 1.01 and 1.04 and keeps 1.20 with the engine hit rate', () => {
    expect(hitRate(80, '8/10')).toBe(0.8);
    expect(hitRate(null, null)).toBeNull();
    const cards = cardsFromEngine(state(), board, 'kickoff');
    const prices = cards.flatMap((card) => card.chips.map((chip) => chip.odds));
    expect(prices.every((odds) => odds >= 1.2)).toBe(true);
    expect(prices).not.toContain(1.01);
    expect(prices).not.toContain(1.04);
    expect(cards.map((card) => card.eventId)).toEqual(['sr:match:3']);
    expect(cards[0]?.league).toBe('Premier League');
    expect(cards[0]?.chips.map((chip) => chip.sample)).toEqual(['10/10', '8/10']);
    expect(cards[0]?.chips.every((chip) => chip.rate !== 1 / chip.odds)).toBe(true);
    expect(cardsFromEngine(state(), board, 'confidence')[0]?.chips[0]?.market).toBe('over15');
    expect(combinedOdds(cards[0]?.chips || [])).toBe(1.86);
  });

  it('picks one real 80% chip and skips a match with nothing at 1.20', () => {
    const hearts = board[0];
    const chip = bestTrendChip(state(), hearts);
    expect(chip?.market).toBe('over15');
    expect(chip?.sample).toBe('10/10');
    expect(chip?.odds).toBeGreaterThanOrEqual(1.2);
    expect(trendChipText(chip!)).toBe('Over 1.5 · 10/10 · 1.55');
    const quiet = { ...state(), trends: state().trends.map((trend) => ({ ...trend, legs: trend.legs.filter((leg) => leg.eventId !== 'sr:match:3') })) };
    expect(bestTrendChip(quiet, hearts)).toBeNull();
    const percentOnly = {
      ...state(),
      trends: [
        {
          ...state().trends[1],
          legs: [{ ...state().trends[1].legs[0], occurrence: 90, sample: null }],
        },
      ],
    };
    expect(bestTrendChip(percentOnly, hearts)).toBeNull();
  });

  it('lists one compact tip per market, hides a short price, and keeps real form only when the engine sent it', () => {
    const rich = state();
    const over = rich.trends[1].legs[0];
    over.form = ['W', 'W', 'D', 'W', 'W'];
    over.opponentHeld = true;
    const home = rich.trends[0].legs[2];
    home.form = ['L', 'W'];
    home.opponentHeld = false;
    const tips = tipsFromEngine(rich, board);
    expect(tips.map((tip) => tip.chip.market)).toEqual(['over15', 'home']);
    expect(tips.every((tip) => tip.chip.odds >= 1.2)).toBe(true);
    expect(tips[0]?.chip.form).toEqual(['W', 'W', 'D', 'W', 'W']);
    expect(tips[0]?.chip.opponentHeld).toBe(true);
    expect(tips[1]?.chip.opponentHeld).toBe(false);
    expect(tips[1]?.chip.form).toEqual(['L', 'W']);
    expect(marketFilters(tips).map((chip) => chip.label)).toEqual(['O1.5', 'FT1']);
    const simulated = {
      ...board[0],
      id: 'sr:match:srl',
      competition: { ...board[0].competition, name: 'UEFA Nations League SRL', area: 'Simulated Reality League' },
      home: { ...board[0].home, name: 'Andorra SRL', shortName: 'Andorra SRL' },
      away: { ...board[0].away, name: 'Gibraltar SRL', shortName: 'Gibraltar SRL' },
    };
    const fake = {
      ...rich,
      trends: [
        {
          ...rich.trends[1],
          legs: [{ ...over, eventId: 'sr:match:srl', match: 'Andorra SRL vs Gibraltar SRL' }],
        },
      ],
    };
    expect(tipsFromEngine(fake, [simulated])).toEqual([]);
  });
});
