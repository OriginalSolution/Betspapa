import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LiveAlertsBanner } from '../components/AlertSetup';
import { EmptyState, MatchSkeleton } from '../components/MatchBoard';
import { ErrorBanner, FilterChips } from '../components/Chrome';
import { TodayBoard, TodaySortBar, WeekStrip, type TodaySort } from '../components/TodayBoard';
import { scopeLabel, TodaySearch } from '../components/TodaySearch';
import { ENGINE_POLL_MS, fetchEngine, readEngineCache, subscribeEngine, writeEngineCache, type EngineState } from '../lib/engineSlips';
import { applyFilter, type BoardFilter } from '../lib/group';
import { useStore } from '../state/store';
import type { Match } from '../types';

type PromoCard = { id: string; title: string; image: string; route: string; matchId: string };

function promoHref(item: PromoCard) {
  if (item.route === 'match' && item.matchId) return `/match/${item.matchId}`;
  if (item.route === 'slips') return '/slips';
  if (item.route === 'picks') return '/picks';
  return '/';
}

function PromoCarousel() {
  const [items, setItems] = useState<PromoCard[]>([]);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let stop = false;
    void fetch('/api/promos')
      .then((response) => (response.ok ? response.json() : { promos: [] }))
      .then((body: { promos?: PromoCard[] }) => {
        if (!stop) setItems(Array.isArray(body.promos) ? body.promos : []);
      })
      .catch(() => {
        /* the board still loads */
      });
    return () => {
      stop = true;
    };
  }, []);
  useEffect(() => {
    if (items.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => {
      const node = scroller.current;
      if (!node) return;
      const next = node.scrollLeft + node.clientWidth >= node.scrollWidth - 8 ? 0 : node.scrollLeft + node.clientWidth;
      node.scrollTo({ left: next, behavior: 'smooth' });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [items.length]);
  if (!items.length) return null;
  return (
    <div className="promo-carousel" ref={scroller} aria-label="Promos">
      {items.map((item) => (
        <Link key={item.id} to={promoHref(item)}>
          <img src={item.image} alt={item.title} />
        </Link>
      ))}
    </div>
  );
}

function useEngine() {
  const [state, setState] = useState<EngineState | null>(() => readEngineCache());
  useEffect(() => subscribeEngine(() => setState(readEngineCache())), []);
  useEffect(() => {
    let stop = false;
    const pull = async () => {
      try {
        const next = await fetchEngine();
        if (stop) return;
        writeEngineCache(next);
        setState(next);
      } catch {
        /* cards stay up without a trend chip */
      }
    };
    void pull();
    const timer = window.setInterval(() => void pull(), ENGINE_POLL_MS);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, []);
  return state;
}

export function TodayPage() {
  const { matches, loading, ready, feedNote, refresh } = useStore();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<BoardFilter>('all');
  const [sort, setSort] = useState<TodaySort>('kickoff');
  const engine = useEngine();
  const [query, setQuery] = useState('');
  const [extra, setExtra] = useState<Match[]>([]);
  const onQuery = useCallback((value: string) => setQuery(value), []);
  const teamId = params.get('team') || '';
  const leagueId = params.get('league') || '';
  const pool = (teamId || leagueId) && extra.length ? extra : matches;
  const scoped = pool.filter((match) => {
    if (teamId) return match.home.id === teamId || match.away.id === teamId;
    if (leagueId) return match.competition.id === leagueId;
    return true;
  });
  const shown = applyFilter(scoped, filter);
  const waiting = !ready || (loading && matches.length === 0);
  const searching = query.trim().length >= 2;

  return (
    <>
      <LiveAlertsBanner />
      <PromoCarousel />
      <TodaySearch matches={matches} onQuery={onQuery} onCorpus={setExtra} />
      {!searching && (teamId || leagueId) && (
        <div className="scope-bar">
          <strong>{scopeLabel(pool, teamId, leagueId)}</strong>
          <button type="button" onClick={() => setParams({})}>
            Clear
          </button>
        </div>
      )}
      {searching ? null : (
        <>
          {!(teamId || leagueId) && <WeekStrip />}
          {!(teamId || leagueId) && <TodaySortBar value={sort} onChange={setSort} />}
          {!(teamId || leagueId) && <FilterChips value={filter} onChange={setFilter} />}
          {feedNote && (
            <div className="banner" role="status">
              <p>{feedNote}</p>
              {matches.length > 0 && (
                <button type="button" onClick={refresh}>
                  Retry
                </button>
              )}
            </div>
          )}
          <ErrorBanner />
          {waiting ? (
            <MatchSkeleton />
          ) : shown.length === 0 ? (
            <EmptyState
              title={feedNote ? 'Fixtures unavailable' : teamId || leagueId ? 'No fixtures for this filter' : 'No fixtures'}
              body={feedNote ?? 'Nothing on this day matches. Try another day or clear the filter.'}
              action={
                feedNote ? (
                  <button type="button" className="btn" onClick={refresh}>
                    Retry
                  </button>
                ) : undefined
              }
            />
          ) : (
            <TodayBoard matches={shown} sort={sort} engine={engine} />
          )}
        </>
      )}
    </>
  );
}
