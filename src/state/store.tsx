import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { fetchConfig, fetchSportyBoard } from '../data/remote';
import { isoFromDate } from '../lib/dates';
import { playGoalSound } from '../lib/cheer';
import { pushBrowserNotification, readPermission, requestBrowserPermission, vibrateAlert, type BrowserPermission } from '../lib/notify';
import { diffAlerts, type AlertSignal } from '../lib/signals';
import {
  loadDemoStart,
  loadFollows,
  loadInbox,
  loadSettings,
  markNotificationSent,
  saveFollows,
  saveInbox,
  saveSettings,
  wasNotificationSent,
} from '../lib/storage';
import type { AppConfig, FollowedTeam, Follows, InboxItem, Match, Settings } from '../types';

type State = {
  config: AppConfig;
  ready: boolean;
  loading: boolean;
  error: string | null;
  updatedAt: number | null;
  date: string;
  today: string;
  t0: number;
  matches: Match[];
  baseline: Match[] | null;
  follows: Follows;
  settings: Settings;
  inbox: InboxItem[];
  toasts: InboxItem[];
  flash: string[];
  flashToken: number;
  permission: BrowserPermission;
  activeMatchId: string | null;
  usingDemo: boolean;
  feedNote: string | null;
};

type Action =
  | { type: 'config'; config: AppConfig }
  | { type: 'snapshot'; matches: Match[]; now: number; usingDemo?: boolean; feedNote?: string | null }
  | { type: 'error'; error: string }
  | { type: 'set-date'; date: string }
  | { type: 'toggle-match'; id: string }
  | { type: 'toggle-team'; team: FollowedTeam }
  | { type: 'setting'; key: keyof Settings; value: Settings[keyof Settings] }
  | { type: 'read-all' }
  | { type: 'clear-inbox' }
  | { type: 'clear-follows' }
  | { type: 'dismiss-toast'; id: string }
  | { type: 'clear-toasts' }
  | { type: 'clear-flash' }
  | { type: 'permission'; permission: BrowserPermission }
  | { type: 'active'; id: string | null }
  | { type: 'notices'; items: InboxItem[] };

function toItem(signal: AlertSignal, now: number): InboxItem {
  return {
    id: signal.key,
    matchId: signal.matchId,
    kind: signal.kind,
    title: signal.title,
    body: signal.body,
    createdAt: now,
    read: false,
  };
}

function changedScores(prev: Match[] | null, next: Match[]): string[] {
  if (!prev) return [];
  const prior = new Map(prev.map((match) => [match.id, match]));
  return next
    .filter((match) => {
      const before = prior.get(match.id);
      return Boolean(before && (before.homeScore !== match.homeScore || before.awayScore !== match.awayScore));
    })
    .map((match) => match.id);
}

function applySnapshot(state: State, matches: Match[], now: number, usingDemo = state.usingDemo, feedNote = state.feedNote): State {
  const alerts = diffAlerts(state.baseline, matches, {
    generation: state.t0,
    followedMatchIds: new Set(state.follows.matches),
    followedTeamIds: new Set(state.follows.teams.map((team) => team.id)),
    settings: state.settings,
  });
  const known = new Set(state.inbox.map((item) => item.id));
  const fresh = alerts.filter((alert) => !known.has(alert.key)).map((alert) => toItem(alert, now));
  const flash = changedScores(state.baseline, matches);
  return {
    ...state,
    matches,
    baseline: matches,
    updatedAt: now,
    loading: false,
    error: null,
    inbox: [...fresh, ...state.inbox].slice(0, 80),
    toasts: fresh.length ? fresh : state.toasts,
    flash: flash.length ? flash : state.flash,
    flashToken: flash.length ? state.flashToken + 1 : state.flashToken,
    usingDemo,
    feedNote,
  };
}

