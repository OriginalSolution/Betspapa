import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { DEMO_POLL_MS } from '../data/catalog';
import { findDemoMatch, projectDemo } from '../data/project';
import { fetchConfig, fetchLiveBoard } from '../data/remote';
import { isoFromDate } from '../lib/dates';
import { pushBrowserNotification, readPermission, requestBrowserPermission, vibrateAlert, type BrowserPermission } from '../lib/notify';
import { diffAlerts, type AlertSignal } from '../lib/signals';
import {
  loadDemoStart,
  loadFollows,
  loadInbox,
  loadSettings,
  markNotificationSent,
  saveDemoStart,
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
};

type Action =
  | { type: 'config'; config: AppConfig }
  | { type: 'snapshot'; matches: Match[]; now: number }
  | { type: 'error'; error: string }
  | { type: 'set-date'; date: string }
  | { type: 'restart'; t0: number }
  | { type: 'toggle-match'; id: string }
  | { type: 'toggle-team'; team: FollowedTeam }
  | { type: 'setting'; key: keyof Settings; value: boolean }
  | { type: 'read-all' }
  | { type: 'clear-inbox' }
  | { type: 'clear-follows' }
  | { type: 'dismiss-toast'; id: string }
  | { type: 'clear-toasts' }
  | { type: 'clear-flash' }
  | { type: 'permission'; permission: BrowserPermission }
  | { type: 'active'; id: string | null };

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

function applySnapshot(state: State, matches: Match[], now: number): State {
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
  };
}

function init(): State {
  const today = isoFromDate(new Date());
  return {
    config: { mode: 'demo', provider: 'Simulated matchday', pollMs: DEMO_POLL_MS, reason: null },
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
      return applySnapshot(state, action.matches, action.now);
    case 'error':
      return { ...state, error: action.error, loading: false };
    case 'set-date':
      return { ...state, date: action.date, baseline: null, matches: [], loading: true, error: null };
    case 'restart': {
      const matches =
        state.config.mode === 'demo'
          ? projectDemo({ t0: action.t0, now: action.t0, selectedDate: state.date, todayDate: state.today })
          : state.matches;
      return { ...state, t0: action.t0, matches, baseline: matches, flash: [], loading: false, updatedAt: action.t0 };
    }
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
  restartDemo: () => void;
  toggleMatch: (id: string) => void;
  toggleTeam: (team: FollowedTeam) => void;
  setSetting: (key: keyof Settings, value: boolean) => void;
  markAllRead: () => void;
  clearInbox: () => void;
  clearFollows: () => void;
  dismissToast: (id: string) => void;
  requestPermission: () => Promise<void>;
  setActiveMatch: (id: string | null) => void;
  findMatch: (id: string) => Match | null;
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
        const matches =
          current.config.mode === 'live'
            ? await fetchLiveBoard(current.date, current.follows, current.activeMatchId)
            : projectDemo({
                t0: current.t0,
                now: Date.now(),
                selectedDate: current.date,
                todayDate: current.today,
              });
        if (!cancelled) dispatch({ type: 'snapshot', matches, now: Date.now() });
      } catch (error) {
        if (!cancelled) dispatch({ type: 'error', error: error instanceof Error ? error.message : 'Could not load scores' });
      }
    };
    refreshRef.current = () => {
      void run();
    };
    void run();
    const timer = window.setInterval(() => void run(), state.config.pollMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [state.ready, state.config.mode, state.config.pollMs, state.date, state.t0]);

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
    for (const toast of state.toasts) {
      if (!seenToast.current.has(toast.id)) {
        seenToast.current.add(toast.id);
        vibrateAlert();
      }
      if (!state.settings.browser || state.permission !== 'granted' || wasNotificationSent(toast.id)) continue;
      markNotificationSent(toast.id);
      void pushBrowserNotification(toast);
    }
  }, [state.toasts, state.settings.browser, state.permission]);

  const setDate = useCallback((date: string) => dispatch({ type: 'set-date', date }), []);
  const refresh = useCallback(() => refreshRef.current(), []);
  const restartDemo = useCallback(() => {
    const t0 = Date.now();
    saveDemoStart(t0);
    dispatch({ type: 'restart', t0 });
  }, []);
  const toggleMatch = useCallback((id: string) => dispatch({ type: 'toggle-match', id }), []);
  const toggleTeam = useCallback((team: FollowedTeam) => dispatch({ type: 'toggle-team', team }), []);
  const setSetting = useCallback((key: keyof Settings, value: boolean) => dispatch({ type: 'setting', key, value }), []);
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

  const value = useMemo<Store>(() => {
    const findMatch = (id: string) => {
      const onBoard = state.matches.find((match) => match.id === id);
      if (onBoard) return onBoard;
      if (state.config.mode !== 'demo') return null;
      return findDemoMatch(id, state.t0, Date.now(), state.today);
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
      restartDemo,
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
    };
  }, [
    state,
    setDate,
    refresh,
    restartDemo,
    toggleMatch,
    toggleTeam,
    setSetting,
    markAllRead,
    clearInbox,
    clearFollows,
    dismissToast,
    requestPermission,
    setActiveMatch,
  ]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside StoreProvider');
  return store;
}
