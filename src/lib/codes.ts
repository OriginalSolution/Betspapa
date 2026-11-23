import { ApiError, apiJson, apiUrl } from './apiJson';
/** Client for GET /api/codes. The server is the only place a code is booked. */

export type CodeLeg = {
  eventId: string;
  home: string;
  away: string;
  homeCrest: string;
  awayCrest: string;
  label: string;
  odds: number;
  kickoff: string;
  score: string;
  status: 'open' | 'won' | 'lost' | 'void' | string;
  mismatch: boolean;
};

export type CodePart = {
  code: string;
  cap: number | null;
  legs: CodeLeg[];
  legCount: number;
  totalOdds: number;
  highRisk: boolean;
  highRiskWhy: string;
  link: string;
  football: boolean;
  footballCode: string;
  footballLink: string;
  status: 'open' | 'won' | 'lost' | 'void' | string;
  settled: number;
  mix: Record<string, number>;
  marketIds: string[];
  openCount: number;
  firstKick: string;
  lastKick: string;
  readAt: string;
  missed: string;
};

export type CodeSlot = { parts: CodePart[]; empty: string };

export type CodeStrategy = {
  id: string;
  code: string;
  name: string;
  rules: string[];
  week: CodeSlot;
  today: CodeSlot;
};

export type CodeNotice = {
  id: string;
  strategy: string;
  kind: 'booked' | 'rebooked' | 'settled' | string;
  title: string;
  body: string;
  code: string;
  home: string;
  away: string;
  homeCrest: string;
  awayCrest: string;
};

export type CodesView = {
  oddsLabel: string;
  warning: string;
  target: number;
  reading: boolean;
  readAt: string;
  nextReadAt: string;
  week: { id: string; from: string; to: string; label: string };
  today: string;
  strategies: CodeStrategy[];
  days: string[];
  dailies: Record<string, Record<string, CodeSlot>>;
  record: {
    since: string;
    strategies: Array<{ id: string; won: number; lost: number; void: number; open: number; mismatch: number }>;
  };
  notices: CodeNotice[];
};

export function codesUrl(): string {
  return apiUrl('/api/codes');
}

function codesView(body: CodesView): CodesView {
  if (!body || !Array.isArray(body.strategies)) throw new ApiError('Codes could not be read. Check your connection and try again.', 200);
  return body;
}

export async function fetchCodes(): Promise<CodesView> {
  return codesView(await apiJson<CodesView>('/api/codes', 'Codes'));
}

/** Read the open codes back. This does not book. */
export async function refreshCodes(): Promise<CodesView> {
  return codesView(await apiJson<CodesView>('/api/codes', 'Codes', 'POST'));
}

export function oddsText(value: number): string {
  if (!Number.isFinite(value)) return '';
  return value.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function gmtClock(iso: string): string {
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' }).format(date);
}

export function gmtDay(iso: string): string {
  const date = new Date(`${iso}T12:00:00Z`);
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(date).replace(',', '');
}

export function dayChip(iso: string): { weekday: string; day: string } {
  const date = new Date(`${iso}T12:00:00Z`);
  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(date).replace(/\./g, '').slice(0, 3).toUpperCase();
  return { weekday, day: new Intl.DateTimeFormat('en-GB', { day: 'numeric', timeZone: 'UTC' }).format(date) };
}

export function mixText(mix: Record<string, number>): string {
  return Object.entries(mix)
    .map(([name, count]) => `${count} × ${name}`)
    .join(' · ');
}

export function readbackLine(part: CodePart): string {
  const markets = part.marketIds.filter(Boolean).join(' / ') || 'markets';
  const open = part.openCount === part.legCount ? 'all open' : `${part.openCount} still open`;
  const result = part.status === 'lost' ? 'lost' : part.status === 'won' ? 'won' : part.status === 'void' ? 'void' : 'in play';
  return `Readback OK · ${part.legCount} legs, market ids ${markets}, ${open} · ${result} · ${part.settled} of ${part.legCount} settled`;
}

/** Dailies are booked at 21:00 GMT the evening before their day. */
export const BOOK_HOUR_GMT = 21;
const DAY_MS = 86_400_000;

/** A slot counts as having a code when at least one part carries a share code. Settled codes still count. */
export function hasCode(slot: CodeSlot | null | undefined): slot is CodeSlot {
  return !!slot && Array.isArray(slot.parts) && slot.parts.some((part) => !!part?.code);
}

function shortWeekday(ms: number): string {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(new Date(ms)).replace(/\./g, '').slice(0, 3);
}

/** The next 21:00 GMT booking run strictly after `now`. */
export function nextBookingAt(now: number): number {
  const date = new Date(now);
  let at = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), BOOK_HOUR_GMT);
  if (at <= now) at += DAY_MS;
  return at;
}

/**
 * One quiet line in place of the hidden empty cards. A future day names its own run;
 * anything else names the soonest run.
 */
export function bookingLine(now: number, day?: string): string {
  if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) {
    const at = Date.parse(`${day}T00:00:00Z`) - (24 - BOOK_HOUR_GMT) * 3_600_000;
    if (Number.isFinite(at) && at > now && at > nextBookingAt(now)) {
      return `${shortWeekday(at + DAY_MS)} codes book ${shortWeekday(at)} ${BOOK_HOUR_GMT}:00 GMT`;
    }
  }
  return `Next codes book ${shortWeekday(nextBookingAt(now))} ${BOOK_HOUR_GMT}:00 GMT`;
}

/** Week view: a strategy shows when it has a week code or a code for today. */
export function weekCards(view: CodesView): CodeStrategy[] {
  return view.strategies.filter((item) => hasCode(item.week) || hasCode(item.today));
}

/** Daily view: only strategies with a code on that day. */
export function dailyCards(view: CodesView, day: string): Array<{ strategy: CodeStrategy; slot: CodeSlot }> {
  return view.strategies
    .map((strategy) => ({ strategy, slot: view.dailies[day]?.[strategy.id] }))
    .filter((row): row is { strategy: CodeStrategy; slot: CodeSlot } => hasCode(row.slot));
}

/** Ladder dailies this week, only the days that have a code. */
export function ladderDays(view: CodesView): Array<{ iso: string; slot: CodeSlot }> {
  return view.days
    .map((iso) => ({ iso, slot: view.dailies[iso]?.ladder }))
    .filter((row): row is { iso: string; slot: CodeSlot } => hasCode(row.slot));
}

/** Every share code on the board, as SportyBet codes (Football.com codes ride along), for spotting new ones after Read back. */
export function codesIn(view: CodesView | null | undefined): Array<{ code: string; desk: 'sportybet' | 'footballcom'; link?: string }> {
  if (!view) return [];
  const slots: CodeSlot[] = [];
  for (const item of view.strategies || []) slots.push(item.week, item.today);
  for (const day of Object.values(view.dailies || {})) slots.push(...Object.values(day || {}));
  const out: Array<{ code: string; desk: 'sportybet' | 'footballcom'; link?: string }> = [];
  const seen = new Set<string>();
  for (const slot of slots) {
    for (const part of slot?.parts || []) {
      if (part?.code && !seen.has(part.code)) {
        seen.add(part.code);
        out.push({ code: part.code, desk: 'sportybet', link: part.link || undefined });
      }
      if (part?.football && part.footballCode && !seen.has(part.footballCode)) {
        seen.add(part.footballCode);
        out.push({ code: part.footballCode, desk: 'footballcom', link: part.footballLink || undefined });
      }
    }
  }
  return out;
}