function init(): State {
  const today = isoFromDate(new Date());
  return {
    config: { mode: 'sporty', provider: 'Betspapa fixtures', pollMs: 30_000, reason: null },
    usingDemo: false,
    feedNote: null,
    ready: false,
    loading: true,
    error: null,
    updatedAt: null,
    date: today,
    today,
    t0: loadDemoStart(),
    matches: [],
    baseline: null,
    follows: loadFollows(),
    settings: loadSettings(),
    inbox: loadInbox(),
    toasts: [],
    flash: [],
    flashToken: 0,
    permission: readPermission(),
    activeMatchId: null,
  };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'config':
      return { ...state, config: action.config, ready: true };
    case 'snapshot':
      return applySnapshot(state, action.matches, action.now, action.usingDemo, action.feedNote);
    case 'error':
      return { ...state, error: action.error, loading: false };
    case 'set-date':
      return { ...state, date: action.date, baseline: null, matches: [], loading: true, error: null };
    case 'toggle-match': {
      const has = state.follows.matches.includes(action.id);
      const matches = has ? state.follows.matches.filter((id) => id !== action.id) : [...state.follows.matches, action.id];
      return { ...state, follows: { ...state.follows, matches } };
    }
    case 'toggle-team': {
      const has = state.follows.teams.some((team) => team.id === action.team.id);
      const teams = has ? state.follows.teams.filter((team) => team.id !== action.team.id) : [...state.follows.teams, action.team];
      return { ...state, follows: { ...state.follows, teams } };
    }
    case 'setting':
      return { ...state, settings: { ...state.settings, [action.key]: action.value } };
    case 'read-all':
      if (state.inbox.every((item) => item.read)) return state;
      return { ...state, inbox: state.inbox.map((item) => ({ ...item, read: true })) };
    case 'clear-inbox':
      return { ...state, inbox: [], toasts: [] };
    case 'clear-follows':
      return { ...state, follows: { matches: [], teams: [] } };
    case 'dismiss-toast':
      return { ...state, toasts: state.toasts.filter((item) => item.id !== action.id) };
    case 'clear-toasts':
      return { ...state, toasts: [] };
    case 'clear-flash':
      return { ...state, flash: [] };
    case 'permission':
      return { ...state, permission: action.permission };
    case 'active':
      if (state.activeMatchId === action.id) return state;
      return { ...state, activeMatchId: action.id };
    case 'notices': {
      const known = new Set(state.inbox.map((item) => item.id));
      const fresh = action.items.filter((item) => !known.has(item.id));
      if (!fresh.length) return state;
      return { ...state, inbox: [...fresh, ...state.inbox].slice(0, 120), toasts: fresh };
    }
    default:
      return state;
  }
}

