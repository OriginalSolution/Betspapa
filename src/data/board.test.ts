import { describe, expect, it } from 'vitest';
import { projectDemo } from './project';
import { bookingCodes, buildPicks, listTrends, qualifying, rankLedger, seedLedger, settle } from './board';

const t0 = Date.parse('2026-11-10T18:00:00Z');
const today = '2026-11-10';

function board(elapsed: number) {
  return projectDemo({ t0, now: t0 + elapsed, selectedDate: today, todayDate: today });
}

describe('trends and picks', () => {
  it('bookmarks only trends above 80% and keeps a developing one visible', () => {
    const trends = listTrends();
    expect(trends.find((trend) => trend.id === 'ars-over35')?.bookmarked).toBe(true);
    expect(trends.find((trend) => trend.id === 'tot-home')?.bookmarked).toBe(false);
    expect(trends.find((trend) => trend.id === 'bha-score')?.developing).toBe(true);
  });

  it('raises Arsenal over 3.5 because Liverpool concede, and softens Villa', () => {
    const picks = buildPicks(board(0));
    const arsenal = picks.find((pick) => pick.id === 'ars-liv:ars-over35');
    const villa = picks.find((pick) => pick.id === 'avl-bha:avl-home');
    expect(arsenal?.support).toBe(1);
    expect(arsenal?.confidence).toBeGreaterThan(0.8);
    expect(arsenal?.softened).toBe(false);
    expect(villa?.support).toBe(-1);
    expect(villa?.softened).toBe(true);
    expect(qualifying(picks).some((pick) => pick.id === villa?.id)).toBe(false);
  });

  it('gives qualifying picks distinct prices that can sort both ways', () => {
    const prices = qualifying(buildPicks(board(0))).map((pick) => pick.odds);
    expect(new Set(prices).size).toBeGreaterThan(1);
    const ascending = [...prices].sort((a, b) => a - b);
    const descending = [...prices].sort((a, b) => b - a);
    expect(ascending[0]).toBeLessThan(ascending[ascending.length - 1]);
    expect(descending[0]).toBeGreaterThan(descending[descending.length - 1]);
  });
});

describe('VAR settlement', () => {
  it('does not settle Over 3.5 during VAR and wins it only when the goal is confirmed', () => {
    const before = buildPicks(board(16_000)).find((pick) => pick.id === 'ars-liv:ars-over35');
    const during = buildPicks(board(24_000)).find((pick) => pick.id === 'ars-liv:ars-over35');
    const after = buildPicks(board(32_000)).find((pick) => pick.id === 'ars-liv:ars-over35');
    expect(before?.status).toBe('open');
    expect(during?.status).toBe('open');
    expect(after?.status).toBe('won');
  });

  it('busts the Ajax clean sheet when PSV score and wins Chelsea to score', () => {
    expect(buildPicks(board(0)).find((pick) => pick.id === 'aja-psv:aja-clean')?.status).toBe('open');
    expect(buildPicks(board(32_000)).find((pick) => pick.id === 'aja-psv:aja-clean')?.status).toBe('bust');
    expect(buildPicks(board(8_000)).find((pick) => pick.id === 'che-mci:che-score')?.status).toBe('open');
    expect(buildPicks(board(24_000)).find((pick) => pick.id === 'che-mci:che-score')?.status).toBe('won');
  });

  it('books the same won legs at each bookmaker and leaves the code unavailable', () => {
    const picks = qualifying(buildPicks(board(32_000)));
    const slip = picks.filter((pick) => pick.id === 'ars-liv:ars-over35' || pick.id === 'che-mci:che-score');
    const codes = bookingCodes(slip);
    expect(codes.map((code) => code.name)).toEqual(['SportyBet', 'Betway']);
    for (const code of codes) {
      expect(code.bookingState).toBe('unavailable');
      expect(code.code).toBe('');
      expect(code.status).toBe('won');
      expect(code.legs.map((leg) => leg.market).sort()).toEqual(['home-score', 'over35']);
    }
    expect(settle('over35', board(24_000).find((match) => match.id === 'ars-liv')!, true)).toBe('open');
  });
});

describe('rankings', () => {
  it('keeps week, month, and year windows distinct', () => {
    const now = Date.parse('2026-11-10T12:00:00Z');
    const ledger = seedLedger(now);
    const week = rankLedger(ledger, 'week', now, 'market');
    const year = rankLedger(ledger, 'year', now, 'team');
    expect(week.length).toBeGreaterThan(0);
    expect(year.reduce((sum, row) => sum + row.played, 0)).toBeGreaterThan(week.reduce((sum, row) => sum + row.played, 0));
  });
});
