import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { bookMarks } from './BookMark';

describe('official booking marks', () => {
  it('points each desk at its official artwork', () => {
    expect(bookMarks).toEqual({
      sportybet: '/bookies/sportybet.png',
      footballcom: '/bookies/football.png',
      msport: '/bookies/msport.png',
      betika: '/bookies/betika.png',
      betpawa: '/bookies/betpawa.png',
    });
    for (const src of Object.values(bookMarks)) {
      const file = `public${src}`;
      expect(readFileSync(file).subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    }
  });
});
