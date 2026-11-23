import { describe, expect, it } from 'vitest';
import type { PickTip } from './matchPicks';
import { combinedOdds, gradeScore, partsOf, priceAllowed, slipAlert, totalOddsLine, trendPacks, type GradedLeg } from './slipPacks';

function tip(market: string, odds: number, event = 'sr:match:1'): PickTip {
  return {
    chip: {
      id: `${event}:${market}`,
      eventId: event,
      market,
      label: market,
      short: market,
      odds,
      rate: 0.86,
      occurrence: 86,
      sample: '8/10',
      teamId: 'h',
      teamName: 'Home',
      opponentId: 'a',
      opponentName: 'Away',
      form: null,
      opponentHeld: true,
      exception: false,
      teamsAgree: true,
      homeSample: '8/10',
      awaySample: '8/10',
      leagueRisk: null,
      reasons: [],
    },
    home: 'Chelsea',
    away: 'Leeds United',
    homeId: '1',
    awayId: '2',
    league: 'Premier League',
    competitionId: 'pl',
    kickoff: '2026-11-23T20:00:00.000Z',
  };
}

function graded(partial: Partial<GradedLeg> & Pick<GradedLeg, 'status' | 'home'>): GradedLeg {
  return {
    key: partial.home,
    eventId: 'sr:match:1',
    market: 'over15',
    label: 'Over 1.5 goals',
    odds: 1.25,
    kickoff: '2026-11-23T15:00:00.000Z',
    away: 'Sunderland',
    homeCrest: null,
    awayCrest: null,
    sample: null,
    ft: '0-0',
    ht: '0-0',
    ...partial,
  };
}

describe('slip packs', () => {
  it('keeps an in-range 80% pack and drops a price outside the table', () => {
    const now = Date.parse('2026-11-23T12:00:00.000Z');
    const packs = trendPacks([tip('over15', 1.25), tip('over15', 1.9, 'sr:match:2'), tip('dc-12', 1.22, 'sr:match:3')], [], now);
    expect(packs.map((pack) => pack.id)).toEqual(['dc-12', 'over15']);
    expect(packs.find((pack) => pack.id === 'over15')?.legs).toHaveLength(1);
    expect(priceAllowed('fh-over15', 1.79)).toBe(true);
    expect(priceAllowed('fh-over15', 1.8)).toBe(false);
    expect(priceAllowed('over35', 1.6, true)).toBe(true);
  });

  it('multiplies the slip and splits every 50 legs', () => {
    expect(combinedOdds([{ odds: 1.23 }, { odds: 1.22 }, { odds: 1.25 }, { odds: 1.2 }, { odds: 1.19 }])).toBe(2.68);
    const legs = Array.from({ length: 51 }, (_, index) => index);
    expect(partsOf(legs).map((part) => part.length)).toEqual([50, 1]);
    expect(totalOddsLine([{ odds: 1.2 }, { odds: 1.25 }, { odds: 1.3 }])).toBe('Total odds 1.95');
    const long = Array.from({ length: 51 }, () => ({ odds: 1.2 }));
    expect(totalOddsLine(long)).toMatch(/^Total odds part 1 .+ · part 2 1\.20$/);
  });

  it('writes one alert when the last leg ends, and none while a leg is open', () => {
    const open: GradedLeg[] = [graded({ status: 'won', home: 'Chelsea', ft: '1-4' }), graded({ status: 'open', home: 'Aston Villa', ft: null })];
    expect(slipAlert(open)).toBeNull();
    const done = slipAlert([
      graded({ status: 'won', home: 'Chelsea', ft: '1-4' }),
      graded({ status: 'won', home: 'West Ham', ft: '2-0' }),
      graded({ status: 'lost', home: 'Aston Villa', away: 'Sunderland', ft: '0-0', label: 'Over 1.5 goals' }),
    ]);
    expect(done?.kind).toBe('bust');
    expect(done?.title).toBe('Slip lost · 2 of 3 legs won');
    expect(done?.body).toContain('Aston Villa 0-0 Sunderland missed Over 1.5 goals');
    expect(done?.body).toContain('Chelsea and West Ham legs all landed.');
    expect(gradeScore('over15', { home: 0, away: 0 }, null)).toBe('lost');
    expect(gradeScore('sh-over05', { home: 2, away: 0 }, null)).toBe('open');
  });
});
