import type { BookedDeskView } from './bookedSlip';
import type { BuilderLeg } from './slipPacks';

const KEY = 'betspapa.builder.v1';
const EVENT = 'betspapa-builder';

export type BookedPart = { desk: string; code: string; legs: number };

export type TrackedSlip = {
  id: string;
  legs: BuilderLeg[];
  bookedAt: string;
  parts: BookedPart[];
  desks: BookedDeskView[];
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
    const tracked = parsed?.tracked && Array.isArray(parsed.tracked.legs) ? normaliseTracked(parsed.tracked) : null;
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

function normaliseTracked(value: TrackedSlip): TrackedSlip {
  const parts = Array.isArray(value.parts) ? value.parts.filter((part) => part && typeof part.code === 'string' && typeof part.desk === 'string') : [];
  const desks = Array.isArray(value.desks) ? value.desks : [];
  return { ...value, parts, desks, alerted: Boolean(value.alerted) };
}

export function builderLegKeys(): Set<string> {
  const { tracked } = readBuilder();
  return new Set((tracked?.legs || []).map((leg) => leg.key));
}
