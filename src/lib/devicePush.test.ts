import { describe, expect, it } from 'vitest';
import { RESEND_MS, shouldResend } from './devicePush';

describe('device registration resend', () => {
  it('posts a changed registration at once and repeats an unchanged one only every 10 minutes', () => {
    expect(shouldResend('a', 0, null)).toBe(true);
    expect(shouldResend('a', 1_000, { signature: 'a', at: 0 })).toBe(false);
    expect(shouldResend('b', 1_000, { signature: 'a', at: 0 })).toBe(true);
    expect(shouldResend('a', RESEND_MS, { signature: 'a', at: 0 })).toBe(true);
  });
});
