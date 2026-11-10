import { Link } from 'react-router-dom';
import { DateBar, ErrorBanner } from '../components/Chrome';
import { EmptyState, MatchBoard, MatchSkeleton } from '../components/MatchBoard';
import { isFollowed } from '../lib/group';
import { useStore } from '../state/store';

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
