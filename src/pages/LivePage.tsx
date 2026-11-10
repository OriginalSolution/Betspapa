import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ErrorBanner } from '../components/Chrome';
import { EmptyState, MatchBoard, MatchSkeleton } from '../components/MatchBoard';
import { isLiveStatus } from '../lib/group';
import { useStore } from '../state/store';

export function LivePage() {
  const { matches, date, today, setDate, loading, ready, mode, restartDemo } = useStore();
  useEffect(() => {
    if (date !== today) setDate(today);
  }, [date, today, setDate]);

  const live = matches.filter((match) => isLiveStatus(match.status));
  const waiting = !ready || date !== today || (loading && matches.length === 0);

  return (
    <>
      <p className="page-lead">{waiting ? 'Checking in-play matches' : `${live.length} in play`}</p>
      <ErrorBanner />
      {waiting ? (
        <MatchSkeleton />
      ) : live.length === 0 ? (
        <EmptyState
          title="No live matches"
          body={mode === 'demo' ? 'The simulated clock has no match in play. Restart it and the evening board comes back.' : 'Nothing is in play for today.'}
          action={
            mode === 'demo' ? (
              <button type="button" className="btn" onClick={restartDemo}>
                Restart demo
              </button>
            ) : (
              <Link to="/" className="btn">
                Today
              </Link>
            )
          }
        />
      ) : (
        <MatchBoard matches={live} />
      )}
    </>
  );
}
