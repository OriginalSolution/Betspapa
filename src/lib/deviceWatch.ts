import { registerPlugin } from '@capacitor/core';
import type { Follows, InboxItem, Match, Settings } from '../types';
import { isFollowed } from './group';
import { isNativeApp } from './nativeHttp';

export type WatchSettings = Pick<Settings, 'kickoff' | 'goal' | 'red' | 'ht' | 'ft' | 'var' | 'goalSound'>;

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
};

type WatchPlugin = {
  sync(options: { patch: string }): Promise<void>;
  pull(): Promise<{ state: string }>;
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
