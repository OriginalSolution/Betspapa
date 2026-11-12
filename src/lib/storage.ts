import { defaultSettings, type FollowedTeam, type Follows, type InboxItem, type Settings } from '../types';

const KEYS = {
  follows: 'betspapa.follows.v1',
  settings: 'betspapa.settings.v1',
  inbox: 'betspapa.inbox.v1',
  alerted: 'betspapa.alerted.v1',
  t0: 'betspapa.demo.t0',
  sent: 'betspapa.browserSent.v1',
};

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode and full disks should not break the board */
  }
}

function isTeam(value: unknown): value is FollowedTeam {
  if (!value || typeof value !== 'object') return false;
  const team = value as FollowedTeam;
  return typeof team.id === 'string' && typeof team.shortName === 'string' && typeof team.color === 'string';
}

export function loadFollows(): Follows {
  const raw = read<Partial<Follows>>(KEYS.follows);
  return {
    matches: Array.isArray(raw?.matches) ? raw.matches.filter((id): id is string => typeof id === 'string') : [],
    teams: Array.isArray(raw?.teams) ? raw.teams.filter(isTeam) : [],
  };
}

export function saveFollows(follows: Follows) {
  write(KEYS.follows, follows);
}

export function loadSettings(): Settings {
  const raw = read<Partial<Settings> & { cheer?: boolean }>(KEYS.settings) ?? {};
  const next = { ...defaultSettings };
  (Object.keys(defaultSettings) as Array<keyof Settings>).forEach((key) => {
    if (typeof raw[key] === 'boolean') next[key] = raw[key] as never;
  });
  if (raw.goalSound === 'cheer' || raw.goalSound === 'chant' || raw.goalSound === 'off') next.goalSound = raw.goalSound;
  else if (raw.cheer === false) next.goalSound = 'off';
  next.dataSource = 'sporty';
  return next;
}

export function saveSettings(settings: Settings) {
  write(KEYS.settings, settings);
}

export function loadInbox(): InboxItem[] {
  const raw = read<InboxItem[]>(KEYS.inbox);
  if (!Array.isArray(raw)) return [];
  return raw.filter((item) => item && typeof item.id === 'string' && typeof item.title === 'string').slice(0, 80);
}

export function saveInbox(inbox: InboxItem[]) {
  write(KEYS.inbox, inbox.slice(0, 80));
}

export function loadAlerted(): Set<string> {
  const raw = read<string[]>(KEYS.alerted);
  return new Set(Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : []);
}

export function rememberAlerted(ids: string[]) {
  if (!ids.length) return;
  const next = loadAlerted();
  let changed = false;
  for (const id of ids) {
    if (next.has(id)) continue;
    next.add(id);
    changed = true;
  }
  if (!changed) return;
  write(KEYS.alerted, [...next].slice(-400));
}

export function loadDemoStart(): number {
  try {
    const raw = sessionStorage.getItem(KEYS.t0);
    const parsed = raw ? Number(raw) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    const now = Date.now();
    sessionStorage.setItem(KEYS.t0, String(now));
    return now;
  } catch {
    return Date.now();
  }
}

export function saveDemoStart(t0: number) {
  try {
    sessionStorage.setItem(KEYS.t0, String(t0));
  } catch {
    /* session storage is a convenience */
  }
}

export function loadSent(): string[] {
  const raw = read<string[]>(KEYS.sent);
  return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string').slice(-400) : [];
}

export function wasNotificationSent(id: string): boolean {
  return loadSent().includes(id);
}

export function markNotificationSent(id: string) {
  const next = loadSent();
  if (!next.includes(id)) next.push(id);
  write(KEYS.sent, next.slice(-400));
}
