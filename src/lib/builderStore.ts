import type { BuilderLeg } from './slipPacks';

const KEY = 'betspapa.builder.v1';
const EVENT = 'betspapa-builder';

export type BookedPart = { desk: string; code: string; legs: number };

export type TrackedSlip = {
  id: string;
  legs: BuilderLeg[];
  bookedAt: string;
  parts: BookedPart[];
  alerted: boolean;
};

export type BuilderState = {
  packIds: string[];
  tracked: TrackedSlip | null;
};

const empty: BuilderState = { packIds: [], tracked: null };

export function readBuilder(): BuilderState {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '');
    const packIds = Array.isArray(parsed?.packIds) ? parsed.packIds.filter((id: unknown) => typeof id === 'string') : [];
    const tracked = parsed?.tracked && Array.isArray(parsed.tracked.legs) ? (parsed.tracked as TrackedSlip) : null;
    return { packIds, tracked };
  } catch {
    return empty;
  }
}

export function writeBuilder(next: BuilderState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode still shows the slip for this visit */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeBuilder(onChange: () => void): () => void {
  const run = () => onChange();
  window.addEventListener(EVENT, run);
  window.addEventListener('storage', run);
  return () => {
    window.removeEventListener(EVENT, run);
    window.removeEventListener('storage', run);
  };
}

export function builderLegKeys(): Set<string> {
  const { tracked } = readBuilder();
  return new Set((tracked?.legs || []).map((leg) => leg.key));
}
