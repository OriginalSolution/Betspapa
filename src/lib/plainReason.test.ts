import { describe, expect, it } from 'vitest';
import { plainReason, plainReasons } from './plainReason';

describe('plain league wording', () => {
  it('replaces the debug league line', () => {
    expect(plainReason('Ghana Premier League: 0 finished matches, under 12, so this league is not blocked yet.')).toBe(
      'League record: building, no settled games yet.',
    );
    expect(plainReason('Serie A: 4 finished matches, under 12, so this league is not blocked yet.')).toBe(
      'League record: building, 4 settled games so far.',
    );
    expect(plainReason('Home 10/10 · Away 10/10')).toBe('Home 10/10 · Away 10/10');
    expect(plainReasons(['Premier: 0 finished matches, under 12, so this league is not blocked yet.', 'Premier: 0 finished matches, under 12, so this league is not blocked yet.'])).toEqual([
      'League record: building, no settled games yet.',
    ]);
  });
});
