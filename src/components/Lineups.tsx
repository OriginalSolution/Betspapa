import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { changeLabel, fetchLineups, type Lineup } from '../lib/lineups';

const LineupContext = createContext<Lineup[]>([]);

export function LineupProvider({ children }: { children: ReactNode }) {
  const [rows, setRows] = useState<Lineup[]>([]);
  useEffect(() => {
    let stop = false;
    const pull = () => {
      void fetchLineups().then((next) => {
        if (!stop) setRows(next);
      }).catch(() => {
        /* the board still shows */
      });
    };
    pull();
    const timer = window.setInterval(pull, 60_000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, []);
  return <LineupContext.Provider value={rows}>{children}</LineupContext.Provider>;
}

export function useLineupList(): Lineup[] {
  return useContext(LineupContext);
}

export function useLineup(eventId: string): Lineup | null {
  const rows = useContext(LineupContext);
  return useMemo(() => rows.find((row) => row.eventId === eventId) || null, [rows, eventId]);
}

export function LineupStrip({ lineup }: { lineup: Lineup }) {
  return (
    <Link to={`/match/${lineup.eventId}`} className="xi-strip">
      <span>
        <strong>{changeLabel(lineup.homeChanges, lineup.home)}</strong>
        <small>{lineup.awayChanges == null ? lineup.away : `${lineup.awayChanges} changes · vs last match`}</small>
      </span>
      <em>View</em>
    </Link>
  );
}

export function LineupXI({ lineup, side }: { lineup: Lineup; side: 'home' | 'away' }) {
  const xi = side === 'home' ? lineup.homeXi : lineup.awayXi;
  const incoming = new Set(side === 'home' ? lineup.homeIn : lineup.awayIn);
  const dropped = side === 'home' ? lineup.homeDropped : lineup.awayDropped;
  const changes = side === 'home' ? lineup.homeChanges : lineup.awayChanges;
  const name = side === 'home' ? lineup.home : lineup.away;
  if (!xi.length) return null;
  return (
    <section className="xi-card" aria-label={`${name} starting XI`}>
      <header>
        <strong>{changes == null ? 'Lineup in' : `${changes} ${changes === 1 ? 'change' : 'changes'}`}</strong>
        <span>IN = new since last game</span>
      </header>
      <ol>
        {xi.map((player) => (
          <li key={player.id}>
            <b>{player.pos || '—'}</b>
            <span>{player.name}</span>
            {incoming.has(player.name) && <em>IN</em>}
          </li>
        ))}
      </ol>
      {dropped.length > 0 && (
        <div className="xi-dropped">
          <p>Dropped · {dropped.length} {dropped.length === 1 ? 'player' : 'players'}</p>
          <div>
            {dropped.map((player) => <span key={player}>{player}</span>)}
          </div>
        </div>
      )}
    </section>
  );
}
