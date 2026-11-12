import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { Follows, InboxItem, Match, Settings } from '../types';
import { isFollowed } from './group';
import { isNativeApp } from './nativeHttp';

export type WatchSettings = Pick<Settings, 'kickoff' | 'goal' | 'red' | 'ht' | 'ft' | 'var' | 'goalSound' | 'notificationStyle'>;

export type ScheduleRow = {
  id: string;
  kickoff: string;
  home: string;
  away: string;
  homeId: string;
  awayId: string;
  status: Match['status'];
  minute: number | null;
  homeScore: number | null;
  awayScore: number | null;
  htHome: number | null;
  htAway: number | null;
  varReview: Match['varReview'];
  homeFull?: string;
  awayFull?: string;
  homeAbbr?: string;
  awayAbbr?: string;
  homeColor?: string;
  awayColor?: string;
  homeCrest?: string;
  awayCrest?: string;
  competition?: string;
};

export type WatchBooking = {
  id: string;
  matchId: string;
  market: string;
  marketLabel: string;
  odds: string;
  fixture: string;
  bookId?: string;
  code?: string;
};

export type WatchPatch = {
  browser?: boolean;
  settings?: WatchSettings;
  follows?: Follows;
  trends?: string[];
  seen?: string[];
  sent?: string[];
  inbox?: InboxItem[];
  replaceInbox?: boolean;
  schedule?: ScheduleRow[];
  bookings?: WatchBooking[];
};

export type WatchDeviceStatus = {
  notifications: 'granted' | 'denied' | 'prompt';
  batteryUnrestricted: boolean;
  watching: boolean;
  liveCount: number;
  exactAlarms?: 'granted' | 'denied' | 'unsupported';
  oem?: string;
  setupVersion?: number;
  setupFinished?: boolean;
};

type WatchPlugin = {
  sync(options: { patch: string }): Promise<void>;
  pull(): Promise<{ state: string }>;
  status(): Promise<WatchDeviceStatus>;
  requestNotifications(): Promise<WatchDeviceStatus>;
  requestBattery(): Promise<WatchDeviceStatus>;
  requestExactAlarm(): Promise<WatchDeviceStatus>;
  openAutostart(): Promise<WatchDeviceStatus & { opened?: string }>;
  markSetup(options: { version: number; finished: boolean }): Promise<WatchDeviceStatus>;
  scheduleTest(): Promise<void>;
  present(options: { payload: string }): Promise<void>;
  addListener(eventName: 'resume', listenerFunc: (status: WatchDeviceStatus) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'pause', listenerFunc: () => void): Promise<PluginListenerHandle>;
};

const Watch = registerPlugin<WatchPlugin>('Watch');

const draft: {
  browser?: boolean;
  settings?: WatchSettings;
  follows?: Follows;
  trends?: string[];
  seen?: string[];
  sent?: string[];
  inbox?: InboxItem[];
  replaceInbox?: boolean;
  matches?: Match[];
  bookings?: WatchBooking[];
} = {};

export function mergeInbox(local: InboxItem[], remote: InboxItem[]): InboxItem[] {
  const known = new Set(local.map((item) => item.id));
  const extra = (remote || []).filter((item) => item && typeof item.id === 'string' && item.id && !known.has(item.id));
  return [...extra, ...local].slice(0, 120);
}

export function trendMatchId(trendId: string): string {
  const cut = trendId.lastIndexOf(':');
  return cut > 0 ? trendId.slice(0, cut) : '';
}

/** Followed matches, plus any match a followed trend is tied to. */
export function scheduleRows(matches: Match[], follows: Follows, trends: string[]): ScheduleRow[] {
  const wanted = new Set(trends.map(trendMatchId).filter(Boolean));
  return matches
    .filter((match) => isFollowed(match, follows) || wanted.has(match.id))
    .map((match) => ({
      id: match.id,
      kickoff: match.utcDate,
      home: match.home.shortName,
      away: match.away.shortName,
      homeId: match.home.id,
      awayId: match.away.id,
      status: match.status,
      minute: match.minute,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      htHome: match.htHome,
      htAway: match.htAway,
      varReview: match.varReview ?? null,
      homeFull: match.home.name,
      awayFull: match.away.name,
      homeAbbr: match.home.abbr,
      awayAbbr: match.away.abbr,
      homeColor: match.home.color,
      awayColor: match.away.color,
      homeCrest: match.home.crest || '',
      awayCrest: match.away.crest || '',
      competition: match.competition?.name || '',
    }));
}

