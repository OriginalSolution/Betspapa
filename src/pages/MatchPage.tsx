import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { CountryBadge } from '../components/CountryBadge';
import { Crest } from '../components/Crest';
import { IconBall, IconCard } from '../components/Icons';
import { BookMark } from '../components/BookMark';
import { bookingForPick, DESK_NAMES, readEngineCache, type BookingChip } from '../lib/engineSlips';
import { profile, squadLabel, marketInfo, type MarketId } from '../data/board';
import { fetchLiveMatch } from '../data/remote';
import { FormPips } from '../components/PickCard';
import { cx, minuteLabel, scoreDash, statusLine, teamFollow } from '../lib/format';
import type { EventType, Match, MatchEvent } from '../types';
import { useStore } from '../state/store';
import { useProduct } from '../state/product';

const later: Record<EventType, number> = { kickoff: 0, yellow: 1, goal: 1, red: 1, penalty: 1, var: 2, ht: 3, ft: 4 };

export function MatchPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const focus = params.get('trend');
  const { findMatch, mode, setActiveMatch, follows, toggleMatch, toggleTeam } = useStore();
  const local = findMatch(id);
  const [remote, setRemote] = useState<Match | null>(null);

  useEffect(() => {
    setActiveMatch(id);
    return () => setActiveMatch(null);
  }, [id, setActiveMatch]);

  useEffect(() => {
    if (local || mode !== 'live') return;
    let cancelled = false;
    fetchLiveMatch(id).then((match) => {
      if (!cancelled) setRemote(match);
    });
    return () => {
      cancelled = true;
    };
  }, [id, local, mode]);

  const match = local ?? remote;
  if (!match) {
    return (
      <div className="empty">
        <h2>Match unavailable</h2>
        <p>This fixture is not on the current board.</p>
        <Link to="/" className="btn">
          Back to today
        </Link>
      </div>
    );
  }

  const followed = follows.matches.includes(match.id);
  const homeOn = follows.teams.some((team) => team.id === match.home.id);
  const awayOn = follows.teams.some((team) => team.id === match.away.id);
  const showHt =
    match.htHome != null &&
    match.htAway != null &&
    (match.status === 'finished' || (match.status === 'live' && (match.minute ?? 0) >= 45));
  const timeline = [...match.events].sort((a, b) => (b.minute ?? -1) - (a.minute ?? -1) || later[b.type] - later[a.type]);

  return (
    <article className="detail">
      <p className="detail-comp">
        <CountryBadge area={match.competition.area} />
        {match.competition.name}
      </p>
      {match.venue && <p className="venue">{match.venue}</p>}
      <section className="scoreboard" style={{ ['--home' as string]: match.home.color, ['--away' as string]: match.away.color }}>
        <div className="scoreline">
          <div className="side">
            <Crest team={match.home} size={56} followed={homeOn} />
            <span className="side-name">{match.home.shortName}</span>
            {match.feed !== 'sporty' && <FormPips form={profile(match.home.id).form} />}
            {match.feed !== 'sporty' && <span className={cx('squad', profile(match.home.id).squad !== 'full' && 'squad-alert')}>{squadLabel(profile(match.home.id).squad)}</span>}
          </div>
          <div className="result">
            {match.homeScore == null ? (
              <span className="kickoff-time">{minuteLabel(match)}</span>
            ) : (
              <p className="big-score">
                <span>{match.homeScore}</span>
                <span className="big-dash">–</span>
                <span>{match.awayScore}</span>
              </p>
            )}
            <p className={cx('status-pill', (match.status === 'live' || match.status === 'halftime') && 'is-live')}>
              {(match.status === 'live' || match.status === 'halftime') && <i />}
              {statusLine(match)}
            </p>
            {match.varReview && <p className="var-banner">VAR · {match.varReview.player} is under review</p>}
            {showHt && <p className="ht-line">HT {scoreDash(match.htHome, match.htAway)}</p>}
          </div>
          <div className="side">
            <Crest team={match.away} size={56} followed={awayOn} />
            <span className="side-name">{match.away.shortName}</span>
            {match.feed !== 'sporty' && <FormPips form={profile(match.away.id).form} />}
            {match.feed !== 'sporty' && <span className={cx('squad', profile(match.away.id).squad !== 'full' && 'squad-alert')}>{squadLabel(profile(match.away.id).squad)}</span>}
          </div>
        </div>
        <div className="actions">
          <button type="button" className={cx('btn', followed && 'btn-quiet')} onClick={() => toggleMatch(match.id)}>
            {followed ? 'Following match' : 'Follow match'}
          </button>
          <button type="button" className={cx('btn', 'btn-quiet', homeOn && 'is-on')} onClick={() => toggleTeam(teamFollow(match.home))}>
            {homeOn ? `Following ${match.home.shortName}` : `Follow ${match.home.shortName}`}
          </button>
          <button type="button" className={cx('btn', 'btn-quiet', awayOn && 'is-on')} onClick={() => toggleTeam(teamFollow(match.away))}>
            {awayOn ? `Following ${match.away.shortName}` : `Follow ${match.away.shortName}`}
          </button>
        </div>
      </section>
      <HitMarkets matchId={match.id} focus={focus} />
      {(match.status === 'live' || match.status === 'halftime' || match.status === 'finished') && <PitchLine match={match} />}
      <section className="timeline-wrap">
        <h2>Events</h2>
        {timeline.length === 0 ? (
          <p className="lede">Events show up once the match kicks off.</p>
        ) : (
          <ol className="timeline">
            {timeline.map((event) => (
              <EventRow key={event.id} event={event} match={match} />
            ))}
          </ol>
        )}
      </section>
    </article>
  );
}

