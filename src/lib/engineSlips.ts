import { CapacitorHttp } from '@capacitor/core';
import { publishableOdds } from './oddsFloor';
import { isNativeApp, nativeRequestOptions, readJsonBody } from './nativeHttp';

/** Production engine. It is not origin-locked. Codes only come from this payload. */
export const ENGINE_URL = 'https://api.betspapa.com/api/engine';

/** Poll while the Slips tab is open. */
export const ENGINE_POLL_MS = 3 * 60 * 1000;

const CACHE_KEY = 'betspapa.engine.v1';
const CODE = /^[A-Za-z0-9]{4,16}$/;
const HOSTS: Record<DeskId, string> = {
  sportybet: 'https://www.sportybet.com/',
  footballcom: 'https://www.football.com/',
  msport: 'https://www.msport.com/',
  betika: 'https://betika.com/',
  betpawa: 'https://www.betpawa.com.gh/',
};

export const DESKS = ['sportybet', 'footballcom', 'msport', 'betika', 'betpawa'] as const;
export type DeskId = (typeof DESKS)[number];

export const DESK_NAMES: Record<DeskId, string> = {
  sportybet: 'SportyBet',
  footballcom: 'Football.com',
  msport: 'MSport',
  betika: 'Betika',
  betpawa: 'BetPawa',
};

const MARKET_LABELS: Record<string, string> = {
  home: 'Home win',
  draw: 'Draw',
  away: 'Away win',
  over15: 'Over 1.5 goals',
  over25: 'Over 2.5 goals',
  over35: 'Over 3.5 goals',
  under25: 'Under 2.5 goals',
  btts: 'Both teams to score',
  'btts-no': 'Both teams not to score',
  'home-score': 'Home team to score',
  'away-score': 'Away team to score',
  over05: 'Over 0.5 goals',
  under15: 'Under 1.5 goals',
  under35: 'Under 3.5 goals',
  'dc-1x': 'Double chance 1X',
  'dc-12': 'Double chance 12',
  'dc-x2': 'Double chance X2',
  'dnb-home': 'Draw no bet home',
  'dnb-away': 'Draw no bet away',
  'home-over15': 'Home over 1.5 goals',
  'home-over25': 'Home over 2.5 goals',
  'home-under15': 'Home under 1.5 goals',
  'away-over15': 'Away over 1.5 goals',
  'away-over25': 'Away over 2.5 goals',
  'away-under15': 'Away under 1.5 goals',
  'home-clean': 'Home clean sheet',
  'away-clean': 'Away clean sheet',
  'fh-home': 'First-half home win',
  'fh-draw': 'First-half draw',
  'fh-away': 'First-half away win',
  'fh-over05': 'First-half over 0.5',
  'fh-over15': 'First-half over 1.5',
  'corners-over75': 'Over 7.5 corners',
  'corners-over85': 'Over 8.5 corners',
  'corners-over95': 'Over 9.5 corners',
  'corners-over105': 'Over 10.5 corners',
  'corners-under95': 'Under 9.5 corners',
  'corners-under105': 'Under 10.5 corners',
  'cards-over35': 'Over 3.5 cards',
  'cards-over45': 'Over 4.5 cards',
};

export type EngineLeg = {
  eventId: string;
  market: string;
  match: string;
  kickoff: string;
  odds: number;
  occurrence: number | null;
  sample: string | null;
};

export type EnginePart = {
  code: string;
  link: string;
  totalOdds: number | null;
  legs: number;
};

export type EngineDrop = {
  eventId: string;
  market: string | null;
  match: string;
  reason: string;
};

export type EngineBook = {
  parts: EnginePart[];
  error: string | null;
  dropped: EngineDrop[];
};

export type EngineSlip = {
  id: string;
  label: string;
  market: string | null;
  legCount: number;
  legs: EngineLeg[];
  sameAsMaster: boolean;
  bookedAt: string | null;
  books: Partial<Record<DeskId, EngineBook>>;
};

export type EngineState = {
  updatedAt: string | null;
  master: EngineSlip | null;
  trends: EngineSlip[];
};

const listeners = new Set<() => void>();
let memory: EngineState | null | undefined;

