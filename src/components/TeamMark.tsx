import { useRef, type PointerEvent, type ReactNode } from 'react';
import { createContext, useContext, useState } from 'react';
import { Crest } from './Crest';
import { useProduct } from '../state/product';
import { teamOnList, type TeamRef } from '../lib/teamMarks';

const OpenMark = createContext<(team: TeamRef) => void>(() => {});

export function useOpenTeamMark(): (team: TeamRef) => void {
  return useContext(OpenMark);
}

/** One card for the whole app. Double-tap a team on a slip leg to open it. */
export function TeamMarkProvider({ children }: { children: ReactNode }) {
  const [team, setTeam] = useState<TeamRef | null>(null);
  return (
    <OpenMark.Provider value={setTeam}>
      {children}
      {team && <TeamCard team={team} onClose={() => setTeam(null)} />}
    </OpenMark.Provider>
  );
}

function TeamCard({ team, onClose }: { team: TeamRef; onClose: () => void }) {
  const { lists, toggleList } = useProduct();
  const black = teamOnList(lists, 'black', team);
  const green = teamOnList(lists, 'green', team);
  const mark = (list: 'black' | 'green') => {
    toggleList({ scope: 'team', id: team.id, name: team.name, crest: team.crest || null }, list);
    onClose();
  };
  return (
    <div className="team-mark-dim" onClick={onClose}>
      <section className="team-mark-card" role="dialog" aria-label={team.name} onClick={(event) => event.stopPropagation()}>
        <div className="team-mark-who">
          <Crest team={{ id: team.id, name: team.name, shortName: team.name, abbr: '', color: '#2a303c', crest: team.crest || undefined }} size={48} />
          <div>
            <strong>{team.name}</strong>
            <span>{black ? 'Blacklisted' : green ? 'Greenlit' : 'Not marked'}</span>
          </div>
        </div>
        <div className="team-mark-actions">
          <button type="button" className={black ? 'is-on' : ''} onClick={() => mark('black')}>{black ? 'Remove blacklist' : 'Blacklist'}</button>
          <button type="button" className={green ? 'is-on' : ''} onClick={() => mark('green')}>{green ? 'Remove greenlight' : 'Greenlight'}</button>
        </div>
        <p>Blacklist never recommends the team. Greenlight includes it only inside the odds rule and the strategy.</p>
      </section>
    </div>
  );
}

/** Two taps on a crest or a name open the mark card. A single tap does nothing. */
export function TeamTap({ team, children }: { team: TeamRef; children: ReactNode }) {
  const open = useOpenTeamMark();
  const last = useRef(0);
  const tap = (event: PointerEvent) => {
    const now = Date.now();
    if (now - last.current < 350) {
      event.preventDefault();
      event.stopPropagation();
      last.current = 0;
      open(team);
      return;
    }
    last.current = now;
  };
  return (
    <span className="team-tap" onPointerUp={tap}>
      {children}
    </span>
  );
}
