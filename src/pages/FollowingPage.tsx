import { useEffect, useMemo, useState } from 'react';
import { CodeStrip } from '../components/CodeStrip';
import { bookGroups, legsForTier, tierFallback, type BookedGroup, type BookLeg } from '../lib/bookFollow';
import { groupFollowMatches, type FollowRow } from '../lib/followCards';
import { marketCodeLabel, partsFromBook, type CodeTier } from '../lib/pickCodes';
import { Link } from 'react-router-dom';
import { DateBar, ErrorBanner } from '../components/Chrome';
import { Crest } from '../components/Crest';
import { EmptyState, MatchBoard, MatchSkeleton } from '../components/MatchBoard';
import { followIsStale } from '../lib/alerts';
import { catalogCrest, loadCrestCatalog, type CrestCatalog } from '../lib/crestCatalog';
import { DESK_NAMES, marketLabel, showOdds, type DeskId } from '../lib/engineSlips';
import { cx, kickoffWhen, scoreDash, statusLine } from '../lib/format';
import { isFollowed } from '../lib/group';
import { useEngineBoard } from '../state/engine';
import { faceForFollow, factFromFace, splitFollowId, type TrendFact } from '../lib/trendFace';
import type { Team } from '../types';
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

function SampleRing({ sample }: { sample: string }) {
  const [hits, total] = sample.split('/').map(Number);
  const rate = total ? hits / total : 0;
  const radius = 16;
  const turn = 2 * Math.PI * radius;
  const dash = turn * Math.min(1, Math.max(0, rate));
  return (
    <span className={cx('hit-ring', rate >= 0.9 ? 'is-hot' : 'is-warm')} aria-label={`${sample} hit rate`}>
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <circle cx="20" cy="20" r={radius} className="hit-track" />
        <circle cx="20" cy="20" r={radius} className="hit-value" strokeDasharray={`${dash} ${turn - dash}`} />
      </svg>
      <b>{sample}</b>
    </span>
  );
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
  const { state: engine } = useEngineBoard();
  const [facts, setFacts] = useState<Record<string, TrendFact>>(() => readTrendFacts());
  const [catalog, setCatalog] = useState<CrestCatalog>(emptyCatalog);
  useEffect(() => {
    void loadCrestCatalog().then(setCatalog);
  }, []);
  const known = matches;
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
  const [desk, setDesk] = useState<DeskId>('sportybet');
  const [tier, setTier] = useState<CodeTier>('80');
  const [focusMarket, setFocusMarket] = useState<string | null>(null);
  const [booked, setBooked] = useState<BookedGroup[]>([]);
  const sourceLegs = useMemo(() => {
    const legs: BookLeg[] = [];
    for (const face of faces) {
      const parsed = splitFollowId(face.id);
      if (!parsed) continue;
      const pick = picks.find((item) => item.id === face.id);
      const engineLeg = [...(engine?.tiers || []), ...(engine?.trends || []), ...(engine?.master ? [engine.master] : [])]
        .flatMap((slip) => slip.legs)
        .find((leg) => leg.eventId === parsed.matchId && leg.market === parsed.market);
      const odds = Number(pick?.odds ?? engineLeg?.odds);
      const occurrence = engineLeg?.occurrence;
      const rate = typeof occurrence === 'number' ? (occurrence > 1 ? occurrence / 100 : occurrence) : pick?.rate;
      if (!face.home || !face.away || !face.kickoff) continue;
      if (face.status === 'won' || face.status === 'bust') continue;
      legs.push({
        eventId: parsed.matchId,
        market: parsed.market,
        odds,
        kickoff: face.kickoff,
        match: `${face.home} vs ${face.away}`,
        rate: typeof rate === 'number' ? rate : 0.8,
        status: face.status,
      });
    }
    return legs;
  }, [faces, picks, engine]);
  const stale = trendFollows.filter((id) => followIsStale(id, picks, matches, Date.now(), faces.find((face) => face.id === id)));
  const booking = useMemo(() => tierFallback(sourceLegs, tier), [sourceLegs, tier]);
  const openLegs = booking.legs;
  const markets = useMemo(() => [...new Set(openLegs.map((leg) => leg.market))], [openLegs]);
  const activeMarket = focusMarket && markets.includes(focusMarket) ? focusMarket : null;
  const requestKey = useMemo(
    () =>
      JSON.stringify(
        [{ id: 'all', legs: openLegs }, ...markets.map((id) => ({ id, legs: legsForTier(sourceLegs, booking.tier, id) }))].map((group) => ({
          id: group.id,
          legs: group.legs.map((leg) => `${leg.eventId}:${leg.market}:${leg.odds}`),
        })),
      ),
    [openLegs, markets, sourceLegs, booking.tier],
  );
  useEffect(() => {
    const groups = JSON.parse(requestKey) as Array<{ id: string; legs: string[] }>;
    const payload = groups
      .map((group) => ({
        id: group.id,
        legs: (group.id === 'all' ? openLegs : legsForTier(sourceLegs, booking.tier, group.id)).filter((leg) =>
          group.legs.includes(`${leg.eventId}:${leg.market}:${leg.odds}`),
        ),
      }))
      .filter((group) => group.legs.length);
    if (!payload.length) {
      setBooked([]);
      return;
    }
    let stop = false;
    const timer = window.setTimeout(() => {
      void bookGroups(payload)
        .then((rows) => {
          if (!stop) setBooked(rows);
        })
        .catch(() => {
          if (!stop) setBooked([]);
        });
    }, 300);
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
  }, [requestKey, openLegs, sourceLegs, booking.tier]);
  const chosen = booked.find((group) => group.id === (activeMarket || 'all'));
  const chosenParts = partsFromBook(chosen?.books?.[desk], chosen?.bookedAt || null);
  const emptyNote = chosenParts.parts.length ? '' : chosen?.reason || booking.note;
  const cards = useMemo(() => {
    const rows: FollowRow[] = [];
    for (const face of faces) {
      const parsed = splitFollowId(face.id);
      if (!parsed || !face.home || !face.away || face.status === 'won' || face.status === 'bust') continue;
      if (activeMarket && parsed.market !== activeMarket) continue;
      const match = known.find((item) => item.id === parsed.matchId);
      const live = match?.status === 'live' || match?.status === 'halftime';
      const kick = Date.parse(face.kickoff);
      if (Number.isFinite(kick) && kick < Date.now() && !live) continue;
      const engineLeg = [...(engine?.tiers || []), ...(engine?.trends || []), ...(engine?.master ? [engine.master] : [])]
        .flatMap((slip) => slip.legs)
        .find((leg) => leg.eventId === parsed.matchId && leg.market === parsed.market);
      const odds = Number(picks.find((item) => item.id === face.id)?.odds ?? engineLeg?.odds);
      rows.push({
        id: face.id,
        eventId: parsed.matchId,
        market: parsed.market,
        marketLabel: face.marketLabel || marketLabel(parsed.market),
        odds: Number.isFinite(odds) ? odds : null,
        sample: engineLeg?.sample || '',
        home: face.home,
        away: face.away,
        kickoff: face.kickoff,
      });
    }
    return groupFollowMatches(rows);
  }, [faces, known, activeMarket, engine, picks]);
  const followCount = (activeMarket ? openLegs.filter((leg) => leg.market === activeMarket) : openLegs).length;
  const codeLine = chosenParts.parts.length
    ? `${chosenParts.parts.length === 1 ? 'One' : String(chosenParts.parts.length)} ${DESK_NAMES[desk]} ${chosenParts.parts.length === 1 ? 'code' : 'codes'} for your ${followCount} open ${followCount === 1 ? 'follow' : 'follows'}.`
    : '';
  if (!trendFollows.length) return null;
  return (
    <section className="panel follow-trends">
      <h2>Followed trends</h2>
      <CodeStrip
        desk={desk}
        tier={tier}
        title={`${DESK_NAMES[desk]} code`}
        parts={chosenParts.parts}
        bookedAt={chosenParts.bookedAt}
        line={codeLine}
        note={emptyNote}
        onDesk={setDesk}
        onTier={(next) => {
          setTier(next);
          setFocusMarket(null);
        }}
      />
      {markets.length > 0 && (
        <div className="market-filters" role="tablist" aria-label="Followed markets">
          <button type="button" className={cx('market-filter', !activeMarket && 'is-on')} onClick={() => setFocusMarket(null)}>
            All
            <small>{partsFromBook(booked.find((group) => group.id === 'all')?.books?.[desk], null).parts[0]?.code || ''}</small>
          </button>
          {markets.map((id) => (
            <button key={id} type="button" className={cx('market-filter', activeMarket === id && 'is-on')} onClick={() => setFocusMarket(id)}>
              {marketCodeLabel(id)}
              <small>{partsFromBook(booked.find((group) => group.id === id)?.books?.[desk], null).parts[0]?.code || ''}</small>
            </button>
          ))}
        </div>
      )}
      <ul className="follow-cards">
        {cards.map((card) => {
          const lead = faces.find((face) => splitFollowId(face.id)?.matchId === card.eventId);
          const home = withCrest(lead?.homeTeam || null, catalog);
          const away = withCrest(lead?.awayTeam || null, catalog);
          const match = known.find((item) => item.id === card.eventId);
          const live = match?.status === 'live' || match?.status === 'halftime';
          const score = live ? scoreDash(match?.homeScore ?? null, match?.awayScore ?? null) : '';
          const when = live && match ? [score, statusLine(match)].filter(Boolean).join(' · ') : kickoffWhen(card.kickoff, today);
          return (
            <li key={card.eventId} className="follow-card">
              <header>
                <span className="follow-crests">
                  {home && <Crest team={home} size={28} />}
                  {away && <Crest team={away} size={28} />}
                </span>
                <div>
                  <strong>
                    {card.home} vs {card.away}
                  </strong>
                  {when && <span>{when}</span>}
                </div>
              </header>
              {card.chips.map((chip) => {
                const price = showOdds(chip.odds);
                return (
                  <div className="follow-chip" key={chip.id}>
                    {chip.sample && <SampleRing sample={chip.sample} />}
                    <span>{chip.marketLabel}</span>
                    {price && <b>{price}</b>}
                  </div>
                );
              })}
            </li>
          );
        })}
      </ul>
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
            clearStaleTrends(stale);
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
    </section>
  );
}
