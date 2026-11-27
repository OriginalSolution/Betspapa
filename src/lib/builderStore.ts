import type { BookedDeskView } from './bookedSlip';
import type { BuilderLeg } from './slipPacks';

const KEY = 'betspapa.builder.v1';
const EVENT = 'betspapa-builder';
export const MAX_TRACKED_SLIPS = 12;

export type BookedPart = { desk: string; code: string; legs: number };

export type TrackedSlip = {
  id: string;
  label: string;
  legs: BuilderLeg[];
  bookedAt: string;
  parts: BookedPart[];
  desks: BookedDeskView[];
  alerted: boolean;
};

export type BuilderState = {
  packIds: string[];
  /** Newest first. Booking adds a slip; it does not replace the others. */
  slips: TrackedSlip[];
  /** The newest slip, so a reader that still expects one slip sees the latest booking. */
  tracked: TrackedSlip | null;
};

const empty: BuilderState = { packIds: [], slips: [], tracked: null };

export function readBuilder(): BuilderState {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '');
    const packIds = Array.isArray(parsed?.packIds) ? parsed.packIds.filter((id: unknown) => typeof id === 'string') : [];
    const slips = slipsFromStored(parsed);
    return { packIds, slips, tracked: slips[0] ?? null };
  } catch {
    return empty;
  }
}

export function writeBuilder(next: { packIds: string[]; slips: TrackedSlip[] }) {
  const slips = next.slips.map(normaliseTracked).filter((slip) => slip.legs.length).slice(0, MAX_TRACKED_SLIPS);
  const stored = { packIds: next.packIds, slips, tracked: slips[0] ?? null };
  try {
    localStorage.setItem(KEY, JSON.stringify(stored));
  } catch {
    /* private mode still shows the slips for this visit */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Keep every tracked slip and put this one first. The same code updates in place. */
export function addTrackedSlip(slip: TrackedSlip) {
  const current = readBuilder();
  const next = normaliseTracked(slip);
  const code = next.parts[0]?.code;
  const slips = [next, ...current.slips.filter((item) => item.id !== next.id && (!code || item.parts[0]?.code !== code))];
  writeBuilder({ packIds: current.packIds, slips });
}

export function updateTrackedSlip(id: string, patch: Partial<TrackedSlip>) {
  const current = readBuilder();
  writeBuilder({
    packIds: current.packIds,
    slips: current.slips.map((slip) => (slip.id === id ? normaliseTracked({ ...slip, ...patch, id: slip.id, legs: patch.legs || slip.legs }) : slip)),
  });
}

export function replacePackIds(packIds: string[]) {
  const current = readBuilder();
  writeBuilder({ packIds, slips: current.slips });
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

/** Old phones stored one slip under `tracked`. It joins the list and is never dropped. */
export function slipsFromStored(parsed: { slips?: unknown; tracked?: TrackedSlip } | null): TrackedSlip[] {
  const listed = Array.isArray(parsed?.slips)
    ? parsed.slips.map((slip) => normaliseTracked(slip as TrackedSlip)).filter((slip) => slip.legs.length)
    : [];
  const legacy = parsed?.tracked && Array.isArray(parsed.tracked.legs) ? normaliseTracked(parsed.tracked) : null;
  const withLegacy = legacy && legacy.legs.length && !listed.some((slip) => slip.id === legacy.id) ? [legacy, ...listed] : listed;
  return withLegacy.slice(0, MAX_TRACKED_SLIPS);
}

function normaliseTracked(value: TrackedSlip): TrackedSlip {
  const parts = Array.isArray(value.parts) ? value.parts.filter((part) => part && typeof part.code === 'string' && typeof part.desk === 'string') : [];
  const desks = Array.isArray(value.desks) ? value.desks : [];
  const label = typeof value.label === 'string' && value.label.trim() ? value.label.trim().slice(0, 80) : parts[0]?.code || 'Tracked slip';
  return { ...value, label, parts, desks, alerted: Boolean(value.alerted), legs: Array.isArray(value.legs) ? value.legs : [] };
}

export function builderLegKeys(): Set<string> {
  const keys = new Set<string>();
  for (const slip of readBuilder().slips) for (const leg of slip.legs) keys.add(leg.key);
  return keys;
}
