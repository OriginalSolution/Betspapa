import { describe, expect, it } from 'vitest';
import { bandLine, dayWindow, hitPercent, recordingSince, recordMarket, scoreText } from './results';

describe('results record', () => {
  it('shows the day recording started and never a reconstructed total', () => {
    expect(recordingSince('2026-11-22T23:40:00.000Z')).toBe('Recording since 22 Nov 2026');
    expect(hitPercent(0, 0)).toBeNull();
    expect(hitPercent(8, 12)).toBe(67);
    expect(bandLine({ won: 0, graded: 0 })).toBe('–');
    expect(scoreText('2-0')).toBe('2 - 0');
    expect(recordMarket('sh-over05')).toBe('2nd half over 0.5');
    expect(dayWindow('2026-11-21')).toEqual(['2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23']);
  });
});
