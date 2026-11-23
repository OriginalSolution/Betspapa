import { marketLabel } from './engineSlips';

export type PickStatus = 'open' | 'won' | 'lost' | 'void';

export type RecordPick = {
  key: string;
  eventId: string;
  market: string;
  odds: number;
  rate: number | null;
  sample: string | null;
  home: string;
  away: string;
  homeCrest: string | null;
  awayCrest: string | null;
  kickoff: string;
  day: string;
  tournament: string;
  country: string;
  status: PickStatus;
  ft: string | null;
  ht: string | null;
  note: string | null;
};

export type RecordMarket = {
  market: string;
  won: number;
  graded: number;
  low: { won: number; graded: number };
  high: { won: number; graded: number };
};

export type RecordCode = {
  id: string;
  slipId: string;
  slip: string;
  desk: string;
  code: string;
  link: string | null;
  totalOdds: number | null;
  legs: string[];
  legCount: number;
  settled: number;
  lostLegs: number;
  firstKickoff: string;
  day: string;
  status: PickStatus;
  missedBy: string | null;
};

export type ResultsView = {
  since: string;
  day: string;
  days: Array<{ day: string; picks: number; won: number; lost: number; open: number; void: number }>;
  summary: { picks: number; graded: number; won: number; lost: number; open: number; void: number; rate: number | null };
  markets: RecordMarket[];
  picks: RecordPick[];
  codes: RecordCode[];
};

export function resultsUrl(day?: string): string {
  const host = typeof location !== 'undefined' ? location.hostname : '';
  const base = host === 'localhost' || host === '127.0.0.1' ? '/api/results' : 'https://api.betspapa.com/api/results';
  return day ? `${base}?day=${encodeURIComponent(day)}` : base;
}

export async function fetchResults(day?: string): Promise<ResultsView> {
  const response = await fetch(resultsUrl(day));
  if (!response.ok) throw new Error(`Record returned ${response.status}`);
  return response.json();
}

/** Accra calendar day, which is the matchday the record uses. */
export function accraToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Accra', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function recordingSince(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Recording since this restart';
  const label = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Accra' }).format(date);
  return `Recording since ${label}`;
}

export function hitPercent(won: number, graded: number): number | null {
  if (!graded) return null;
  return Math.round((won / graded) * 100);
}

export function bandLine(row: { won: number; graded: number }): string {
  if (!row.graded) return '–';
  const pct = hitPercent(row.won, row.graded);
  return pct == null ? '–' : `${pct}%`;
}

export function recordMarket(market: string): string {
  if (market === 'dc-12') return 'Double chance 12';
  if (market === 'dc-1x') return 'Double chance 1X';
  if (market === 'dc-x2') return 'Double chance X2';
  if (market === 'sh-over05') return '2nd half over 0.5';
  return marketLabel(market);
}

export function scoreText(ft: string | null): string {
  if (!ft) return '';
  const parts = ft.split('-');
  if (parts.length !== 2) return ft;
  return `${parts[0]} - ${parts[1]}`;
}

export function halfText(ht: string | null): string {
  if (!ht) return '';
  return `HT ${ht.replace('-', '-')}`;
}

/** Five calendar days around the selected matchday, matching the record strip. */
export function dayWindow(selected: string): string[] {
  const [y, m, d] = selected.split('-').map(Number);
  if (!y || !m || !d) return [selected];
  const start = new Date(Date.UTC(y, m - 1, d));
  return Array.from({ length: 5 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index - 2);
    return date.toISOString().slice(0, 10);
  });
}

export function kickClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Africa/Accra' }).format(date);
}
