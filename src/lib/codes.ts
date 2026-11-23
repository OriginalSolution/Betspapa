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
