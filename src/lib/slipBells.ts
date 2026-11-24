import type { Follows } from '../types';

/**
 * The bell on a slip. When it is on, every match in that slip is followed for
 * kick-off and goals, and each leg raises its own won or lost alert. The legs are
 * stored with the bell so the server and the on-phone watcher can register them
 * without the slip being on screen.
 */
export type BellLeg = {
  key: string;
  eventId: string;
  market: string;
  label: string;
  odds: number;
  kickoff: string;
  home: string;
  away: string;
};

export type SlipBell = {
  id: string;
  label: string;
  on: boolean;
  at: number;
  legs: BellLeg[];
};

export type LegResult = 'won' | 'lost' | 'void';

const KEY = 'betspapa.slipBells.v1';
const SEEN_KEY = 'betspapa.slipBellSeen.v1';
const EVENT = 'betspapa-slip-bells';
/** A bell whose last leg kicked off more than two days ago has nothing left to say. */
export const BELL_KEEP_MS = 2 * 24 * 60 * 60 * 1000;
export const MAX_BELLS = 12;
export const MAX_BELL_LEGS = 60;

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function cleanLeg(value: unknown): BellLeg | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const eventId = typeof row.eventId === 'string' ? row.eventId : '';
  const market = typeof row.market === 'string' ? row.market : '';
  if (!eventId || !market) return null;
  const odds = Number(row.odds);
  return {
    key: typeof row.key === 'string' && row.key ? row.key : `${eventId}|${market}`,
    eventId,
    market,
    label: typeof row.label === 'string' ? row.label : market,
    odds: Number.isFinite(odds) ? odds : 0,
    kickoff: typeof row.kickoff === 'string' ? row.kickoff : '',
    home: typeof row.home === 'string' ? row.home : '',
    away: typeof row.away === 'string' ? row.away : '',
  };
}

export function readBells(): Record<string, SlipBell> {
  const store = storage();
  if (!store) return {};
  try {
    const parsed = JSON.parse(store.getItem(KEY) || '{}');
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, SlipBell> = {};
    for (const [id, raw] of Object.entries(parsed as Record<string, unknown>)) {
      if (!raw || typeof raw !== 'object') continue;
      const row = raw as Record<string, unknown>;
      const legs = (Array.isArray(row.legs) ? row.legs : []).map(cleanLeg).filter((leg): leg is BellLeg => Boolean(leg));
      out[id] = {
        id,
        label: typeof row.label === 'string' ? row.label : '',
        on: row.on === true,
        at: Number(row.at) || 0,
        legs: legs.slice(0, MAX_BELL_LEGS),
      };
    }
    return out;
  } catch {
    return {};
  }
}

function writeBells(next: Record<string, SlipBell>) {
  const store = storage();
  try {
    store?.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode keeps the bell for this visit only */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT));
}

export function isBellOn(id: string, bells = readBells()): boolean {
  return Boolean(bells[id]?.on);
}

export function toBellLeg(leg: { key?: string; eventId: string; market: string; label?: string; odds: number; kickoff: string; home: string; away: string }): BellLeg {
  return {
    key: leg.key || `${leg.eventId}|${leg.market}`,
    eventId: leg.eventId,
    market: leg.market,
    label: leg.label || leg.market,
    odds: leg.odds,
    kickoff: leg.kickoff,
    home: leg.home,
    away: leg.away,
  };
}

/** Last kick-off of a bell, or 0 when none of its legs has a usable time. */
function lastKick(bell: SlipBell): number {
  let last = 0;
  for (const leg of bell.legs) {
    const at = Date.parse(leg.kickoff);
    if (Number.isFinite(at) && at > last) last = at;
  }
  return last;
}

export function pruneBells(bells: Record<string, SlipBell>, now = Date.now()): Record<string, SlipBell> {
  const kept = Object.values(bells)
    .filter((bell) => bell.on)
    .filter((bell) => {
      const last = lastKick(bell);
      return !last || now - last <= BELL_KEEP_MS;
    })
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX_BELLS);
  return Object.fromEntries(kept.map((bell) => [bell.id, bell]));
}

/** Turn a slip's bell on or off. On stores the legs, so alerts survive the slip leaving the screen. */
export function setBell(id: string, on: boolean, slip: { label: string; legs: BellLeg[] }, now = Date.now()): Record<string, SlipBell> {
  const bells = readBells();
  if (on) bells[id] = { id, label: slip.label, on: true, at: now, legs: slip.legs.slice(0, MAX_BELL_LEGS).map(toBellLeg) };
  else delete bells[id];
  const next = pruneBells(bells, now);
  writeBells(next);
  return next;
}

