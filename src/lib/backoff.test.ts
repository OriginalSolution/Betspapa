import { describe, expect, it } from 'vitest';
import { backoffMs, retryAfterSeconds, shouldPoll, shouldPollLive } from './backoff';

describe('feed backoff', () => {
  it('honors Retry-After and otherwise grows with jitter', () => {
    expect(retryAfterSeconds('300')).toBe(300);
    expect(backoffMs(0, '300', 0)).toBe(300_000);
    expect(backoffMs(0, null, 0)).toBe(1000);
    expect(backoffMs(3, null, 0)).toBe(8000);
    expect(backoffMs(0, null, 1)).toBe(1300);
  });

  it('stops the board poll in the background or in demo, and live scores only while a match is on screen', () => {
    expect(shouldPoll(true, 'sporty')).toBe(true);
    expect(shouldPoll(false, 'live')).toBe(false);
    expect(shouldPoll(true, 'demo')).toBe(false);
    expect(shouldPollLive(true, ['scheduled'])).toBe(false);
    expect(shouldPollLive(true, ['live'])).toBe(true);
    expect(shouldPollLive(false, ['halftime'])).toBe(false);
  });
});
