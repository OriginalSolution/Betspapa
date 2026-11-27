import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./results', () => ({
  fetchResults: vi.fn(async () => ({ picks: [] })),
}));

import { fetchResults } from './results';
import { clearSlipScoreCache, recordedPicks } from './slipScores';

describe('batched slip scores', () => {
  beforeEach(() => {
    vi.mocked(fetchResults).mockClear();
    clearSlipScoreCache();
  });

  it('fetches each match day once for every slip that shares it', async () => {
    const days = ['2026-11-27', '2026-11-27', '2026-11-26'];
    await recordedPicks(days, 1_000);
    await recordedPicks(days, 1_500);
    expect(fetchResults).toHaveBeenCalledTimes(2);
    expect(fetchResults).toHaveBeenCalledWith('2026-11-27');
    expect(fetchResults).toHaveBeenCalledWith('2026-11-26');
  });
});
