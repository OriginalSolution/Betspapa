import { describe, expect, it } from 'vitest';
import { tierFallback, type BookLeg } from './bookFollow';

const now = Date.parse('2026-11-14T08:00:00.000Z');
const later = '2026-11-14T18:00:00.000Z';
const past = '2026-11-14T06:00:00.000Z';

function leg(id: string, rate: number, kickoff = later, status?: BookLeg['status']): BookLeg {
  return { eventId: `sr:match:${id}`, market: 'over15', odds: 1.25, kickoff, rate, status: status || 'open', match: 'Japan vs Brazil' };
}

describe('followed tier fallback', () => {
  it('steps down from 100% when nothing open is that high and says why', () => {
    const result = tierFallback([leg('1', 0.9), leg('2', 0.8, past)], '100', now);
    expect(result.tier).toBe('90');
    expect(result.legs.map((item) => item.eventId)).toEqual(['sr:match:1']);
    expect(result.note).toBe('No open follows at 100%. Showing 90%+ instead.');
  });

  it('says every follow has kicked off or settled', () => {
    const result = tierFallback([leg('1', 1, past), leg('2', 1, later, 'won')], '100', now);
    expect(result.legs).toEqual([]);
    expect(result.note).toMatch(/kicked off or settled/);
  });
});
