import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DateBar, ErrorBanner } from '../components/Chrome';
import { EmptyState, MatchBoard, MatchSkeleton } from '../components/MatchBoard';
import { staleTrendIds } from '../lib/alerts';
import { isFollowed } from '../lib/group';
import { useProduct } from '../state/product';
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
  const { matches } = useStore();
  const { picks, trendFollows, clearStaleTrends } = useProduct();
  const [confirm, setConfirm] = useState(false);
  const followed = picks.filter((pick) => trendFollows.includes(pick.id));
  const other = trendFollows.filter((id) => !picks.some((pick) => pick.id === id));
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
        {followed.map((pick) => (
          <li key={pick.id}>
            <strong>{pick.label}</strong>
            <span>{pick.status === 'won' ? 'Hit' : pick.status === 'bust' ? 'Bust' : 'Open'}</span>
          </li>
        ))}
        {other.map((id) => (
          <li key={id}>
            <strong>{id}</strong>
            <span>Another day</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
