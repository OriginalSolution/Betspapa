import { describe, expect, it } from 'vitest';
import { bookingLine, dailyCards, hasCode, ladderDays, nextBookingAt, weekCards, type CodePart, type CodeSlot, type CodeStrategy, type CodesView } from './codes';

function part(code: string, status = 'open'): CodePart {
  return {
    code, cap: null, legs: [], legCount: 13, totalOdds: 4.2, highRisk: false, highRiskWhy: '', link: '', football: false,
    footballCode: '', footballLink: '', status, settled: 0, mix: {}, marketIds: [], openCount: 13, firstKick: '', lastKick: '', readAt: '', missed: '',
  };
}
const empty: CodeSlot = { parts: [], empty: 'No Mon code · Tue books Mon 21:00 GMT' };
const slot = (code: string, status = 'open'): CodeSlot => ({ parts: [part(code, status)], empty: '' });

function strategy(id: string, week: CodeSlot = empty, today: CodeSlot = empty): CodeStrategy {
  return { id, code: id.toUpperCase(), name: id, rules: [], week, today };
}

function view(dailies: CodesView['dailies'], strategies: CodeStrategy[]): CodesView {
  return {
    oddsLabel: '', warning: '', target: 4, reading: false, readAt: '', nextReadAt: '',
    week: { id: '2026-11-23', from: '2026-11-23', to: '2026-11-29', label: 'Week 23–29 Nov' },
    today: '2026-11-23', strategies, days: Object.keys(dailies), dailies,
    record: { since: '', strategies: [] }, notices: [],
  };
}

// Mon 23 Nov 2026, 10:00 GMT
const MON_10 = Date.UTC(2026, 10, 23, 10);

describe('codes tab hides strategies without a code', () => {
  const ids = ['classic', 'gold', 'shield', 'capped', 'ladder'];
  const data = view(
    {
      '2026-11-23': { classic: empty, gold: empty, shield: empty, capped: empty, ladder: slot('9B4CVQ') },
      '2026-11-24': { classic: empty, gold: empty, shield: empty, capped: empty, ladder: empty },
      '2026-11-22': { classic: slot('LOST01', 'lost'), gold: slot('WON001', 'won'), shield: empty, capped: empty, ladder: empty },
    },
    ids.map((id) => (id === 'ladder' ? strategy(id, empty, slot('9B4CVQ')) : strategy(id))),
  );

  it('daily view keeps only the ladder on Mon 23', () => {
    expect(dailyCards(data, '2026-11-23').map((row) => row.strategy.id)).toEqual(['ladder']);
  });

  it('a day with no codes has nothing to show', () => {
    expect(dailyCards(data, '2026-11-24')).toEqual([]);
    expect(dailyCards(data, '2026-12-01')).toEqual([]);
  });

  it('settled codes stay visible', () => {
    expect(dailyCards(data, '2026-11-22').map((row) => [row.strategy.id, row.slot.parts[0].status])).toEqual([
      ['classic', 'lost'],
      ['gold', 'won'],
    ]);
  });

  it('week view keeps strategies with a week or today code', () => {
    expect(weekCards(data).map((item) => item.id)).toEqual(['ladder']);
    const none = view({}, ids.map((id) => strategy(id)));
    expect(weekCards(none)).toEqual([]);
    const week = view({}, [strategy('gold', slot('GOLDWK')), strategy('shield')]);
    expect(weekCards(week).map((item) => item.id)).toEqual(['gold']);
  });

  it('ladder dailies list only days with a code', () => {
    expect(ladderDays(data).map((row) => row.iso)).toEqual(['2026-11-23']);
  });

  it('a slot without a share code is not a code', () => {
    expect(hasCode(undefined)).toBe(false);
    expect(hasCode(empty)).toBe(false);
    expect(hasCode({ parts: [part('')], empty: '' })).toBe(false);
    expect(hasCode(slot('ABC123', 'lost'))).toBe(true);
  });
});

describe('next booking line', () => {
  it('names the soonest 21:00 GMT run', () => {
    expect(new Date(nextBookingAt(MON_10)).toISOString()).toBe('2026-11-23T21:00:00.000Z');
    expect(bookingLine(MON_10)).toBe('Next codes book Mon 21:00 GMT');
    const monLate = Date.UTC(2026, 10, 23, 21, 30);
    expect(bookingLine(monLate)).toBe('Next codes book Tue 21:00 GMT');
    expect(bookingLine(Date.UTC(2026, 10, 23, 21))).toBe('Next codes book Tue 21:00 GMT');
  });

  it('today and tomorrow point at the next run', () => {
    expect(bookingLine(MON_10, '2026-11-23')).toBe('Next codes book Mon 21:00 GMT');
    expect(bookingLine(MON_10, '2026-11-24')).toBe('Next codes book Mon 21:00 GMT');
    expect(bookingLine(MON_10, '2026-11-22')).toBe('Next codes book Mon 21:00 GMT');
  });

  it('a later day names its own run', () => {
    expect(bookingLine(MON_10, '2026-11-26')).toBe('Thu codes book Wed 21:00 GMT');
  });
});

describe('codes on the board', () => {
  it('lists every SportyBet and Football.com code once, for spotting new ones after Read back', async () => {
    const { codesIn } = await import('./codes');
    const withFootball: CodePart = { ...part('9B4CVQ'), football: true, footballCode: 'FB0001', footballLink: 'https://www.football.com/gh/?shareCode=FB0001', link: 'https://www.sportybet.com/gh/?shareCode=9B4CVQ' };
    const data = view(
      { '2026-11-23': { ladder: { parts: [withFootball], empty: '' }, gold: slot('GOLD01') } },
      [strategy('ladder', empty, { parts: [withFootball], empty: '' }), strategy('gold')],
    );
    expect(codesIn(data)).toEqual([
      { code: '9B4CVQ', desk: 'sportybet', link: 'https://www.sportybet.com/gh/?shareCode=9B4CVQ' },
      { code: 'FB0001', desk: 'footballcom', link: 'https://www.football.com/gh/?shareCode=FB0001' },
      { code: 'GOLD01', desk: 'sportybet', link: undefined },
    ]);
    expect(codesIn(null)).toEqual([]);
  });
});
