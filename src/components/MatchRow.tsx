import { Link } from 'react-router-dom';
import { profile } from '../data/board';
import type { Match } from '../types';
import { cx, minuteLabel } from '../lib/format';
import { useStore } from '../state/store';
import { Crest } from './Crest';
import { IconStar } from './Icons';

export function MatchRow({ match }: { match: Match }) {
  const { follows, toggleMatch, flash } = useStore();
  const followed = follows.matches.includes(match.id);
  const homeFollow = follows.teams.some((team) => team.id === match.home.id);
  const awayFollow = follows.teams.some((team) => team.id === match.away.id);
  const live = match.status === 'live' || match.status === 'halftime';
  const flashing = flash.includes(match.id);
  const homeWin = match.status === 'finished' && (match.homeScore ?? 0) > (match.awayScore ?? 0);
  const awayWin = match.status === 'finished' && (match.awayScore ?? 0) > (match.homeScore ?? 0);
  const showScore = match.status !== 'scheduled' && match.status !== 'postponed';

  return (
    <article className={cx('match', `st-${match.status}`)}>
      <Link to={`/match/${match.id}`} className="match-main">
        <span className={cx('when', live && 'is-live', match.status === 'finished' && 'is-final', match.varReview && 'is-var')}>
          {match.varReview ? 'VAR' : minuteLabel(match)}
        </span>
        <span className="teams">
          <TeamLine name={match.home.shortName} team={match.home} score={showScore ? match.homeScore : null} win={homeWin} lose={awayWin && match.status === 'finished'} followed={homeFollow} flash={flashing} showSquad={match.feed !== 'sporty'} />
          <TeamLine name={match.away.shortName} team={match.away} score={showScore ? match.awayScore : null} win={awayWin} lose={homeWin && match.status === 'finished'} followed={awayFollow} flash={flashing} showSquad={match.feed !== 'sporty'} />
        </span>
      </Link>
      <button
        type="button"
        className={cx('star', followed && 'is-on')}
        aria-pressed={followed}
        aria-label={followed ? `Unfollow ${match.home.shortName} versus ${match.away.shortName}` : `Follow ${match.home.shortName} versus ${match.away.shortName}`}
        onClick={() => toggleMatch(match.id)}
      >
        <IconStar filled={followed} />
      </button>
    </article>
  );
}

function TeamLine({
  name,
  team,
  score,
  win,
  lose,
  followed,
  flash,
  showSquad,
}: {
  name: string;
  team: Match['home'];
  score: number | null;
  win: boolean;
  lose: boolean;
  followed: boolean;
  flash: boolean;
  showSquad: boolean;
}) {
  return (
    <span className="team">
      <Crest team={team} followed={followed} />
      <span className={cx('name', win && 'is-win', lose && 'is-lose')}>
        {name}
        {showSquad && profile(team.id).squad !== 'full' && <em className="squad-tag">{profile(team.id).squad === 'rotated' ? 'Rotated' : 'Weak'}</em>}
      </span>
      {score != null && <span className={cx('goals', win && 'is-win', lose && 'is-lose', flash && 'flash')}>{score}</span>}
    </span>
  );
}
