import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  bookingCodes,
  buildPicks,
  isBlacklisted,
  isGreenlisted,
  listTrends,
  trendsFromPicks,
  profile,
  seedLedger,
  suggestPicks,
  type BookingCode,
  type LedgerEntry,
  type LegStatus,
  type ListItem,
  type PickView,
  type TrendView,
} from '../data/board';
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
};

const ProductContext = createContext<Product | null>(null);
const SLIP_KEY = 'betspapa.slip.v1';
const LIST_KEY = 'betspapa.lists.v1';
const LEDGER_KEY = 'betspapa.ledger.v1';
const SQUAD_KEY = 'betspapa.squadSeen.v1';

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
  const { matches, t0, pushNotices } = useStore();
  const [slip, setSlip] = useState<string[]>(() => read<string[]>(SLIP_KEY, []));
  const [lists, setLists] = useState<ListItem[]>(() => read<ListItem[]>(LIST_KEY, []));
  const [extra, setExtra] = useState<LedgerEntry[]>(() => read<LedgerEntry[]>(LEDGER_KEY, []));
  const baseline = useRef<{ t0: number; status: Map<string, LegStatus>; codes: Map<string, LegStatus> } | null>(null);

  const picks = useMemo(() => buildPicks(matches), [matches]);
  const trends = useMemo(() => (picks.some((pick) => pick.trendId.startsWith('price:')) ? trendsFromPicks(picks) : listTrends()), [picks]);
  const ledger = useMemo(() => [...seedLedger(), ...extra], [extra]);
  const greenMarkets = lists.filter((item) => item.list === 'green' && item.scope === 'market').map((item) => item.id);
  const suggestions = useMemo(() => suggestPicks(picks, slip, greenMarkets).filter((pick) => !isBlacklisted(pick, lists)), [picks, slip, greenMarkets, lists]);
  const slipPicks = useMemo(() => picks.filter((pick) => slip.includes(pick.id)), [picks, slip]);
  const codes = useMemo(() => bookingCodes(slipPicks), [slipPicks]);
  const visiblePicks = useMemo(() => picks.filter((pick) => !isBlacklisted(pick, lists)), [picks, lists]);
  const hiddenCount = picks.length - visiblePicks.length;

  useEffect(() => write(SLIP_KEY, slip), [slip]);
  useEffect(() => write(LIST_KEY, lists), [lists]);
  useEffect(() => write(LEDGER_KEY, extra), [extra]);

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
    for (const code of codes) {
      if (!code.legs.length || code.status === 'open') continue;
      const before = baseline.current.codes.get(code.id) ?? 'open';
      if (before === code.status) continue;
      notes.push(
        notice(
          `code:${t0}:${code.id}:${code.status}:${code.code}`,
          code.legs[0]?.matchId ?? '',
          code.status === 'won' ? 'win' : 'bust',
          code.status === 'won' ? `Booking won · ${code.name}` : `Booking bust · ${code.name}`,
          `${code.code} · demo code`,
        ),
      );
    }
    baseline.current = { t0, status, codes: codeStatus };
    if (rows.length) setExtra((current) => [...rows, ...current].slice(0, 200));
    if (notes.length) pushNotices(notes);
  }, [picks, codes, matches, t0, pushNotices]);

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
      addLeg: (id) => setSlip((current) => (current.includes(id) ? current : [...current, id])),
      removeLeg: (id) => setSlip((current) => current.filter((item) => item !== id)),
      toggleList: (item, list) =>
        setLists((current) => {
          const existing = current.find((entry) => entry.scope === item.scope && entry.id === item.id && entry.list === list);
          if (existing) return current.filter((entry) => entry !== existing);
          return [...current.filter((entry) => !(entry.scope === item.scope && entry.id === item.id)), { ...item, list }];
        }),
      clearList: (list) => setLists((current) => current.filter((entry) => entry.list !== list)),
      pickListed: (pick, list) => (list === 'black' ? isBlacklisted(pick, lists) : isGreenlisted(pick, lists)),
    }),
    [picks, visiblePicks, trends, suggestions, slip, lists, ledger, codes, hiddenCount],
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
