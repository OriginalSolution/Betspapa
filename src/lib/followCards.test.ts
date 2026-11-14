import { describe, expect, it } from 'vitest';
import { groupFollowMatches, type FollowRow } from './followCards';

function row(patch: Partial<FollowRow> = {}): FollowRow {
  return {
    id: 'sr:match:1:over15',
    eventId: 'sr:match:1',
    market: 'over15',
    marketLabel: 'Over 1.5 goals',
    odds: 1.2,
    sample: '9/10',
    home: 'Bengaluru Utd',
    away: 'Real Kashmir',
    kickoff: '2026-11-14T10:30:00.000Z',
    ...patch,
  };
}

describe('followed trend cards', () => {
  it('merges markets onto one match and drops a row with no teams', () => {
    const cards = groupFollowMatches([
      row(),
      row({ id: 'sr:match:1:over15-again', sample: '8/10' }),
      row({ id: 'sr:match:1:home-score', market: 'home-score', marketLabel: 'Home to score', odds: 1.2, sample: '8/10' }),
      row({ id: 'sr:match:2:over15', eventId: 'sr:match:2', home: '', away: '' }),
    ]);
    expect(cards).toHaveLength(1);
    expect(cards[0]?.chips.map((chip) => chip.market)).toEqual(['over15', 'home-score']);
    expect(cards[0]?.chips[0]?.sample).toBe('9/10');
  });
});
