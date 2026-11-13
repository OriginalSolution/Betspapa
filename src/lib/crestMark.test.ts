import { describe, expect, it } from 'vitest';
import { crestFontSize, crestLetters, judgeCrest, type CrestBitmap } from './crestMark';
import { mapSportyEvent } from '../data/sporty';

function fill(width: number, height: number, paint: (x: number, y: number) => [number, number, number, number]): CrestBitmap {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = paint(x, y);
      const index = (y * width + x) * 4;
      rgba[index] = r;
      rgba[index + 1] = g;
      rgba[index + 2] = b;
      rgba[index + 3] = a;
    }
  }
  return { width, height, rgba };
}

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

  it('uses two or three initials and the same color for the same team', () => {
    const match = mapSportyEvent({
      eventId: 'sr:match:9',
      home: 'Black Sailor FC',
      away: 'La Viena FC',
      kickoff: '2026-11-13T16:00:00.000Z',
      tournament: 'Premier League',
      country: 'Tanzania',
    });
    const again = mapSportyEvent({
      eventId: 'sr:match:10',
      home: 'Black Sailor FC',
      away: 'La Viena FC',
      kickoff: '2026-11-13T16:00:00.000Z',
      tournament: 'Premier League',
      country: 'Egypt',
    });
    expect(match.home.abbr).toBe('BS');
    expect(match.away.abbr).toBe('LV');
    expect(crestLetters(match.home.abbr, match.home.name)).toBe('BS');
    expect(crestLetters(match.away.abbr, match.away.name)).toBe('LV');
    expect(match.home.color).toBe(again.home.color);
    expect(match.away.color).toBe(again.away.color);
    expect(match.home.color).not.toBe(match.away.color);
  });
});

describe('crest quality', () => {
  it('keeps a sharp badge and drops low-res, stretched, cropped, and flat files', () => {
    const sharp = fill(64, 64, (x, y) => {
      const inside = (x - 32) ** 2 + (y - 32) ** 2 < 24 ** 2;
      return inside ? [180, 20, 30, 255] : [10, 20, 40, 255];
    });
    expect(judgeCrest(sharp)).toBe('sharp');
    expect(judgeCrest(fill(24, 24, () => [20, 40, 80, 255]))).toBe('low-res');
    const wide = fill(96, 96, (_x, y) => (y > 28 && y < 66 ? [200, 20, 20, 255] : [0, 0, 0, 0]));
    expect(judgeCrest(wide)).toBe('aspect');
    const cropped = fill(96, 96, (x, y) => (x < 12 && y < 12 ? [10, 10, 10, 255] : [0, 0, 0, 0]));
    expect(judgeCrest(cropped)).toBe('tiny');
    expect(judgeCrest(fill(64, 64, () => [200, 16, 32, 255]))).toBe('flat');
  });
});
