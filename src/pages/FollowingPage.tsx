import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DateBar, ErrorBanner } from '../components/Chrome';
import { Crest } from '../components/Crest';
import { EmptyState, MatchBoard, MatchSkeleton } from '../components/MatchBoard';
import { staleTrendIds } from '../lib/alerts';
import { catalogCrest, loadCrestCatalog, type CrestCatalog } from '../lib/crestCatalog';
import { fetchEngine, readEngineCache, writeEngineCache, type EngineState } from '../lib/engineSlips';
import { kickoffWhen } from '../lib/format';
import { isFollowed } from '../lib/group';
import { fetchSportyWindow } from '../data/remote';
import { faceForFollow, factFromFace, type TrendFact } from '../lib/trendFace';
import type { Match, Team } from '../types';
import { useProduct } from '../state/product';
import { useStore } from '../state/store';

const FACT_KEY = 'betspapa.trendFacts.v1';
const emptyCatalog: CrestCatalog = { byKey: {}, byId: {} };

function readTrendFacts(): Record<string, TrendFact> {
  try {
    const raw = JSON.parse(localStorage.getItem(FACT_KEY) || '{}') as unknown;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return raw as Record<string, TrendFact>;
  } catch {
    return {};
  }
}

function rememberTrendFacts(facts: TrendFact[]) {
  if (!facts.length) return;
  const current = readTrendFacts();
  let changed = false;
  for (const fact of facts) {
    const prev = current[fact.id];
    if (prev && prev.home === fact.home && prev.away === fact.away && prev.kickoff === fact.kickoff && prev.market === fact.market) continue;
    current[fact.id] = fact;
    changed = true;
  }
  if (!changed) return;
  try {
    localStorage.setItem(FACT_KEY, JSON.stringify(current));
  } catch {
    /* the names still render this session */
  }
}

function withCrest(team: Team | null, catalog: CrestCatalog): Team | null {
  if (!team || team.crest) return team;
  const crest = catalogCrest(catalog, team);
  return crest ? { ...team, crest } : team;
}

export function FollowingPage() {
  const { matches, follows, toggleTeam, ready, loading } = useStore();
  const shown = matches.filter((match) => isFollowed(match, follows));
  const waiting = !ready || (loading && matches.length === 0);
  const hasFollows = follows.matches.length + follows.teams.length > 0;

  return (
    <>
      <DateBar />
      {follows.teams.length > 0 && (
        <div className="team-chips" aria-label="Followed teams">
          {follows.teams.map((team) => (
            <button key={team.id} type="button" className="team-chip" onClick={() => toggleTeam(team)}>
              <i style={{ background: team.color }} />
              {team.shortName}
              <span>Unfollow</span>
            </button>
          ))}
        </div>
      )}
      <FollowedTrends />
      <ErrorBanner />
      {waiting ? (
        <MatchSkeleton />
      ) : !hasFollows ? (
        <EmptyState
          title="Follow a match"
          body="Star a match or follow a team. Kick-off, goals, red cards, half-time and full-time land in Alerts."
          action={
            <Link to="/" className="btn">
              Browse today
            </Link>
          }
        />
      ) : shown.length === 0 ? (
        <EmptyState title="Nothing on this day" body="The teams and matches you follow have no fixture on the selected date." />
      ) : (
        <MatchBoard matches={shown} />
      )}
    </>
  );
}

export function FollowedTrends() {
  const { matches, today } = useStore();
  const { picks, trendFollows, clearStaleTrends } = useProduct();
  const [confirm, setConfirm] = useState(false);
  const [catalogue, setCatalogue] = useState<Match[]>([]);
  const [engine, setEngine] = useState<EngineState | null>(() => readEngineCache());
  const [facts, setFacts] = useState<Record<string, TrendFact>>(() => readTrendFacts());
  const [catalog, setCatalog] = useState<CrestCatalog>(emptyCatalog);
  useEffect(() => {
    void loadCrestCatalog().then(setCatalog);
  }, []);
  useEffect(() => {
    let stop = false;
    const from = '2000-01-01T00:00:00.000Z';
    const to = '2100-01-01T00:00:00.000Z';
    void fetchSportyWindow(from, to)
      .then((rows) => {
        if (!stop) setCatalogue(rows);
      })
      .catch(() => {
        /* the board and any saved names still label a follow */
      });
    void fetchEngine()
      .then((next) => {
        if (stop) return;
        writeEngineCache(next);
        setEngine(next);
      })
      .catch(() => {
        /* a cached engine leg can still name the row */
      });
    return () => {
      stop = true;
    };
  }, []);
  const known = useMemo(() => {
    const byId = new Map<string, Match>();
    for (const match of catalogue) byId.set(match.id, match);
    for (const match of matches) byId.set(match.id, match);
    return [...byId.values()];
  }, [catalogue, matches]);
  const faces = useMemo(
    () => trendFollows.map((id) => faceForFollow(id, { picks, matches: known, facts, engine })),
    [trendFollows, picks, known, facts, engine],
  );
  useEffect(() => {
    const next = faces.map(factFromFace).filter((fact): fact is TrendFact => Boolean(fact));
    if (!next.length) return;
    const current = readTrendFacts();
    const changed = next.some((fact) => {
      const prev = current[fact.id];
      return !prev || prev.home !== fact.home || prev.away !== fact.away || prev.kickoff !== fact.kickoff || prev.market !== fact.market;
    });
    if (!changed) return;
    rememberTrendFacts(next);
    setFacts(readTrendFacts());
  }, [faces]);
  const stale = staleTrendIds(trendFollows, picks, matches, Date.now());
  if (!trendFollows.length) return null;
  return (
    <section className="panel follow-trends">
      <h2>Followed trends</h2>
      <div className="inbox-tools">
        <button
          type="button"
          className="btn btn-quiet"
          disabled={!stale.length && !confirm}
          onClick={() => {
            if (!stale.length) {
              setConfirm(false);
              return;
            }
            if (!confirm) {
              setConfirm(true);
              return;
            }
            clearStaleTrends();
            setConfirm(false);
          }}
        >
          {confirm ? `Confirm clear ${stale.length}` : 'Clear old trends'}
        </button>
        {confirm && (
          <button type="button" className="btn btn-quiet" onClick={() => setConfirm(false)}>
            Cancel
          </button>
        )}
        <p>{confirm ? 'Hit, bust, and finished trends will be unfollowed. Upcoming and live follows stay.' : 'Settled and past trends can leave this list.'}</p>
      </div>
      <ul className="trend-monitor">
        {faces.map((face) => {
          const home = withCrest(face.homeTeam, catalog);
          const away = withCrest(face.awayTeam, catalog);
          const when = kickoffWhen(face.kickoff, today);
          const status = face.status === 'won' ? 'Hit' : face.status === 'bust' ? 'Bust' : face.status === 'open' ? 'Open' : '';
          const named = Boolean((home && away) || face.home || face.away);
          const title = home && away ? `${face.home} vs ${face.away}` : face.home || face.away || face.marketLabel || 'Trend';
          const detail = [named ? face.marketLabel : '', when, status].filter(Boolean).join(' · ');
          return (
            <li key={face.id}>
              <strong>
                {home && <Crest team={home} size={18} />}
                {away && <Crest team={away} size={18} />}
                {title}
              </strong>
              {detail && <span>{detail}</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
