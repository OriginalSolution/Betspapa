import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addTrackedSlip,
  findTrackedSlip,
  readTrackedSlips,
  removeTrackedSlip,
  slipName,
  slipSignature,
  trackedLegKeys,
  updateTrackedSlip,
  MAX_TRACKED,
  type TrackedSlip,
} from './builderStore';
import { bellCoverLine } from '../components/SlipTrack';
import { bellLegCopy, slipVerdictTitle } from './noteCopy.mjs';
import type { BuilderLeg } from './slipPacks';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    clear: () => data.clear(),
  };
}

const leg = (id: number, market = 'over15'): BuilderLeg => ({
  key: `sr:match:${id}|${market}`,
  eventId: `sr:match:${id}`,
  market,
  label: 'Over 1.5 goals',
  odds: 1.3,
  kickoff: '2026-11-24T19:00:00Z',
  home: `Home ${id}`,
  away: `Away ${id}`,
  homeCrest: null,
  awayCrest: null,
  sample: null,
});

const slip = (id: string, code: string, desk = 'sportybet'): Omit<TrackedSlip, 'number' | 'name'> => ({
  id,
  legs: [leg(1), leg(2)],
  bookedAt: '2026-11-24T09:00:00Z',
  parts: [{ desk, code, legs: 2 }],
  desks: [],
  alerted: false,
  source: 'trend',
});

describe('tracked slips', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
    vi.stubGlobal('window', new EventTarget());
  });

  it('moves the one slip older builds tracked into the list as Slip 1', () => {
    localStorage.setItem('betspapa.builder.v1', JSON.stringify({ packIds: ['80:over15'], tracked: { ...slip('old', 'AAA111'), alerted: false } }));
    const list = readTrackedSlips();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('old');
    expect(list[0].number).toBe(1);
    expect(list[0].name).toBe('Slip 1 · SportyBet AAA111');
    expect(addTrackedSlip(slip('new', 'BBB222')).name).toBe('Slip 2 · SportyBet BBB222');
  });

  it('adds without replacing, keeps one card per code, and removes on request', () => {
    const one = addTrackedSlip(slip('a', 'ABC123'));
    const two = addTrackedSlip(slip('b', 'XY9', 'msport'));
    expect(addTrackedSlip(slip('c', 'ABC123')).id).toBe(one.id);
    expect(readTrackedSlips().map((row) => row.id)).toEqual(['b', 'a']);
    expect(two.name).toBe('Slip 2 · MSport XY9');
    expect(findTrackedSlip(slipSignature(slip('z', 'XY9', 'msport')))?.id).toBe('b');
    updateTrackedSlip('a', { alerted: true });
    expect(readTrackedSlips().find((row) => row.id === 'a')?.alerted).toBe(true);
    expect([...trackedLegKeys()]).toEqual(['sr:match:1|over15', 'sr:match:2|over15']);
    removeTrackedSlip('a');
    expect(readTrackedSlips().map((row) => row.id)).toEqual(['b']);
    // Numbers keep counting so a removed slip's name is never reused.
    expect(addTrackedSlip(slip('d', 'NEW1')).number).toBe(3);
  });

  it('keeps at most the newest slips', () => {
    for (let i = 0; i < MAX_TRACKED + 3; i++) addTrackedSlip(slip(`s${i}`, `C${i}`));
    const list = readTrackedSlips();
    expect(list).toHaveLength(MAX_TRACKED);
    expect(list[0].id).toBe(`s${MAX_TRACKED + 2}`);
  });

  it('names a split slip by its first code', () => {
    expect(slipName({ number: 4, parts: [{ desk: 'sportybet', code: 'P1', legs: 25 }, { desk: 'sportybet', code: 'P2', legs: 4 }] })).toBe('Slip 4 · SportyBet P1 +1');
  });
});

describe('slip alert copy', () => {
  it('names the slip in the title and keeps the market in the body', () => {
    const copy = bellLegCopy({ won: true, slip: 'Slip 2 · SportyBet ABC123', label: 'Over 1.5 goals', score: 'A 2-0 B', odds: '1.30', settled: 1, total: 5 });
    expect(copy).toEqual({ title: 'Leg won · Slip 2 · SportyBet ABC123', body: 'Over 1.5 goals · A 2-0 B · 1.30 · 1 of 5 settled' });
    expect(bellLegCopy({ won: false, slip: 'Tracked slip', label: 'BTTS', score: 'A 0-0 B', odds: '', settled: 2, total: 2 }).title).toBe('Leg lost · BTTS');
    expect(slipVerdictTitle('Slip 2 · SportyBet ABC123', 5, 5, 0)).toBe('Slip 2 · SportyBet ABC123 won · 5 of 5 legs');
    expect(slipVerdictTitle('', 3, 5, 2)).toBe('Slip lost · 3 of 5 legs won');
  });

  it('explains matches against legs when a match carries two picks', () => {
    const legs = [...Array.from({ length: 28 }, (_, i) => ({ eventId: `m${i}` })), { eventId: 'm3' }];
    expect(bellCoverLine(legs)).toBe('Alerts on for 28 matches · 29 legs, as 1 match has 2 picks. Kick-off and goals once per match, a result for every leg.');
    expect(bellCoverLine([{ eventId: 'a' }, { eventId: 'b' }])).toBe('Alerts on for 2 matches: kick-off, goals and every result.');
  });
});
