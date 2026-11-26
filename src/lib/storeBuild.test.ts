import { describe, expect, it } from 'vitest';
import { isPlayStoreBuild, withoutBookmakerUrls } from './storeBuild';

describe('Play store build', () => {
  it('is only the play flag', () => {
    expect(isPlayStoreBuild('play')).toBe(true);
    expect(isPlayStoreBuild(undefined)).toBe(false);
    expect(isPlayStoreBuild('')).toBe(false);
    expect(isPlayStoreBuild('sideload')).toBe(false);
  });

  it('strips bookmaker links from share text and leaves the code', () => {
    const text = withoutBookmakerUrls('SportyBet ABC123 https://www.sportybet.com/gh/?shareCode=ABC123\nBetika https://betika.com/en-gh/share/BK1 and https://www.betpawa.com.gh/share-betslip/P1');
    expect(text).not.toMatch(/sportybet\.com|football\.com|msport\.com|betika\.com|betpawa/);
    expect(text).toContain('ABC123');
    expect(text).not.toContain('BK1');
  });
});
