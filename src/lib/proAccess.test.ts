import { describe, expect, it } from 'vitest';
import { canAddFollow, canSeeCode, canSeeTier, canUseLineupAlerts, canUseSavedFilters, isEarlyCode, isEntitled, FREE_FOLLOW_LIMIT } from './proAccess';

describe('Pro access while the flag is on', () => {
  const now = Date.parse('2026-11-26T12:00:00.000Z');

  it('keeps the 80% picks and locks 100% and 90% without Pro', () => {
    expect(canSeeTier('80', false, true)).toBe(true);
    expect(canSeeTier('90', false, true)).toBe(false);
    expect(canSeeTier('100', false, true)).toBe(false);
    expect(canSeeTier('100', true, true)).toBe(true);
  });

  it('caps free follows and leaves Pro uncapped', () => {
    expect(canAddFollow(FREE_FOLLOW_LIMIT - 1, false, true)).toBe(true);
    expect(canAddFollow(FREE_FOLLOW_LIMIT, false, true)).toBe(false);
    expect(canAddFollow(40, true, true)).toBe(true);
  });

  it('keeps saved filters and lineup alerts for Pro', () => {
    expect(canUseSavedFilters(false, true)).toBe(false);
    expect(canUseSavedFilters(true, true)).toBe(true);
    expect(canUseLineupAlerts(false, true)).toBe(false);
    expect(canUseLineupAlerts(true, true)).toBe(true);
  });

  it('treats a code more than six hours out as early, unless that code was the rewarded one', () => {
    const soon = new Date(now + 2 * 60 * 60 * 1000).toISOString();
    const early = new Date(now + 8 * 60 * 60 * 1000).toISOString();
    expect(isEarlyCode(soon, now)).toBe(false);
    expect(isEarlyCode(early, now)).toBe(true);
    expect(canSeeCode('ABC', early, false, now, true)).toBe(false);
    expect(canSeeCode('ABC', early, true, now, true)).toBe(true);
    expect(canSeeCode('ABC', soon, false, now, true)).toBe(true);
    expect(canSeeCode('ABC', early, false, now, true, 'ABC')).toBe(true);
  });

  it('counts a subscription only until it expires', () => {
    expect(isEntitled({ productId: 'betspapa_pro_monthly', expiryMs: now + 1000, token: 't' }, now)).toBe(true);
    expect(isEntitled({ productId: 'betspapa_pro_monthly', expiryMs: now - 1, token: 't' }, now)).toBe(false);
    expect(isEntitled(null, now)).toBe(false);
  });
});
