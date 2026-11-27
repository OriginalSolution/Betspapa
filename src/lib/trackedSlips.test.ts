import { describe, expect, it } from 'vitest';
import { slipsFromStored } from './builderStore';
import type { EngineState } from './engineSlips';
import { matchesForSlips, slipFixtureIds, slipFromPublishedCode, splitMonitorLegs } from './trackedSlips';
import type { GradedLeg } from './slipPacks';
import type { Match } from '../types';

const state = {
  updatedAt: '2026-11-27T08:00:00.000Z',
  master: null,
  trends: [
    {
      id: '80:dc-12',
      label: '80%+ Double chance 12',
      market: 'dc-12',
      legCount: 1,
      sameAsMaster: false,
      bookedAt: '2026-11-27T07:00:00.000Z',
      legs: [
        {
          eventId: 'sr:match:77065630',
          market: 'dc-12',
          match: 'Broadmeadow Magic FC vs Lions FC',
          kickoff: '2026-11-27T08:30:00.000Z',
          odds: 1.23,
          occurrence: 10,
          sample: '10/10',
          homeCrest: null,
          awayCrest: null,
        },
      ],
      books: {
        sportybet: {
          parts: [{ code: 'B2PJ62', link: 'https://www.sportybet.com/gh/?shareCode=B2PJ62', totalOdds: 28.13, legs: 1, matches: ['sr:match:77065630'] }],
          error: null,
          dropped: [],
        },
      },
    },
  ],
} as EngineState;

describe('published code import', () => {
  it('tracks the real legs of a code the engine published', () => {
    const slip = slipFromPublishedCode(state, 'b2pj62');
    expect(slip?.label).toBe('80%+ Double chance 12');
    expect(slip?.parts[0]?.code).toBe('B2PJ62');
    expect(slip?.legs.map((leg) => leg.home)).toEqual(['Broadmeadow Magic FC']);
  });

  it('does not invent a slip for a code that was not published', () => {
    expect(slipFromPublishedCode(state, 'ZZZZZZ')).toBeNull();
  });
});

describe('an existing tracked slip joins the list', () => {
  it('keeps every leg stored under the old single slip', () => {
    const legs = Array.from({ length: 70 }, (_, index) => ({
      key: `sr:match:${index}|over15`,
      eventId: `sr:match:${index}`,
      market: 'over15',
      label: 'Over 1.5 goals',
      odds: 1.2,
      kickoff: '2026-11-26T18:00:00.000Z',
      home: 'Home',
      away: 'Away',
      homeCrest: null,
      awayCrest: null,
      sample: null,
    }));
    const slips = slipsFromStored({
      tracked: {
        id: 'slip-thursday',
        label: '',
        legs,
        bookedAt: '2026-11-26T12:00:00.000Z',
        parts: [{ desk: 'sportybet', code: '90R32D', legs: 70 }],
        desks: [],
        alerted: false,
      },
    });
    expect(slips).toHaveLength(1);
    expect(slips[0].id).toBe('slip-thursday');
    expect(slips[0].legs).toHaveLength(70);
    expect(slips[0].parts[0].code).toBe('90R32D');
  });

  it('does not drop the old slip when a newer list was saved empty', () => {
    const slips = slipsFromStored({
      slips: [],
      tracked: {
        id: 'slip-thursday',
        label: 'Tracked slip',
        legs: [{ key: 'sr:match:1|over15', eventId: 'sr:match:1', market: 'over15', label: 'Over 1.5', odds: 1.2, kickoff: '', home: 'A', away: 'B', homeCrest: null, awayCrest: null, sample: null }],
        bookedAt: '',
        parts: [],
        desks: [],
        alerted: false,
      },
    });
    expect(slips.map((slip) => slip.id)).toEqual(['slip-thursday']);
  });
});

describe('unlimited tracked slips', () => {
  it('keeps every stored slip', () => {
    const slips = Array.from({ length: 24 }, (_, index) => ({
      id: `s${index}`,
      label: `Slip ${index}`,
      legs: [{ key: `sr:match:${index}|over15`, eventId: `sr:match:${index}`, market: 'over15', label: 'Over 1.5', odds: 1.2, kickoff: '', home: 'A', away: 'B', homeCrest: null, awayCrest: null, sample: null }],
      bookedAt: '',
      parts: [],
      desks: [],
      alerted: false,
    }));
    expect(slipsFromStored({ slips })).toHaveLength(24);
  });

  it('batches fixture ids across slips', () => {
    const ids = slipFixtureIds([
      { legs: [{ eventId: 'sr:match:1' }, { eventId: 'sr:match:2' }] },
      { legs: [{ eventId: 'sr:match:2' }, { eventId: 'sr:match:3' }] },
    ]);
    expect(ids).toEqual(['sr:match:1', 'sr:match:2', 'sr:match:3']);
    const matches = [
      { id: 'sr:match:1', status: 'live' },
      { id: 'sr:match:9', status: 'live' },
      { id: 'sr:match:3', status: 'finished' },
    ] as Match[];
    expect(matchesForSlips(matches, ids).map((match) => match.id)).toEqual(['sr:match:1', 'sr:match:3']);
  });
});

describe('opened slip order', () => {
  it('puts live and open legs ahead of settled ones', () => {
    const leg = (key: string, status: GradedLeg['status']): GradedLeg => ({
      key, eventId: key, market: 'over15', label: 'Over 1.5', odds: 1.2, kickoff: '', home: 'A', away: 'B', homeCrest: null, awayCrest: null, sample: null, status, ft: null, ht: null,
    });
    const matches = [{ id: 'live', status: 'live' } as Match];
    const split = splitMonitorLegs([leg('settled', 'won'), leg('live', 'open'), leg('later', 'open')], matches);
    expect(split.active.map((item) => item.key)).toEqual(['live', 'later']);
    expect(split.settled.map((item) => item.key)).toEqual(['settled']);
  });
});
