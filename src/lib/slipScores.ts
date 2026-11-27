import { fetchResults, type RecordPick } from './results';

const RESULT_CACHE_MS = 30_000;
const resultCache = new Map<string, { at: number; picks: RecordPick[] }>();

export function clearSlipScoreCache() {
  resultCache.clear();
}

/**
 * Settled results for every match day on the tracked slips.
 * Each day is fetched once and reused until the next live tick.
 */
export async function recordedPicks(days: string[], now = Date.now()): Promise<Map<string, RecordPick>> {
  const recorded = new Map<string, RecordPick>();
  const unique = [...new Set(days.filter(Boolean))];
  await Promise.all(unique.map(async (day) => {
    const cached = resultCache.get(day);
    let picks = cached && now - cached.at < RESULT_CACHE_MS ? cached.picks : null;
    if (!picks) {
      try {
        const view = await fetchResults(day);
        picks = view.picks || [];
        resultCache.set(day, { at: now, picks });
      } catch {
        picks = cached?.picks ?? [];
      }
    }
    for (const pick of picks) recorded.set(pick.key, pick);
  }));
  return recorded;
}
