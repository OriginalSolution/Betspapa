export function isoFromDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(iso: string, days: number): string {
  const date = parseIsoDate(iso);
  date.setDate(date.getDate() + days);
  return isoFromDate(date);
}

export function dayOffset(today: string, selected: string): number | null {
  const diff = Math.round((parseIsoDate(selected).getTime() - parseIsoDate(today).getTime()) / 86_400_000);
  return Number.isFinite(diff) ? diff : null;
}

export function dayRangeIso(date: string): { from: string; to: string } {
  const [y, m, d] = date.split('-').map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end = new Date(y, m - 1, d, 23, 59, 59, 999);
  return { from: start.toISOString(), to: end.toISOString() };
}

/** True when a kickoff falls on the board's local calendar day. */
export function onBoardDate(utcDate: string, date: string): boolean {
  const kick = Date.parse(utcDate);
  if (!Number.isFinite(kick)) return false;
  const { from, to } = dayRangeIso(date);
  return kick >= Date.parse(from) && kick <= Date.parse(to);
}

export function atLocal(today: string, dayDelta: number, hour: number, minute: number): string {
  const date = parseIsoDate(today);
  date.setDate(date.getDate() + dayDelta);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}
