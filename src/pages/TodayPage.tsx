import { useState } from 'react';
import { EmptyState, MatchBoard, MatchSkeleton } from '../components/MatchBoard';
import { DateBar, ErrorBanner, FilterChips } from '../components/Chrome';
import { applyFilter, type BoardFilter } from '../lib/group';
import { useStore } from '../state/store';

export function TodayPage() {
  const { matches, loading, ready, feedNote, refresh } = useStore();
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
          title={feedNote ? 'Fixtures unavailable' : 'No fixtures'}
          body={feedNote ?? 'Nothing on this day matches the filter. Try another day or show all matches.'}
          action={
            feedNote ? (
              <button type="button" className="btn" onClick={refresh}>
                Retry
              </button>
            ) : undefined
          }
        />
      ) : (
        <MatchBoard matches={shown} />
      )}
    </>
  );
}
