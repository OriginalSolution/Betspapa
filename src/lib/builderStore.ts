import type { BookedDeskView } from './bookedSlip';
import { DESK_NAMES } from './engineSlips';
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
  /** Order the slip was tracked in, so alerts can say "Slip 2". */
  number?: number;
  /** "Slip 2 · SportyBet ABC123". Set when the slip is tracked. */
  name?: string;
  /** Where the slip came from: Book + track, a trend code, a Picks master code or a Codes strategy. */
  source?: TrackSource;
  /** Short origin line such as "Over 1.5 goals · 80%+". */
  origin?: string;
};

export type TrackSource = 'book' | 'trend' | 'master' | 'picks' | 'codes';

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
  const keys = trackedLegKeys();
  for (const leg of tracked?.legs || []) keys.add(leg.key);
  return keys;
}

/* ------------------------------------------------------------------ */
/* Several tracked slips. A new slip never replaces an older one.       */
/* ------------------------------------------------------------------ */

const LIST_KEY = 'betspapa.trackedSlips.v1';
export const MAX_TRACKED = 12;

type TrackedList = { next: number; slips: TrackedSlip[] };

export function deskLabel(desk: string): string {
  return (DESK_NAMES as Record<string, string>)[desk] || (desk ? desk[0].toUpperCase() + desk.slice(1) : '');
}

/** "Slip 2 · SportyBet ABC123", with "+1" when the slip was booked in more than one code. */
export function slipName(slip: Pick<TrackedSlip, 'number' | 'parts' | 'name'>): string {
  if (slip.name) return slip.name;
  const head = slip.number ? `Slip ${slip.number}` : 'Slip';
  const first = slip.parts[0];
  if (!first) return head;
  const more = slip.parts.length > 1 ? ` +${slip.parts.length - 1}` : '';
  return `${head} · ${deskLabel(first.desk)} ${first.code}${more}`;
}

/** Same codes on the same bookmaker means the same slip, whichever screen tracked it. */
export function slipSignature(slip: Pick<TrackedSlip, 'parts' | 'legs'>): string {
  const codes = slip.parts.map((part) => `${part.desk}:${part.code}`).sort();
  if (codes.length) return codes.join('|');
  return slip.legs.map((leg) => leg.key).sort().join('|');
}

function readList(): TrackedList | null {
  try {
    const raw = localStorage.getItem(LIST_KEY);
    if (raw == null) return null;
    const parsed = JSON.parse(raw);
    const slips = (Array.isArray(parsed?.slips) ? parsed.slips : [])
      .filter((slip: TrackedSlip) => slip && typeof slip.id === 'string' && Array.isArray(slip.legs))
      .map(normaliseTracked);
    const top = slips.reduce((most: number, slip: TrackedSlip) => Math.max(most, slip.number || 0), 0);
    const next = Math.max(Number(parsed?.next) || 1, top + 1);
    return { next, slips };
  } catch {
    return null;
  }
}

function writeList(list: TrackedList) {
  try {
    localStorage.setItem(LIST_KEY, JSON.stringify(list));
  } catch {
    /* private mode keeps the list for this visit */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT));
}

/** The one slip older versions tracked becomes Slip 1 of the list. */
function migrated(): TrackedList {
  const { tracked } = readBuilder();
  if (!tracked || !tracked.legs.length) return { next: 1, slips: [] };
  const slip: TrackedSlip = { ...tracked, number: 1, source: tracked.source || 'book' };
  return { next: 2, slips: [{ ...slip, name: slipName(slip) }] };
}

function list(): TrackedList {
  const stored = readList();
  if (stored) return stored;
  const fresh = migrated();
  try {
    localStorage.setItem(LIST_KEY, JSON.stringify(fresh));
  } catch {
    /* read again next time */
  }
  return fresh;
}

/** Every tracked slip, newest first. */
export function readTrackedSlips(): TrackedSlip[] {
  return [...list().slips].sort((a, b) => (b.number || 0) - (a.number || 0) || b.bookedAt.localeCompare(a.bookedAt));
}

export function findTrackedSlip(signature: string): TrackedSlip | null {
  return list().slips.find((slip) => slipSignature(slip) === signature) || null;
}

/**
 * Add a slip to the tracked list. The same codes tracked twice stay one slip.
 * Over the cap, the oldest slip goes first.
 */
export function addTrackedSlip(input: Omit<TrackedSlip, 'number' | 'name'>): TrackedSlip {
  const current = list();
  const signature = slipSignature(input);
  const existing = current.slips.find((slip) => slip.id === input.id || slipSignature(slip) === signature);
  if (existing) return existing;
  const number = current.next;
  const base: TrackedSlip = { ...input, number, name: undefined };
  const slip: TrackedSlip = { ...base, name: slipName(base) };
  const slips = [...current.slips, slip].sort((a, b) => (a.number || 0) - (b.number || 0));
  while (slips.length > MAX_TRACKED) slips.shift();
  writeList({ next: number + 1, slips });
  return slip;
}

export function removeTrackedSlip(id: string) {
  const current = list();
  writeList({ ...current, slips: current.slips.filter((slip) => slip.id !== id) });
  const builder = readBuilder();
  if (builder.tracked?.id === id) writeBuilder({ packIds: [], tracked: null });
}

export function updateTrackedSlip(id: string, patch: Partial<TrackedSlip>) {
  const current = list();
  writeList({ ...current, slips: current.slips.map((slip) => (slip.id === id ? { ...slip, ...patch, id } : slip)) });
}

/** Leg keys on any tracked slip. */
export function trackedLegKeys(): Set<string> {
  const keys = new Set<string>();
  for (const slip of list().slips) for (const leg of slip.legs) keys.add(leg.key);
  return keys;
}

/* Expand state per slip card, remembered across visits. */
const OPEN_KEY = 'betspapa.slipOpen.v1';

export function readOpenSlips(): Record<string, boolean> {
  try {
    const parsed = JSON.parse(localStorage.getItem(OPEN_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function writeOpenSlips(next: Record<string, boolean>) {
  try {
    localStorage.setItem(OPEN_KEY, JSON.stringify(next));
  } catch {
    /* this visit only */
  }
}
