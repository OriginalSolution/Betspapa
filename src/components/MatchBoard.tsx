import type { ReactNode } from 'react';
import type { Match } from '../types';
import { groupMatches } from '../lib/group';
import { CountryBadge } from './CountryBadge';
import { MatchRow } from './MatchRow';

export function MatchBoard({ matches }: { matches: Match[] }) {
  const groups = groupMatches(matches);
  return (
    <div className="board">
      {groups.map((group) => (
        <section key={group.competition.id} className="group" aria-labelledby={`comp-${group.competition.id}`}>
          <header className="comp-head">
            <CountryBadge area={group.competition.area} />
            <div className="comp-names">
              <h2 id={`comp-${group.competition.id}`}>{group.competition.name}</h2>
              <p>{group.competition.area}</p>
            </div>
            {group.liveCount > 0 && (
              <span className="live-count">
                <i />
                {group.liveCount} live
              </span>
            )}
          </header>
          <div>
            {group.matches.map((match) => (
              <MatchRow key={match.id} match={match} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function MatchSkeleton() {
  return (
    <div className="skeleton" aria-hidden="true">
      {Array.from({ length: 7 }, (_, index) => (
        <div key={index} className="skeleton-row" />
      ))}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      <p>{body}</p>
      {action}
    </div>
  );
}