/** Keep a ringing bell's legs current when the slip it belongs to changes (a rebook drops a leg). */
export function refreshBellLegs(id: string, legs: BellLeg[], label?: string) {
  const bells = readBells();
  const bell = bells[id];
  if (!bell?.on) return;
  const next = legs.slice(0, MAX_BELL_LEGS).map(toBellLeg);
  const sameLegs = next.map((leg) => leg.key).join('|') === bell.legs.map((leg) => leg.key).join('|');
  // A slip tracked before slips had names gets its name, so its alerts say which slip.
  const nextLabel = label && label !== bell.label ? label : bell.label;
  if (sameLegs && nextLabel === bell.label) return;
  bells[id] = { ...bell, label: nextLabel, legs: next };
  writeBells(bells);
}

export function subscribeBells(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const run = () => onChange();
  window.addEventListener(EVENT, run);
  window.addEventListener('storage', run);
  return () => {
    window.removeEventListener(EVENT, run);
    window.removeEventListener('storage', run);
  };
}

export function ringingBells(bells = readBells(), now = Date.now()): SlipBell[] {
  return Object.values(pruneBells(bells, now));
}

/** Match ids every ringing bell covers. They are added to the follows the server and the watcher see. */
export function bellMatchIds(bells = readBells(), now = Date.now()): string[] {
  const ids = new Set<string>();
  for (const bell of ringingBells(bells, now)) for (const leg of bell.legs) ids.add(leg.eventId);
  return [...ids];
}

/** Follows plus the matches on ringing slips. The user's own follow list is not changed. */
export function withBellFollows(follows: Follows, bells = readBells(), now = Date.now()): Follows {
  const extra = bellMatchIds(bells, now).filter((id) => !follows.matches.includes(id));
  if (!extra.length) return follows;
  return { ...follows, matches: [...follows.matches, ...extra].slice(0, 200) };
}

/** What the server stores for push. Same shape as the tracked builder slip, plus the label. */
export function bellRegistration(bells = readBells(), now = Date.now()) {
  return ringingBells(bells, now).map((bell) => ({
    id: bell.id,
    label: bell.label.slice(0, 80),
    legs: bell.legs.map((leg) => ({ eventId: leg.eventId, market: leg.market, home: leg.home, away: leg.away, odds: leg.odds, label: leg.label })),
  }));
}

/** Watcher rows: the phone settles each leg itself when there is no Play Services push. */
export function bellWatchRows(bells = readBells(), now = Date.now()) {
  return ringingBells(bells, now).map((bell) => ({
    id: bell.id,
    label: bell.label,
    legs: bell.legs.map((leg) => ({ key: leg.key, eventId: leg.eventId, market: leg.market, label: leg.label, home: leg.home, away: leg.away })),
  }));
}

/** Same ids as the server and the watcher, so the inbox keeps one card per leg. */
export function legNoteId(slipId: string, legKey: string): string {
  return `slipleg:${slipId}:${legKey}`;
}

export function slipNoteId(slipId: string): string {
  return `slip:${slipId}`;
}

/** Leg results this phone has already shown, per slip, so the flip animation runs once. */
export function readSeenResults(slipId: string): Record<string, LegResult> {
  const store = storage();
  try {
    const all = JSON.parse(store?.getItem(SEEN_KEY) || '{}');
    const row = all && typeof all === 'object' ? all[slipId] : null;
    return row && typeof row === 'object' ? row : {};
  } catch {
    return {};
  }
}

export function writeSeenResults(slipId: string, seen: Record<string, LegResult>) {
  const store = storage();
  try {
    const all = JSON.parse(store?.getItem(SEEN_KEY) || '{}') || {};
    all[slipId] = seen;
    const ids = Object.keys(all);
    if (ids.length > 30) for (const id of ids.slice(0, ids.length - 30)) delete all[id];
    store?.setItem(SEEN_KEY, JSON.stringify(all));
  } catch {
    /* the animation may run again next visit */
  }
}

/** Legs that settled since this phone last showed the slip. */
export function freshResults(
  legs: Array<{ key: string; status: string }>,
  seen: Record<string, LegResult>,
): string[] {
  return legs
    .filter((leg) => (leg.status === 'won' || leg.status === 'lost' || leg.status === 'void') && seen[leg.key] !== leg.status)
    .map((leg) => leg.key);
}

let version = 0;
let cached: { version: number; bells: Record<string, SlipBell> } | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener(EVENT, () => { version += 1; });
  window.addEventListener('storage', () => { version += 1; });
}

/** Stable snapshot for React: the same object until a bell changes. */
export function bellSnapshot(): Record<string, SlipBell> {
  if (!cached || cached.version !== version) cached = { version, bells: readBells() };
  return cached.bells;
}