export function subscribeEngine(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emptyBook(): EngineBook {
  return { parts: [], error: null, dropped: [] };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function parsePart(value: unknown, desk: DeskId): EnginePart | null {
  const row = asRecord(value);
  if (!row) return null;
  const code = text(row.code);
  const link = text(row.link);
  if (!code || !CODE.test(code) || !link || !link.startsWith(HOSTS[desk])) return null;
  const total = Number(row.totalOdds);
  const legs = Number(row.legs);
  return {
    code,
    link,
    totalOdds: Number.isFinite(total) ? total : null,
    legs: Number.isFinite(legs) ? legs : 0,
  };
}

function parseDrop(value: unknown): EngineDrop | null {
  const row = asRecord(value);
  if (!row) return null;
  const eventId = text(row.eventId);
  const reason = text(row.reason);
  if (!eventId || !reason) return null;
  return {
    eventId,
    market: text(row.market),
    match: text(row.match) || eventId,
    reason,
  };
}

function parseBook(value: unknown, desk: DeskId): EngineBook {
  const row = asRecord(value);
  if (!row) return emptyBook();
  const parts = Array.isArray(row.parts) ? row.parts.map((part) => parsePart(part, desk)).filter((part): part is EnginePart => Boolean(part)) : [];
  const dropped = Array.isArray(row.dropped) ? row.dropped.map(parseDrop).filter((drop): drop is EngineDrop => Boolean(drop)) : [];
  return {
    parts,
    error: parts.length ? null : text(row.error),
    dropped,
  };
}

function parseLeg(value: unknown): EngineLeg | null {
  const row = asRecord(value);
  if (!row) return null;
  const eventId = text(row.eventId);
  const market = text(row.market);
  const match = text(row.match);
  const kickoff = text(row.kickoff);
  const odds = Number(row.odds);
  if (!eventId || !market || !match || !kickoff || !publishableOdds(odds)) return null;
  const occurrence = Number(row.occurrence);
  return {
    eventId,
    market,
    match,
    kickoff,
    odds,
    occurrence: Number.isFinite(occurrence) ? occurrence : null,
    sample: text(row.sample),
  };
}

function parseSlip(value: unknown): EngineSlip | null {
  const row = asRecord(value);
  if (!row) return null;
  const id = text(row.id);
  if (!id) return null;
  const legs = Array.isArray(row.legs) ? row.legs.map(parseLeg).filter((leg): leg is EngineLeg => Boolean(leg)) : [];
  const books: EngineSlip['books'] = {};
  const rawBooks = asRecord(row.books) || {};
  for (const desk of DESKS) {
    if (desk in rawBooks) books[desk] = parseBook(rawBooks[desk], desk);
  }
  const count = Number(row.legCount);
  return {
    id,
    label: text(row.label) || text(row.name) || id,
    market: text(row.market),
    legCount: Number.isFinite(count) ? count : legs.length,
    legs,
    sameAsMaster: Boolean(row.sameAsMaster),
    bookedAt: text(row.bookedAt),
    books,
  };
}

export function parseEngine(body: unknown): EngineState {
  const row = asRecord(body);
  if (!row) throw new Error('Slips feed was empty');
  const trends = Array.isArray(row.trends) ? row.trends.map(parseSlip).filter((slip): slip is EngineSlip => Boolean(slip)) : [];
  return {
    updatedAt: text(row.updatedAt),
    master: parseSlip(row.master),
    trends,
  };
}

export function readEngineCache(): EngineState | null {
  if (memory !== undefined) return memory;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    memory = raw ? parseEngine(JSON.parse(raw) as unknown) : null;
  } catch {
    memory = null;
  }
  return memory;
}

export function writeEngineCache(state: EngineState): void {
  memory = state;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(state));
  } catch {
    /* the in-memory copy still serves this session */
  }
  for (const listener of listeners) listener();
}

export async function fetchEngine(): Promise<EngineState> {
  if (isNativeApp()) {
    const response = await CapacitorHttp.request(nativeRequestOptions('GET', ENGINE_URL, { connectMs: 20_000, readMs: 30_000 }));
    if (response.status < 200 || response.status >= 300) throw new Error(`Slips returned ${response.status}`);
    return parseEngine(readJsonBody(response.data));
  }
  const response = await fetch(ENGINE_URL);
  if (!response.ok) throw new Error(`Slips returned ${response.status}`);
  return parseEngine(await response.json());
}

export function deskBook(slip: EngineSlip | null | undefined, desk: DeskId): EngineBook {
  return slip?.books[desk] || emptyBook();
}

export function marketLabel(market: string | null | undefined): string {
  if (!market) return 'Pick';
  return MARKET_LABELS[market] || market;
}

/** A price under 1.20 is not shown. 1.20 stays. */
export function showOdds(value: number | null | undefined): string | null {
  if (typeof value !== 'number' || !publishableOdds(value)) return null;
  return value.toFixed(2);
}

export function visibleLegs(slip: EngineSlip | null | undefined): EngineLeg[] {
  return (slip?.legs || []).filter((leg) => publishableOdds(leg.odds));
}

export function picksLabel(count: number): string {
  return `${count} ${count === 1 ? 'pick' : 'picks'}`;
}

export type BookingChip = { bookId: DeskId; code: string };

/** A real code for this leg, preferring that trend's own slip. Never invented. */
export function bookingForPick(state: EngineState | null, eventId: string, market: string): BookingChip | null {
  if (!state || !eventId || !market) return null;
  const trend = state.trends.find((item) => item.id === `80:${market}` || item.id === `price:${market}` || item.market === market);
  const slips = [trend, state.master].filter((item): item is EngineSlip => Boolean(item));
  for (const slip of slips) {
    if (!slip.legs.some((leg) => leg.eventId === eventId && leg.market === market)) continue;
    for (const desk of DESKS) {
      const book = slip.books[desk];
      if (!book) continue;
      const dropped = book.dropped.some((drop) => drop.eventId === eventId && (drop.market == null || drop.market === market));
      if (dropped) continue;
      const part = book.parts.find((item) => item.code);
      if (part) return { bookId: desk, code: part.code };
    }
  }
  return null;
}

export function splitMatch(match: string): [string, string] {
  const parts = match.split(/\s+vs\s+/i);
  if (parts.length >= 2) return [parts[0].trim(), parts.slice(1).join(' vs ').trim()];
  return [match.trim(), ''];
}