function marketLabel(id: string): string {
  try {
    return marketInfo(id as MarketId).label;
  } catch {
    return id;
  }
}

function HitMarkets({ matchId, focus }: { matchId: string; focus: string | null }) {
  const { picks } = useProduct();
  const related = picks.filter((pick) => pick.matchId === matchId && (pick.status === 'won' || pick.id === focus));
  const focused = focus && !related.some((pick) => pick.id === focus) ? focus : '';
  if (!related.length && !focused) return null;
  const engine = readEngineCache();
  const booked: BookingChip[] = [];
  const seen = new Set<string>();
  for (const pick of related) {
    const chip = bookingForPick(engine, pick.matchId, pick.market);
    if (!chip || seen.has(`${chip.bookId}:${chip.code}`)) continue;
    seen.add(`${chip.bookId}:${chip.code}`);
    booked.push(chip);
  }
  return (
    <section className="hit-markets">
      <h2>Trend</h2>
      {related.map((pick) => (
        <p key={pick.id} className={cx('hit-market', pick.id === focus && 'is-focus', pick.status === 'won' && 'is-hit')}>
          <strong>{pick.status === 'won' ? 'Hit' : 'Market'} · {pick.marketLabel}</strong>
          <span>{pick.label}</span>
        </p>
      ))}
      {focused && (
        <p className="hit-market is-focus is-hit">
          <strong>Hit · {marketLabel(focused.slice(focused.lastIndexOf(':') + 1))}</strong>
        </p>
      )}
      {booked.map((code) => (
        <p key={`${code.bookId}:${code.code}`} className="booking-chip">
          <BookMark id={code.bookId} />
          <span>{DESK_NAMES[code.bookId]}</span>
          <b>{code.code}</b>
        </p>
      ))}
    </section>
  );
}

function PitchLine({ match }: { match: Match }) {
  const goals = match.events.filter((event) => event.type === 'goal' && event.minute != null);
  const at = match.status === 'finished' ? 90 : Math.max(0, Math.min(90, match.minute ?? 0));
  return (
    <div className="pitch" aria-hidden="true">
      <div className="pitch-track">
        <i style={{ width: `${(at / 90) * 100}%` }} />
        {goals.map((event) => {
          const side = event.teamId === match.away.id ? match.away : match.home;
          const minute = Math.max(0, Math.min(90, event.minute ?? 0));
          return (
            <span key={event.id} className="pitch-goal" style={{ left: `${(minute / 90) * 100}%` }}>
              <b>
                {minute}′ {side.abbr}
              </b>
            </span>
          );
        })}
      </div>
      <div className="pitch-scale">
        <span>0′</span>
        <span>90′</span>
      </div>
    </div>
  );
}

function EventRow({ event, match }: { event: MatchEvent; match: Match }) {
  if (event.type === 'var') {
    return (
      <li className="event event-marker">
        <span>VAR · {event.player} under review</span>
      </li>
    );
  }
  if (event.type === 'kickoff' || event.type === 'ht' || event.type === 'ft') {
    const label = event.type === 'kickoff' ? 'Kick-off' : event.type === 'ht' ? `Half-time ${event.homeScore ?? 0}–${event.awayScore ?? 0}` : `Full-time ${event.homeScore ?? 0}–${event.awayScore ?? 0}`;
    return (
      <li className="event event-marker">
        <span>{label}</span>
      </li>
    );
  }
  const team = event.teamId === match.home.id ? match.home : event.teamId === match.away.id ? match.away : null;
  const note = event.type === 'penalty' || event.detail === 'Penalty' ? ' (pen)' : event.detail === 'Own goal' ? ' (og)' : '';
  return (
    <li className={cx('event', `ev-${event.type}`)}>
      <span className="ev-min">{event.minute ?? '–'}′</span>
      <span className="ev-icon" aria-hidden="true">
        {event.type === 'goal' || event.type === 'penalty' ? <IconBall /> : <IconCard tone={event.type === 'red' ? 'red' : 'yellow'} />}
      </span>
      <span className="ev-copy">
        <strong>
          {event.player ?? (event.type === 'goal' ? 'Goal' : 'Card')}
          {note}
        </strong>
        {team && <em>{team.shortName}</em>}
      </span>
      {event.type === 'goal' && event.homeScore != null ? (
        <b className="ev-score">
          {event.homeScore}–{event.awayScore}
        </b>
      ) : (
        <span />
      )}
    </li>
  );
}
