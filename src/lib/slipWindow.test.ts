import { describe, expect, it } from 'vitest';
import { SLIP_ROW_ESTIMATE, slipWindow } from './slipWindow';

describe('slip list window', () => {
  it('draws the rows on screen and leaves the rest out', () => {
    const frame = slipWindow(24, [], 0, 640);
    expect(frame.start).toBe(0);
    expect(frame.end).toBeLessThan(24);
    expect(frame.end).toBeGreaterThan(8);
    expect(frame.padTop).toBe(0);
    expect(frame.padBottom).toBe((24 - frame.end) * SLIP_ROW_ESTIMATE);
  });

  it('reaches the last rows when the list is scrolled down', () => {
    const frame = slipWindow(24, [], 24 * SLIP_ROW_ESTIMATE, 640);
    expect(frame.end).toBe(24);
    expect(frame.start).toBeGreaterThan(0);
    expect(frame.padBottom).toBe(0);
  });

  it('keeps an opened slip inside the window', () => {
    const heights = Array.from({ length: 24 }, () => SLIP_ROW_ESTIMATE);
    heights[2] = 900;
    const frame = slipWindow(24, heights, 0, 640);
    expect(frame.start).toBe(0);
    expect(frame.end).toBeGreaterThan(2);
    expect(frame.end).toBeLessThan(24);
  });
});
