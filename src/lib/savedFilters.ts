import type { Match } from '../types';

/** A country or league the person chose to keep on Today. Stored on the phone. */
export type SavedChip = {
  kind: 'country' | 'league';
  id: string;
  label: string;
};

const KEY = 'betspapa.savedFilters.v1';

function fold(value: string): string {
  return value.trim().toLowerCase();
}

export function countryChip(area: string): SavedChip | null {
  const label = area.trim();
  if (!label) return null;
  return { kind: 'country', id: fold(label), label };
}

export function leagueChip(id: string, name: string): SavedChip | null {
  const label = name.trim();
  const key = id.trim();
  if (!label || !key) return null;
  return { kind: 'league', id: key, label };
}

export function sameChip(a: SavedChip, b: SavedChip): boolean {
  return a.kind === b.kind && a.id === b.id;
}

export function loadSavedFilters(read: (key: string) => string | null = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}): SavedChip[] {
  try {
    const raw = read(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is SavedChip => {
      if (!item || typeof item !== 'object') return false;
      const chip = item as SavedChip;
      return (chip.kind === 'country' || chip.kind === 'league') && typeof chip.id === 'string' && typeof chip.label === 'string' && chip.id.length > 0 && chip.label.length > 0;
    });
  } catch {
    return [];
  }
}

export function writeSavedFilters(chips: SavedChip[], write: (key: string, value: string) => void = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* a full or private store must not block Today */
  }
}): void {
  write(KEY, JSON.stringify(chips));
}

export function addSavedChip(chips: SavedChip[], chip: SavedChip): SavedChip[] {
  if (chips.some((item) => sameChip(item, chip))) return chips;
  return [...chips, chip];
}

/** Countries and leagues on the board that are not saved yet. */
export function filterSuggestions(matches: Match[], saved: SavedChip[]): SavedChip[] {
  const seen = new Set<string>();
  const out: SavedChip[] = [];
  const push = (chip: SavedChip | null) => {
    if (!chip) return;
    const key = `${chip.kind}:${chip.id}`;
    if (seen.has(key) || saved.some((item) => sameChip(item, chip))) return;
    seen.add(key);
    out.push(chip);
  };
  for (const match of matches) {
    push(countryChip(match.competition.area));
    push(leagueChip(match.competition.id, match.competition.name));
  }
  return out;
}

/** A saved set narrows the board. A country chip matches the area. A league chip matches that competition. */
export function applySavedFilters(matches: Match[], saved: SavedChip[]): Match[] {
  if (!saved.length) return matches;
  const countries = new Set(saved.filter((chip) => chip.kind === 'country').map((chip) => chip.id));
  const leagues = new Set(saved.filter((chip) => chip.kind === 'league').map((chip) => chip.id));
  return matches.filter((match) => countries.has(fold(match.competition.area)) || leagues.has(match.competition.id));
}
