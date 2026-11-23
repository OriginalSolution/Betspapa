import type { DeskId } from './engineSlips';

/** A code that was just booked, waiting to be highlighted on the page that shows it. */
export type FreshCode = { code: string; desk: DeskId; link?: string };

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const KEY = 'betspapa.freshCodes.v1';
/** A fresh mark is dropped if no page shows the code within this time. */
export const FRESH_TTL_MS = 2 * 60_000;
/** How long the glow pulses before it settles to a steady ring. */
export const PULSE_MS = 4_500;

function session(): Store | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

export function markFresh(codes: FreshCode[], now = Date.now(), store: Store | null = session()): FreshCode[] {
  const clean = codes.filter((item) => item && typeof item.code === 'string' && item.code.trim());
  const seen = new Set<string>();
  const unique = clean.filter((item) => (seen.has(item.code) ? false : (seen.add(item.code), true)));
  if (!store) return unique;
  if (!unique.length) return unique;
  store.setItem(KEY, JSON.stringify({ at: now, codes: unique }));
  return unique;
}

export function freshCodes(now = Date.now(), store: Store | null = session()): FreshCode[] {
  if (!store) return [];
  try {
    const raw = JSON.parse(store.getItem(KEY) || 'null') as { at?: number; codes?: FreshCode[] } | null;
    if (!raw || typeof raw.at !== 'number' || !Array.isArray(raw.codes)) return [];
    if (now - raw.at > FRESH_TTL_MS || raw.at > now + 60_000) {
      store.removeItem(KEY);
      return [];
    }
    return raw.codes.filter((item) => item && typeof item.code === 'string' && item.code);
  } catch {
    return [];
  }
}

export function clearFresh(store: Store | null = session()) {
  store?.removeItem(KEY);
}

/** Codes in `after` that were not in `before`. */
export function newCodes(before: Iterable<string>, after: FreshCode[]): FreshCode[] {
  const old = new Set(before);
  return after.filter((item) => item.code && !old.has(item.code));
}
