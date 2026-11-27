import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BELL_KEEP_MS,
  bellMatchIds,
  bellRegistration,
  bellWatchRows,
  freshResults,
  isBellOn,
  legNoteId,
  readBells,
  readSeenResults,
  refreshBellLegs,
  setBell,
  slipNoteId,
  withBellFollows,
  writeSeenResults,
  type BellLeg,
} from './slipBells';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    clear: () => data.clear(),
  };
}

const NOW = Date.parse('2026-11-24T12:00:00Z');
const leg = (id: number, market = 'over15', kickoff = '2026-11-24T19:00:00Z'): BellLeg => ({
  key: `sr:match:${id}|${market}`,
  eventId: `sr:match:${id}`,
  market,
  label: 'Over 1.5 goals',
  odds: 1.26,
  kickoff,
  home: `Home ${id} FC`,
  away: `Away ${id} United`,
});

describe('slip bells', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
  });

  it('persists the bell per slip and turns it off again', () => {
    expect(isBellOn('s1')).toBe(false);
    setBell('s1', true, { label: 'Tracked slip', legs: [leg(1), leg(2)] }, NOW);
    expect(isBellOn('s1')).toBe(true);
    expect(isBellOn('s2')).toBe(false);
    expect(readBells().s1.legs.map((row) => row.eventId)).toEqual(['sr:match:1', 'sr:match:2']);
    setBell('s1', false, { label: '', legs: [] }, NOW);
    expect(isBellOn('s1')).toBe(false);
  });

  it('follows every belled match without changing the user follow list', () => {
    setBell('s1', true, { label: 'Slip', legs: [leg(1), leg(2), leg(2, 'btts')] }, NOW);
    const follows = { matches: ['sr:match:9', 'sr:match:1'], teams: [] };
    const merged = withBellFollows(follows, readBells(), NOW);
    expect(merged.matches).toEqual(['sr:match:9', 'sr:match:1', 'sr:match:2']);
    expect(follows.matches).toEqual(['sr:match:9', 'sr:match:1']);
    expect(bellMatchIds(readBells(), NOW)).toEqual(['sr:match:1', 'sr:match:2']);
  });

  it('sends the server and the watcher the same legs', () => {
    setBell('s1', true, { label: 'Slip', legs: [leg(1)] }, NOW);
    expect(bellRegistration(readBells(), NOW)).toEqual([
      { id: 's1', label: 'Slip', legs: [{ eventId: 'sr:match:1', market: 'over15', home: 'Home 1 FC', away: 'Away 1 United', odds: 1.26, label: 'Over 1.5 goals' }] },
    ]);
    expect(bellWatchRows(readBells(), NOW)[0].legs[0].key).toBe('sr:match:1|over15');
  });

  it('keeps every bell and every leg', () => {
    for (let index = 0; index < 24; index += 1) setBell(`s${index}`, true, { label: `Slip ${index}`, legs: [leg(index + 1)] }, NOW);
    expect(Object.keys(readBells())).toHaveLength(24);
    const legs = Array.from({ length: 70 }, (_, index) => leg(index + 1));
    setBell('long', true, { label: 'Long', legs }, NOW);
    expect(readBells().long.legs).toHaveLength(70);
  });

  it('drops a bell two days after its last kick-off', () => {
    setBell('old', true, { label: 'Old', legs: [leg(1, 'over15', '2026-11-20T19:00:00Z')] }, NOW);
    expect(bellRegistration(readBells(), NOW)).toEqual([]);
    setBell('new', true, { label: 'New', legs: [leg(1)] }, NOW);
    expect(bellRegistration(readBells(), NOW + BELL_KEEP_MS).length).toBe(1);
  });

  it('keeps a ringing bell in step with its slip', () => {
    setBell('s1', true, { label: 'Slip', legs: [leg(1), leg(2)] }, NOW);
    refreshBellLegs('s1', [leg(1)]);
    expect(readBells().s1.legs.length).toBe(1);
    refreshBellLegs('nope', [leg(3)]);
    expect(readBells().nope).toBeUndefined();
  });

  it('animates only legs that settled since the slip was last shown', () => {
    const legs = [
      { key: 'a', status: 'won' },
      { key: 'b', status: 'lost' },
      { key: 'c', status: 'open' },
    ];
    expect(freshResults(legs, {})).toEqual(['a', 'b']);
    writeSeenResults('s1', { a: 'won' });
    expect(freshResults(legs, readSeenResults('s1'))).toEqual(['b']);
  });

  it('uses the same alert ids as the server and the watcher', () => {
    expect(legNoteId('s1', 'sr:match:1|over15')).toBe('slipleg:s1:sr:match:1|over15');
    expect(slipNoteId('s1')).toBe('slip:s1');
  });
});
