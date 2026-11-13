import { describe, expect, it } from 'vitest';
import { crestFontSize, crestLetters } from './crestMark';

describe('fallback crest letters', () => {
  it('keeps two or three initials and shrinks the type so three fit', () => {
    expect(crestLetters('AA', 'Al Astiklal')).toBe('AA');
    expect(crestLetters('AK', 'Asante Kotoko')).toBe('AK');
    expect(crestLetters('AFI', 'Africa')).toBe('AFI');
    expect(crestLetters('AR', 'Arsenal')).toBe('AR');
    expect(crestLetters('', 'Al Ahly')).toBe('AA');
    const two = crestFontSize(56, 'AR');
    const three = crestFontSize(56, 'AFI');
    expect(three).toBeLessThan(two);
    expect(three).toBeLessThanOrEqual(Math.round(56 * 0.3));
    expect(crestFontSize(22, 'AFI')).toBeGreaterThanOrEqual(6);
    expect(crestFontSize(22, 'AFI')).toBeLessThanOrEqual(8);
    expect(crestFontSize(18, 'AK')).toBeLessThanOrEqual(8);
  });
});
