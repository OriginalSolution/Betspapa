import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { bestTrendChip, trendChipText } from '../lib/matchPicks';
import { cx, formatTime, longDay, minuteLabel, weekdayChip } from '../lib/format';
import { byLeague, matchCountLabel, minuteProgress, partitionFollowed, weekDays } from '../lib/todayBoard';
import type { EngineState } from '../lib/engineSlips';
import type { Match } from '../types';
import { useStore } from '../state/store';
import { CountryBadge } from './CountryBadge';
import { Crest } from './Crest';
import { IconStar } from './Icons';

export type TodaySort = 'kickoff' | 'league';

export function WeekStrip() {
  const { date, today, setDate } = useStore();
  const scroller = useRef<HTMLDivElement>(null);
  const days = weekDays(today, date);
  useEffect(() => {
    const parent = scroller.current;
    const selected = parent?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!parent || !selected) return;
    parent.scrollLeft = selected.offsetLeft - parent.clientWidth / 2 + selected.clientWidth / 2;
  }, [date, today]);

  return (
    <div className="week-wrap">
      <div className="week-strip" ref={scroller} role="listbox" aria-label="Match day">
        {days.map((day) => {
          const chip = weekdayChip(day);
          const selected = day === date;
          return (
            <button
              key={day}
              type="button"
              role="option"
              className={cx('week-day', selected && 'is-on')}
              aria-selected={selected}
              aria-label={day === today ? `Today, ${longDay(day)}` : longDay(day)}
              onClick={() => setDate(day)}
            >
              <small>{chip.weekday}</small>
              <strong>{chip.day}</strong>
            </button>
          );
        })}
      </div>
      {date !== today && (
        <button type="button" className="back-today" onClick={() => setDate(today)}>
          ‹ Back to Today
        </button>
      )}
    </div>
  );
}

export function TodaySortBar({ value, onChange }: { value: TodaySort; onChange: (sort: TodaySort) => void }) {
  return (
    <div className="sort-toggle" role="group" aria-label="Sort fixtures">
      <button type="button" className={cx(value === 'kickoff' && 'is-on')} aria-pressed={value === 'kickoff'} onClick={() => onChange('kickoff')}>
        Kick-off
      </button>
      <button type="button" className={cx(value === 'league' && 'is-on')} aria-pressed={value === 'league'} onClick={() => onChange('league')}>
        League
      </button>
    </div>
  );
}

export function TodayBoard({ matches, sort, engine }: { matches: Match[]; sort: TodaySort; engine: EngineState | null }) {
  const { follows } = useStore();
  const { followed, rest } = partitionFollowed(matches, follows);
  const listed = sort === 'league' ? byLeague(rest) : rest;
  return (
    <div className="today-board">
      {followed.length > 0 && (
        <section aria-label="Followed">
          <header className="board-section">
            <h2>Followed</h2>
            <span>{matchCountLabel(followed.length)}</span>
          </header>
          {followed.map((match) => (
            <FixtureCard key={match.id} match={match} engine={engine} pinned />
          ))}
        </section>
      )}
      {listed.length > 0 && (
        <section aria-label={sort === 'league' ? 'By league' : 'By kick-off'}>
          <header className="board-section">
            <h2>{sort === 'league' ? 'By league' : 'By kick-off'}</h2>
            <span>{sort === 'league' ? 'Live competitions first' : 'Live first, then today’s times'}</span>
          </header>
          {listed.map((match) => (
            <FixtureCard key={match.id} match={match} engine={engine} />
          ))}
        </section>
      )}
    </div>
  );
}

function FixtureCard({ match, engine, pinned = false }: { match: Match; engine: EngineState | null; pinned?: boolean }) {
  const { follows, toggleMatch } = useStore();
  const followed = follows.matches.includes(match.id);
  const homeFollow = follows.teams.some((team) => team.id === match.home.id);
  const awayFollow = follows.teams.some((team) => team.id === match.away.id);
  const live = match.status === 'live' || match.status === 'halftime';
  const showScore = match.status !== 'scheduled' && match.status !== 'postponed';
  const chip = bestTrendChip(engine, match);
  const names = `${match.home.shortName} versus ${match.away.shortName}`;

  return (
    <article className={cx('fixture-card', live && 'is-live', (pinned || followed) && 'is-followed')}>
      <Link to={`/match/${match.id}`} className="fixture-link">
        <header className="fixture-league">
          <CountryBadge area={match.competition.area} />
          <span className="fixture-comp">{match.competition.name}</span>
        </header>
        <div className="fixture-teams">
          <Side team={match.home} followed={homeFollow} />
          <Center match={match} showScore={showScore} />
          <Side team={match.away} followed={awayFollow} />
        </div>
        {chip && <p className="trend-chip">{trendChipText(chip)}</p>}
      </Link>
      <button
        type="button"
        className={cx('star', 'fixture-star', followed && 'is-on')}
        aria-pressed={followed}
        aria-label={followed ? `Unfollow ${names}` : `Follow ${names}`}
        onClick={() => toggleMatch(match.id)}
      >
        <IconStar filled={followed} />
      </button>
    </article>
  );
}

function Side({ team, followed }: { team: Match['home']; followed: boolean }) {
  return (
    <span className="fixture-side">
      <Crest team={team} size={56} followed={followed} />
      <strong>{team.shortName}</strong>
    </span>
  );
}

function Center({ match, showScore }: { match: Match; showScore: boolean }) {
  if (!showScore) {
    return (
      <span className="fixture-mid">
        <span className="fixture-kick">{match.status === 'postponed' ? 'PP' : formatTime(match.utcDate)}</span>
        <span className="fixture-sub">{match.status === 'postponed' ? 'Postponed' : match.venue ? `Kick-off · ${match.venue}` : 'Kick-off'}</span>
      </span>
    );
  }
  const progress = minuteProgress(match.status, match.minute);
  return (
    <span className="fixture-mid">
      <span className="fixture-score">
        {match.homeScore ?? 0} - {match.awayScore ?? 0}
      </span>
      {progress != null ? <MinuteRing match={match} progress={progress} /> : <span className="fixture-sub">FT</span>}
    </span>
  );
}

function MinuteRing({ match, progress }: { match: Match; progress: number }) {
  const radius = 15;
  const turn = 2 * Math.PI * radius;
  const drawn = turn * progress;
  const label = match.varReview ? 'VAR' : minuteLabel(match);
  return (
    <span className="minute-ring">
      <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
        <circle cx="20" cy="20" r={radius} className="ring-track" />
        <circle
          cx="20"
          cy="20"
          r={radius}
          className="ring-value"
          strokeDasharray={`${drawn} ${turn}`}
          transform="rotate(-90 20 20)"
        />
        <circle cx="20" cy="20" r="3.2" className="ring-dot" />
      </svg>
      <span className={cx('ring-minute', match.varReview && 'is-var')}>{label}</span>
    </span>
  );
}
