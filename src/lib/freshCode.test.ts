import { describe, expect, it } from 'vitest';
import { clearFresh, FRESH_TTL_MS, freshCodes, markFresh, newCodes } from './freshCode';

function memory() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

describe('just-booked codes', () => {
  it('are kept for the page that shows them, without duplicates', () => {
    const store = memory();
    markFresh([{ code: 'ABC123', desk: 'sportybet' }, { code: 'ABC123', desk: 'sportybet' }, { code: '', desk: 'msport' }, { code: 'BK7788', desk: 'betika' }], 1000, store);
    expect(freshCodes(2000, store)).toEqual([{ code: 'ABC123', desk: 'sportybet' }, { code: 'BK7788', desk: 'betika' }]);
  });

  it('expire if no page shows them in time, and clear once highlighted', () => {
    const store = memory();
    markFresh([{ code: 'ABC123', desk: 'sportybet' }], 0, store);
    expect(freshCodes(FRESH_TTL_MS + 1, store)).toEqual([]);
    markFresh([{ code: 'ABC123', desk: 'sportybet' }], 0, store);
    clearFresh(store);
    expect(freshCodes(10, store)).toEqual([]);
  });

  it('an empty booking does not wipe a pending highlight', () => {
    const store = memory();
    markFresh([{ code: 'ABC123', desk: 'sportybet' }], 0, store);
    markFresh([], 5, store);
    expect(freshCodes(10, store).map((item) => item.code)).toEqual(['ABC123']);
  });

  it('only codes that were not there before count as new', () => {
    expect(newCodes(['OLD111'], [{ code: 'OLD111', desk: 'sportybet' }, { code: 'NEW222', desk: 'sportybet' }])).toEqual([{ code: 'NEW222', desk: 'sportybet' }]);
  });
});
