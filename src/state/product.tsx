import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  bookingCodes,
  buildPicks,
  isBlacklisted,
  isGreenlisted,
  qualifying,
  trendsFromPicks,
  profile,
  suggestPicks,
  type BookingCode,
  type LedgerEntry,
  type LegStatus,
  type ListItem,
  type PickView,
  type TrendView,
} from '../data/board';
import { staleTrendIds, trendHitNotices } from '../lib/alerts';
import { stageWatch, watchNativeEvents } from '../lib/deviceWatch';
import { syncPushDevice } from '../lib/devicePush';
import { publishableOdds } from '../lib/oddsFloor';
import { bookingForPick, readEngineCache, subscribeEngine } from '../lib/engineSlips';
import { loadAlerted } from '../lib/storage';
import type { InboxItem, Match } from '../types';
import { useStore } from './store';

type Product = {
  picks: PickView[];
  visiblePicks: PickView[];
  trends: TrendView[];
  suggestions: PickView[];
  slip: string[];
  lists: ListItem[];
  ledger: LedgerEntry[];
  codes: BookingCode[];
  hiddenCount: number;
  addLeg: (id: string) => void;
  removeLeg: (id: string) => void;
  toggleList: (item: Omit<ListItem, 'list'>, list: 'black' | 'green') => void;
  clearList: (list: 'black' | 'green') => void;
  pickListed: (pick: PickView, list: 'black' | 'green') => boolean;
  trendFollows: string[];
  toggleTrend: (id: string) => void;
  clearStaleTrends: () => number;
};

const ProductContext = createContext<Product | null>(null);
const SLIP_KEY = 'betspapa.slip.v1';
const LIST_KEY = 'betspapa.lists.v1';
const LEDGER_KEY = 'betspapa.ledger.v1';
const SQUAD_KEY = 'betspapa.squadSeen.v1';
const TREND_KEY = 'betspapa.trendFollows.v1';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode should not block the board */
  }
}

function squadSeen(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SQUAD_KEY);
    const parsed = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function notice(id: string, matchId: string, kind: InboxItem['kind'], title: string, body: string): InboxItem {
  return { id, matchId, kind, title, body, createdAt: Date.now(), read: false };
}