type Store = {
  mode: AppConfig['mode'];
  provider: string;
  pollMs: number;
  reason: string | null;
  ready: boolean;
  loading: boolean;
  error: string | null;
  updatedAt: number | null;
  date: string;
  today: string;
  t0: number;
  usingDemo: boolean;
  feedNote: string | null;
  matches: Match[];
  follows: Follows;
  settings: Settings;
  inbox: InboxItem[];
  toasts: InboxItem[];
  flash: string[];
  permission: BrowserPermission;
  unread: number;
  setDate: (date: string) => void;
  refresh: () => void;
  toggleMatch: (id: string) => void;
  toggleTeam: (team: FollowedTeam) => void;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  markAllRead: () => void;
  clearInbox: () => void;
  clearFollows: () => void;
  dismissToast: (id: string) => void;
  requestPermission: () => Promise<void>;
  setActiveMatch: (id: string | null) => void;
  findMatch: (id: string) => Match | null;
  pushNotices: (items: InboxItem[]) => void;
};

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, init);
  const stateRef = useRef(state);
  stateRef.current = state;
  const refreshRef = useRef<() => void>(() => {});

  useEffect(() => {
    let cancelled = false;
    fetchConfig().then((config) => {
      if (!cancelled) dispatch({ type: 'config', config });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!state.ready) return;
    let cancelled = false;
    const run = async () => {
      const current = stateRef.current;
      try {
        try {
          const matches = await fetchSportyBoard(current.date);
          if (!cancelled) dispatch({ type: 'snapshot', matches, now: Date.now(), usingDemo: false, feedNote: null });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Fixture feed failed';
          if (!cancelled) {
            dispatch({
              type: 'snapshot',
              matches: [],
              now: Date.now(),
              usingDemo: false,
              feedNote: `Fixture feed is unreachable (${message}).`,
            });
          }
        }
      } catch (error) {
        if (!cancelled) dispatch({ type: 'error', error: error instanceof Error ? error.message : 'Could not load scores' });
      }
    };
    refreshRef.current = () => {
      void run();
    };
    void run();
    const pollMs = state.config.pollMs;
    const timer = window.setInterval(() => void run(), pollMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [state.ready, state.config.pollMs, state.date, state.t0]);

  useEffect(() => {
    saveFollows(state.follows);
  }, [state.follows]);
  useEffect(() => {
    saveSettings(state.settings);
  }, [state.settings]);
  useEffect(() => {
    saveInbox(state.inbox);
  }, [state.inbox]);

  useEffect(() => {
    if (!state.flash.length) return;
    const timer = window.setTimeout(() => dispatch({ type: 'clear-flash' }), 1400);
    return () => window.clearTimeout(timer);
  }, [state.flashToken, state.flash.length]);

  useEffect(() => {
    if (!state.toasts.length) return;
    const timer = window.setTimeout(() => dispatch({ type: 'clear-toasts' }), 5600);
    return () => window.clearTimeout(timer);
  }, [state.toasts]);

  const seenToast = useRef(new Set<string>());
  useEffect(() => {
    let goalSound: 'cheer' | 'chant' | null = null;
    for (const toast of state.toasts) {
      if (!seenToast.current.has(toast.id)) {
        seenToast.current.add(toast.id);
        vibrateAlert();
        if (toast.kind === 'goal' && state.settings.goalSound !== 'off') goalSound = state.settings.goalSound;
      }
      if (!state.settings.browser || state.permission !== 'granted' || wasNotificationSent(toast.id)) continue;
      markNotificationSent(toast.id);
      void pushBrowserNotification(toast);
    }
    if (goalSound) playGoalSound(goalSound);
  }, [state.toasts, state.settings.browser, state.settings.goalSound, state.permission]);

  const setDate = useCallback((date: string) => dispatch({ type: 'set-date', date }), []);
  const refresh = useCallback(() => refreshRef.current(), []);
  const toggleMatch = useCallback((id: string) => dispatch({ type: 'toggle-match', id }), []);
  const toggleTeam = useCallback((team: FollowedTeam) => dispatch({ type: 'toggle-team', team }), []);
  const setSetting = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => dispatch({ type: 'setting', key, value }), []);
  const markAllRead = useCallback(() => dispatch({ type: 'read-all' }), []);
  const clearInbox = useCallback(() => dispatch({ type: 'clear-inbox' }), []);
  const clearFollows = useCallback(() => dispatch({ type: 'clear-follows' }), []);
  const dismissToast = useCallback((id: string) => dispatch({ type: 'dismiss-toast', id }), []);
  const requestPermission = useCallback(async () => {
    const permission = await requestBrowserPermission();
    dispatch({ type: 'permission', permission });
    if (permission === 'granted') dispatch({ type: 'setting', key: 'browser', value: true });
  }, []);
  const setActiveMatch = useCallback((id: string | null) => dispatch({ type: 'active', id }), []);
  const pushNotices = useCallback((items: InboxItem[]) => dispatch({ type: 'notices', items }), []);

  const value = useMemo<Store>(() => {
    const findMatch = (id: string) => {
      const onBoard = state.matches.find((match) => match.id === id);
      return onBoard ?? null;
    };
    return {
      mode: state.config.mode,
      provider: state.config.provider,
      pollMs: state.config.pollMs,
      reason: state.config.reason,
      ready: state.ready,
      loading: state.loading,
      error: state.error,
      updatedAt: state.updatedAt,
      date: state.date,
      today: state.today,
      t0: state.t0,
      usingDemo: state.usingDemo,
      feedNote: state.feedNote,
      matches: state.matches,
      follows: state.follows,
      settings: state.settings,
      inbox: state.inbox,
      toasts: state.toasts,
      flash: state.flash,
      permission: state.permission,
      unread: state.inbox.filter((item) => !item.read).length,
      setDate,
      refresh,
      toggleMatch,
      toggleTeam,
      setSetting,
      markAllRead,
      clearInbox,
      clearFollows,
      dismissToast,
      requestPermission,
      setActiveMatch,
      findMatch,
      pushNotices,
    };
  }, [
    state,
    setDate,
    refresh,
    toggleMatch,
    toggleTeam,
    setSetting,
    markAllRead,
    clearInbox,
    clearFollows,
    dismissToast,
    requestPermission,
    setActiveMatch,
    pushNotices,
  ]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside StoreProvider');
  return store;
}