export function stageWatch(partial: {
  browser?: boolean;
  settings?: WatchSettings;
  follows?: Follows;
  trends?: string[];
  seen?: string[];
  sent?: string[];
  inbox?: InboxItem[];
  replaceInbox?: boolean;
  matches?: Match[];
  bookings?: WatchBooking[];
}) {
  if (partial.browser !== undefined) draft.browser = partial.browser;
  if (partial.settings) draft.settings = partial.settings;
  if (partial.follows) draft.follows = partial.follows;
  if (partial.trends) draft.trends = partial.trends;
  if (partial.seen) draft.seen = partial.seen;
  if (partial.sent) draft.sent = partial.sent;
  if (partial.inbox) draft.inbox = partial.inbox;
  if (partial.replaceInbox) draft.replaceInbox = true;
  if (partial.matches) draft.matches = partial.matches;
  if (partial.bookings) draft.bookings = partial.bookings;
  void flushWatch();
}

let pending = false;
let running: Promise<void> = Promise.resolve();

function buildPatch(): WatchPatch {
  const patch: WatchPatch = {};
  if (draft.browser !== undefined) patch.browser = draft.browser;
  if (draft.settings) patch.settings = draft.settings;
  if (draft.follows) patch.follows = draft.follows;
  if (draft.trends) patch.trends = draft.trends;
  if (draft.seen) patch.seen = draft.seen;
  if (draft.sent) patch.sent = draft.sent;
  if (draft.inbox) {
    patch.inbox = draft.inbox;
    if (draft.replaceInbox) patch.replaceInbox = true;
  }
  draft.replaceInbox = false;
  if (draft.matches && draft.follows) patch.schedule = scheduleRows(draft.matches, draft.follows, draft.trends || []);
  if (draft.bookings) patch.bookings = draft.bookings;
  return patch;
}

export function flushWatch(): Promise<void> {
  if (!isNativeApp()) return Promise.resolve();
  pending = true;
  running = running.then(async () => {
    while (pending) {
      pending = false;
      try {
        await Watch.sync({ patch: JSON.stringify(buildPatch()) });
      } catch {
        /* the board still keeps follows and alerts in the WebView */
      }
    }
  });
  return running;
}

export async function watchStatus(): Promise<WatchDeviceStatus | null> {
  if (!isNativeApp()) return null;
  try {
    return await Watch.status();
  } catch {
    return null;
  }
}

export async function requestWatchNotifications(): Promise<WatchDeviceStatus | null> {
  if (!isNativeApp()) return null;
  try {
    return await Watch.requestNotifications();
  } catch {
    return watchStatus();
  }
}

export async function requestBatteryExemption(): Promise<WatchDeviceStatus | null> {
  if (!isNativeApp()) return null;
  try {
    return await Watch.requestBattery();
  } catch {
    return watchStatus();
  }
}

export async function requestExactAlarm(): Promise<WatchDeviceStatus | null> {
  if (!isNativeApp()) return null;
  try {
    return await Watch.requestExactAlarm();
  } catch {
    return watchStatus();
  }
}

export async function openAutostartSettings(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    await Watch.openAutostart();
    return true;
  } catch {
    return false;
  }
}

export async function markAlertSetup(version: number, finished: boolean): Promise<WatchDeviceStatus | null> {
  if (!isNativeApp()) return null;
  try {
    return await Watch.markSetup({ version, finished });
  } catch {
    return null;
  }
}

export function watchNativeEvents(handlers: {
  resume?: (status: WatchDeviceStatus) => void;
  pause?: () => void;
}): () => void {
  if (!isNativeApp()) return () => {};
  let alive = true;
  const handles: PluginListenerHandle[] = [];
  void (async () => {
    if (handlers.resume) {
      const handle = await Watch.addListener('resume', handlers.resume);
      if (!alive) void handle.remove();
      else handles.push(handle);
    }
    if (handlers.pause) {
      const handle = await Watch.addListener('pause', handlers.pause);
      if (!alive) void handle.remove();
      else handles.push(handle);
    }
  })();
  return () => {
    alive = false;
    handles.forEach((handle) => void handle.remove());
  };
}

/** Schedules a native notification about 10 seconds later. Closing the app does not cancel it. */
export async function scheduleBackgroundTest(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    await Watch.scheduleTest();
    return true;
  } catch {
    return false;
  }
}

export async function pullWatch(): Promise<WatchPatch> {
  if (!isNativeApp()) return {};
  try {
    const result = await Watch.pull();
    const parsed = JSON.parse(result.state || '{}') as WatchPatch;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}