export function ProductProvider({ children }: { children: ReactNode }) {
  const { matches, t0, pushNotices, watchReady, follows, settings } = useStore();
  const [manual, setManual] = useState<string[]>(() => read<string[]>(SLIP_KEY, []));
  const [dismissed, setDismissed] = useState<string[]>(() => read<string[]>('betspapa.dismissed.v1', []));
  const [lists, setLists] = useState<ListItem[]>(() => read<ListItem[]>(LIST_KEY, []));
  const [trendFollows, setTrendFollows] = useState<string[]>(() => read<string[]>(TREND_KEY, []).filter((id) => typeof id === 'string'));
  const [extra, setExtra] = useState<LedgerEntry[]>(() => read<LedgerEntry[]>(LEDGER_KEY, []));
  const [engineTick, setEngineTick] = useState(0);
  const baseline = useRef<{ t0: number; status: Map<string, LegStatus>; codes: Map<string, LegStatus> } | null>(null);

  const picks = useMemo(() => buildPicks(matches), [matches]);
  const trends = useMemo(() => trendsFromPicks(picks), [picks]);
  const ledger = extra;
  const greenMarkets = lists.filter((item) => item.list === 'green' && item.scope === 'market').map((item) => item.id);
  const autoIds = useMemo(
    () => qualifying(picks).filter((pick) => !isBlacklisted(pick, lists)).map((pick) => pick.id),
    [picks, lists],
  );
  const slip = useMemo(
    () => [...new Set([...autoIds.filter((id) => !dismissed.includes(id)), ...manual.filter((id) => !dismissed.includes(id))])],
    [autoIds, manual, dismissed],
  );
  const suggestions = useMemo(() => suggestPicks(picks, slip, greenMarkets).filter((pick) => !isBlacklisted(pick, lists)), [picks, slip, greenMarkets, lists]);
  const slipPicks = useMemo(() => picks.filter((pick) => slip.includes(pick.id)), [picks, slip]);
  const codes = useMemo(() => bookingCodes(slipPicks), [slipPicks]);
  const visiblePicks = useMemo(() => picks.filter((pick) => !isBlacklisted(pick, lists)), [picks, lists]);
  const hiddenCount = picks.length - visiblePicks.length;

  useEffect(() => write(SLIP_KEY, manual), [manual]);
  useEffect(() => write('betspapa.dismissed.v1', dismissed), [dismissed]);
  useEffect(() => write(LIST_KEY, lists), [lists]);
  useEffect(() => write(TREND_KEY, trendFollows), [trendFollows]);
  useEffect(() => write(LEDGER_KEY, extra), [extra]);

  useEffect(() => subscribeEngine(() => setEngineTick((tick) => tick + 1)), []);

  useEffect(() => {
    const status = new Map(picks.map((pick) => [pick.id, pick.status]));
    const codeStatus = new Map(codes.map((code) => [code.id, code.status]));
    const seenSquads = squadSeen();
    const squadNotes = squadAlerts(matches, seenSquads);
    if (!baseline.current || baseline.current.t0 !== t0) {
      baseline.current = { t0, status, codes: codeStatus };
      if (squadNotes.length) pushNotices(squadNotes);
      return;
    }
    const notes: InboxItem[] = [...squadNotes];
    const rows: LedgerEntry[] = [];
    for (const pick of picks) {
      if (!pick.bookmarked || pick.softened) continue;
      const before = baseline.current.status.get(pick.id) ?? 'open';
      if (before === pick.status || pick.status === 'open') continue;
      notes.push(
        notice(
          `settle:${t0}:${pick.id}:${pick.status}`,
          pick.matchId,
          pick.status === 'won' ? 'win' : 'bust',
          pick.status === 'won' ? `Won · ${pick.marketLabel}` : `Bust · ${pick.marketLabel}`,
          `${pick.teamName} vs ${pick.opponentName}`,
        ),
      );
      rows.push({
        id: `live:${t0}:${pick.id}:${pick.status}`,
        at: Date.now(),
        market: pick.market,
        teamId: pick.teamId,
        teamName: pick.teamName,
        competitionId: pick.competitionId,
        competitionName: pick.competitionName,
        label: pick.label,
        result: pick.status,
      });
    }
    const slipStatus: LegStatus = !slipPicks.length
      ? 'open'
      : slipPicks.some((pick) => pick.status === 'bust')
        ? 'bust'
        : slipPicks.every((pick) => pick.status === 'won')
          ? 'won'
          : 'open';
    const beforeSlip = baseline.current.codes.get('slip') ?? 'open';
    if (slipPicks.length && beforeSlip !== slipStatus && slipStatus !== 'open') {
      notes.push(
        notice(
          `slip:${t0}:${slipStatus}`,
          slipPicks[0]?.matchId ?? '',
          slipStatus === 'won' ? 'win' : 'bust',
          slipStatus === 'won' ? 'Slip won' : 'Slip bust',
          'Booked trends settled on Betspapa.',
        ),
      );
    }
    codeStatus.set('slip', slipStatus);
    baseline.current = { t0, status, codes: codeStatus };
    if (rows.length) setExtra((current) => [...rows, ...current].slice(0, 200));
    if (notes.length) pushNotices(notes);
  }, [picks, codes, matches, slipPicks, t0, pushNotices]);

  const syncDeviceRef = useRef<() => void>(() => {});
  syncDeviceRef.current = () => {
    const byMatch = new Map(matches.map((match) => [match.id, match]));
    const engine = readEngineCache();
    const bookings = picks
      .filter((pick) => trendFollows.includes(pick.id))
      .map((pick) => {
        const match = byMatch.get(pick.matchId);
        const booked = bookingForPick(engine, pick.matchId, pick.market);
        const odds = publishableOdds(pick.odds) ? pick.odds.toFixed(2) : '';
        return {
          id: pick.id,
          matchId: pick.matchId,
          market: pick.market,
          marketLabel: pick.marketLabel,
          odds,
          fixture: match ? `${match.home.abbr} vs ${match.away.abbr}` : `${pick.teamName} vs ${pick.opponentName}`,
          bookId: booked?.bookId || '',
          code: booked?.code || '',
        };
      })
      .filter((row) => row.odds);
    stageWatch({ trends: trendFollows, matches, bookings });
    const followedPicks = picks.filter((pick) => trendFollows.includes(pick.id));
    void syncPushDevice({
      follows,
      trends: trendFollows,
      bookings: followedPicks.map((pick) => ({ id: pick.id, odds: pick.odds })),
      settings: {
        kickoff: settings.kickoff,
        goal: settings.goal,
        red: settings.red,
        penalty: settings.penalty,
        ht: settings.ht,
        ft: settings.ft,
        var: settings.var,
        goalSound: settings.goalSound,
        redSound: settings.redSound,
        varSound: settings.varSound,
        penaltySound: settings.penaltySound,
        promos: settings.promos,
      },
    });
  };

  useEffect(() => {
    syncDeviceRef.current();
  }, [trendFollows, matches, picks, engineTick, follows, settings]);

  useEffect(() => {
    let last = 0;
    const send = () => {
      const now = Date.now();
      if (now - last < 4000) return;
      last = now;
      syncDeviceRef.current();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') send();
    };
    document.addEventListener('visibilitychange', onVisible);
    const stop = watchNativeEvents({ resume: () => send() });
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      stop();
    };
  }, []);

  useEffect(() => {
    if (!watchReady || !trendFollows.length) return;
    const seen = loadAlerted();
    const notes = trendHitNotices(picks, trendFollows, seen, Date.now());
    if (notes.length) pushNotices(notes);
  }, [picks, trendFollows, pushNotices, watchReady]);

  const value = useMemo<Product>(
    () => ({
      picks,
      visiblePicks,
      trends,
      suggestions,
      slip,
      lists,
      ledger,
      codes,
      hiddenCount,
      addLeg: (id) => {
        setDismissed((current) => current.filter((item) => item !== id));
        setManual((current) => (current.includes(id) ? current : [...current, id]));
      },
      removeLeg: (id) => {
        setDismissed((current) => (current.includes(id) ? current : [...current, id]));
        setManual((current) => current.filter((item) => item !== id));
      },
      toggleList: (item, list) =>
        setLists((current) => {
          const existing = current.find((entry) => entry.scope === item.scope && entry.id === item.id && entry.list === list);
          if (existing) return current.filter((entry) => entry !== existing);
          return [...current.filter((entry) => !(entry.scope === item.scope && entry.id === item.id)), { ...item, list }];
        }),
      clearList: (list) => setLists((current) => current.filter((entry) => entry.list !== list)),
      pickListed: (pick, list) => (list === 'black' ? isBlacklisted(pick, lists) : isGreenlisted(pick, lists)),
      trendFollows,
      toggleTrend: (id) => setTrendFollows((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id])),
      clearStaleTrends: () => {
        const drop = new Set(staleTrendIds(trendFollows, picks, matches, Date.now()));
        if (!drop.size) return 0;
        setTrendFollows((current) => current.filter((id) => !drop.has(id)));
        return drop.size;
      },
    }),
    [picks, visiblePicks, trends, suggestions, slip, lists, ledger, codes, hiddenCount, trendFollows, matches],
  );

  return <ProductContext.Provider value={value}>{children}</ProductContext.Provider>;
}

function squadAlerts(matches: Match[], seen: Set<string>): InboxItem[] {
  const notes: InboxItem[] = [];
  const next = new Set(seen);
  for (const match of matches) {
    for (const team of [match.home, match.away]) {
      const strength = profile(team.id).squad;
      if (strength === 'full') continue;
      const id = `squad:${match.id}:${team.id}`;
      if (next.has(id)) continue;
      next.add(id);
      notes.push(
        notice(
          id,
          match.id,
          'squad',
          strength === 'rotated' ? `Rotated · ${team.shortName}` : `Weakened · ${team.shortName}`,
          strength === 'rotated' ? 'Heavily rotated squad' : 'Not at full strength',
        ),
      );
    }
  }
  if (notes.length) {
    try {
      sessionStorage.setItem(SQUAD_KEY, JSON.stringify([...next]));
    } catch {
      /* ignore */
    }
  }
  return notes;
}

export function useProduct(): Product {
  const product = useContext(ProductContext);
  if (!product) throw new Error('useProduct must be used inside ProductProvider');
  return product;
}
