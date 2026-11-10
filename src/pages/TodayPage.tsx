import { useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, MatchBoard, MatchSkeleton } from '../components/MatchBoard';
import { DateBar, ErrorBanner, FilterChips } from '../components/Chrome';
import { applyFilter, type BoardFilter } from '../lib/group';
import { useStore } from '../state/store';

export function TodayPage() {
  const { matches, loading, ready, usingDemo, feedNote, permission } = useStore();
  const [filter, setFilter] = useState<BoardFilter>('all');
  const shown = applyFilter(matches, filter);
  const waiting = !ready || (loading && matches.length === 0);

  return (
    <>
      <DateBar />
      <FilterChips value={filter} onChange={setFilter} />
      {feedNote && (
        <div className="banner" role="status">
          <p>{feedNote}</p>
        </div>
      )}
      {usingDemo && permission === 'default' && (
        <div className="hint">
          <p>Star a live match, then allow alerts. A goal lands about 24 seconds after the clock starts.</p>
          <Link to="/settings">Alerts</Link>
        </div>
      )}
      <ErrorBanner />
      {waiting ? (
        <MatchSkeleton />
      ) : shown.length === 0 ? (
        <EmptyState title="No fixtures" body="Nothing on this day matches the filter. Try another day or show all matches." />
      ) : (
        <MatchBoard matches={shown} />
      )}
    </>
  );
}
