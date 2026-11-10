import type { Match } from '../types';
import { addDays } from './dates';

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

export function formatDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(
    new Date(y, m - 1, d),
  );
}

export function dayWord(date: string, today: string): string | null {
  if (date === today) return 'Today';
  if (date === addDays(today, -1)) return 'Yesterday';
  if (date === addDays(today, 1)) return 'Tomorrow';
  return null;
}

export function minuteLabel(match: Match): string {
  if (match.status === 'scheduled') return formatTime(match.utcDate);
  if (match.status === 'halftime') return 'HT';
  if (match.status === 'finished') return 'FT';
  if (match.status === 'postponed') return 'PP';
  if (match.minute == null) return 'Live';
  if (match.injuryTime) return `${match.minute}+${match.injuryTime}′`;
  return `${match.minute}′`;
}

export function statusLine(match: Match): string {
  if (match.status === 'scheduled') return `Kick-off ${formatTime(match.utcDate)}`;
  if (match.status === 'halftime') return 'Half-time';
  if (match.status === 'finished') return 'Full-time';
  if (match.status === 'postponed') return 'Postponed';
  if (match.minute == null) return 'Live';
  if (match.minute < 45) return `First half · ${match.minute}′`;
  return `Second half · ${match.minute}′`;
}

export function scoreDash(home: number | null, away: number | null): string {
  if (home == null || away == null) return '';
  return `${home}–${away}`;
}

export function ago(ts: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - ts) / 1000));
  if (seconds < 10) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function inkFor(hex: string): string {
  const raw = hex.replace('#', '');
  if (raw.length < 6) return '#fff';
  const r = Number.parseInt(raw.slice(0, 2), 16);
  const g = Number.parseInt(raw.slice(2, 4), 16);
  const b = Number.parseInt(raw.slice(4, 6), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.64 ? '#1a1408' : '#fff';
}

export function teamFollow(team: Match['home']): { id: string; name: string; shortName: string; abbr: string; color: string } {
  return { id: team.id, name: team.name, shortName: team.shortName, abbr: team.abbr, color: team.color };
}
