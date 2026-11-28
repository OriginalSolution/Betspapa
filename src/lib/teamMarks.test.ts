import { describe, expect, it } from 'vitest';
import type { ListItem } from '../data/board';
import type { EngineState } from './engineSlips';
import { codeLegHidden, legBlocked, personalLegs, pickBlocked, teamOnList } from './teamMarks';

const lists: ListItem[] = [
  { scope: 'team', id: 'sr:competitor:344394', name: 'Uttaradit Saksiam FC', list: 'black' },
  { scope: 'team', id: 'benfica', name: 'Benfica', list: 'green' },
];

describe('team marks', () => {
  it('matches a club by id or by name', () => {
    expect(teamOnList(lists, 'black', { id: 'other', name: 'Uttaradit Saksiam FC' })).toBe(true);
    expect(teamOnList(lists, 'black', { id: 'sr:competitor:344394', name: 'Uttaradit' })).toBe(true);
    expect(teamOnList(lists, 'black', { name: 'Songkhla FC' })).toBe(false);
  });

  it('drops a leg or a pick when either side is blacklisted', () => {
    expect(legBlocked(lists, { home: 'Uttaradit Saksiam FC', away: 'Songkhla FC' })).toBe(true);
    expect(legBlocked(lists, { home: 'Chirundu United', away: 'Zesco United' })).toBe(false);
    expect(pickBlocked(lists, { teamId: 'songkhla', teamName: 'Songkhla FC', opponentName: 'Uttaradit Saksiam FC' })).toBe(true);
  });

  it('hides a code leg on a blacklisted team, competition, or market', () => {
    const marked: ListItem[] = [
      ...lists,
      { scope: 'competition', id: 'sr:tournament:1', name: 'Serie A', list: 'black' },
      { scope: 'market', id: 'over25', name: 'Over 2.5', list: 'black' },
    ];
    expect(codeLegHidden(marked, { home: 'Frosinone', away: 'Parma', league: 'Serie A' })).toBe(true);
    expect(codeLegHidden(marked, { home: 'Frosinone', away: 'Parma', market: 'over25' })).toBe(true);
    expect(codeLegHidden(marked, { home: 'Frosinone', away: 'Parma', market: 'over15', league: 'Ligue 2' })).toBe(false);
  });

  it('builds a personal code without a blacklisted team and keeps a published greenlit team', () => {
    const state = {
      master: {
        legs: [
          { eventId: 'sr:match:1', market: 'dc-1x', odds: 1.2, kickoff: '2026-11-27T12:00:00Z', match: 'Uttaradit Saksiam FC vs Songkhla FC', home: 'Uttaradit Saksiam FC', away: 'Songkhla FC' },
          { eventId: 'sr:match:2', market: 'over25', odds: 1.4, kickoff: '2026-11-27T12:00:00Z', match: 'Viktoria Plzen vs Benfica', home: 'Viktoria Plzen', away: 'Benfica' },
          { eventId: 'sr:match:3', market: 'over15', odds: 1.1, kickoff: '2026-11-27T12:00:00Z', match: 'Short vs Price', home: 'Short', away: 'Price' },
        ],
      },
      trends: [],
      tiers: [],
    } as unknown as EngineState;
    const legs = personalLegs(state, lists);
    expect(legs.map((leg) => leg.eventId)).toEqual(['sr:match:2']);
  });
});
