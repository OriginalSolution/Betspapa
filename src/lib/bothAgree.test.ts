import { describe, expect, it } from 'vitest';
import { agreeActionLabels, agreeAside, agreeCopyText, agreeQuote, rateName, readAgreeBoard, visibleAgree, type AgreeFixture } from './bothAgree';

const fixture: AgreeFixture = {
  id: 'sr:match:1',
  home: 'SC Freiburg',
  away: 'Heidenheim',
  homeId: 'sr:competitor:1',
  awayId: 'sr:competitor:2',
  kickoff: '2026-11-28T10:00:00.000Z',
  market: { id: 'over15', label: 'Over 1.5', tier: '100', home: { hit: 10, n: 10 }, away: { hit: 10, n: 10 } },
  also: [
    { id: 'team15', label: 'Team over 1.5', tier: '80', home: { hit: 9, n: 10 }, away: { hit: 8, n: 10 } },
    { id: 'dc1x', label: 'Double chance 1X', tier: '80', home: { hit: 10, n: 10 }, away: { hit: 8, n: 10 } },
  ],
  miss: { id: '1h15', label: '1st half over 1.5', home: { hit: 6, n: 10 }, away: { hit: 5, n: 10 } },
  quote: { market: 'over15', odds: 1.25 },
};

describe('both teams agree copy', () => {
  it('uses percent tiers on the web and tenths on Play, with no bookmaker name', () => {
    const web = agreeAside(fixture, false);
    const play = agreeAside(fixture, true);
    expect(web).toContain('80%+');
    expect(web).toContain('9/10 and 8/10');
    expect(web).toContain('1st half over 1.5 is 6/10 and 5/10');
    expect(play).toContain('8/10+');
    expect(play).not.toMatch(/80%\+|90%\+|100%/);
    expect(play).not.toMatch(/sportybet|football\.com|msport|betika|betpawa/i);
    expect(agreeActionLabels(false)).toEqual(['Copy', 'Load', 'Alerts']);
    expect(agreeActionLabels(true)).toEqual(['Copy', 'Alerts']);
    expect(agreeCopyText(fixture)).toBe('SC Freiburg v Heidenheim · Over 1.5 · 10/10 and 10/10');
    expect(agreeCopyText(fixture)).not.toMatch(/https?:|sportybet|football\.com|msport|betika|betpawa/i);
    expect(agreeQuote(fixture)?.odds).toBe(1.25);
    expect(agreeQuote({ quote: { market: 'over15', odds: 1.05 } })).toBeNull();
    expect(agreeQuote({ quote: { market: 'dc1x', odds: 1.22 } })).toBeNull();
    expect(rateName('SC Freiburg')).toBe('Freiburg');
    expect(rateName('Inter Miami')).toBe('Inter Miami');
  });

  it('hides a blacklisted market and does not add one because a team is greenlit', () => {
    const hidden = visibleAgree(fixture, new Set(['over15']));
    expect(hidden?.market.id).toBe('team15');
    expect(hidden?.also.map((market) => market.id)).toEqual(['dc1x']);
    expect(visibleAgree(fixture, new Set(['over15', 'team15', 'dc1x']))).toBeNull();
    const open = visibleAgree(fixture, new Set());
    expect(open?.also).toHaveLength(2);
    const dc = visibleAgree(fixture, new Set(['dc-1x']));
    expect(dc?.also.map((market) => market.id)).toEqual(['team15']);
    const twelve = visibleAgree({
      ...fixture,
      market: { id: 'dc12', label: 'Double chance 12', tier: '100', home: { hit: 10, n: 10 }, away: { hit: 10, n: 10 } },
      also: fixture.also,
      quote: { market: 'dc-12', odds: 1.22 },
    }, new Set());
    expect(twelve?.market.id).toBe('team15');
    expect(twelve?.also.map((market) => market.id)).not.toContain('dc12');
    expect(twelve?.quote).toBeNull();
  });

  it('drops a fixture that is not a real agreement payload', () => {
    expect(readAgreeBoard({ fixtures: [{ id: 'x', home: 'A', away: 'B', market: { id: 'over15', label: 'Over 1.5', tier: '70', home: { hit: 7, n: 10 }, away: { hit: 7, n: 10 } } }] })).toEqual([]);
    expect(readAgreeBoard({ fixtures: [fixture] })).toHaveLength(1);
  });
});
