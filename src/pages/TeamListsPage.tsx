import { useMemo, useState } from 'react';
import { Crest } from '../components/Crest';
import { CodeActions } from '../components/CodeActions';
import { bookGroups, bookingFailureMessage, type BookedGroup } from '../lib/bookFollow';
import { DESKS, type DeskId } from '../lib/engineSlips';
import { isPlayStoreBuild } from '../lib/storeBuild';
import { personalLegs, teamsOn } from '../lib/teamMarks';
import type { ListItem } from '../data/board';
import { useEngineBoard } from '../state/engine';
import { useProduct } from '../state/product';

/** Blacklist and Greenlight, under Slips. Search, sorted names, and undo. */
export function TeamListsPage() {
  const { lists, toggleList } = useProduct();
  const { state } = useEngineBoard();
  const play = isPlayStoreBuild();
  const [tab, setTab] = useState<'black' | 'green'>('black');
  const [query, setQuery] = useState('');
  const [undo, setUndo] = useState<ListItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [booked, setBooked] = useState<BookedGroup | null>(null);
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return teamsOn(lists, tab).filter((item) => !needle || item.name.toLowerCase().includes(needle));
  }, [lists, tab, query]);

  const remove = (item: ListItem) => {
    toggleList(item, item.list);
    setUndo(item);
  };
  const restore = () => {
    if (!undo) return;
    toggleList(undo, undo.list);
    setUndo(null);
  };
  const book = async () => {
    setBusy(true);
    setProblem('');
    try {
      const legs = personalLegs(state, lists);
      if (!legs.length) {
        setProblem('Nothing left to book. A blacklisted team is out, and a greenlit team still has to pass the odds rule.');
        setBooked(null);
        return;
      }
      const [next] = await bookGroups([{ id: 'personal', legs }]);
      setBooked(next || null);
      if (!next || !Object.values(next.books || {}).some((book) => book?.parts?.length)) {
        setProblem(next?.reason || 'No personal code came back.');
      }
    } catch (error) {
      setProblem(bookingFailureMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack team-lists">
      <div className="team-lists-tabs" role="tablist" aria-label="Team marks">
        <button type="button" role="tab" aria-selected={tab === 'black'} className={tab === 'black' ? 'is-on' : ''} onClick={() => setTab('black')}>Blacklist</button>
        <button type="button" role="tab" aria-selected={tab === 'green'} className={tab === 'green' ? 'is-on' : ''} onClick={() => setTab('green')}>Greenlight</button>
      </div>
      <input className="team-lists-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" aria-label="Search teams" />
      {rows.length === 0 && <p className="lede">{query ? 'No team matches that search.' : 'Nothing here yet. Double-tap a team on a slip leg.'}</p>}
      <ul className="team-lists-rows">
        {rows.map((item) => (
          <li key={`${item.list}:${item.id}`}>
            <Crest team={{ id: item.id, name: item.name, shortName: item.name, abbr: '', color: '#2a303c', crest: item.crest || undefined }} size={32} />
            <strong>{item.name}</strong>
            <button type="button" onClick={() => remove(item)}>Remove</button>
          </li>
        ))}
      </ul>
      {undo && (
        <p className="team-lists-undo">
          <span>{undo.name} removed</span>
          <button type="button" onClick={restore}>Undo</button>
        </p>
      )}
      {!play && (
        <section className="team-lists-book" aria-label="Personal code">
          <p>A personal code leaves blacklisted teams out and keeps a greenlit team only when it already qualifies. Shared codes stay as published.</p>
          <button type="button" className="btn" onClick={() => void book()} disabled={busy}>{busy ? 'Booking' : 'Book my code'}</button>
          {problem && <p className="lede">{problem}</p>}
          {booked && DESKS.map((desk) => {
            const book = booked.books?.[desk as DeskId];
            return book?.parts?.map((part) => <CodeActions key={`${desk}:${part.code}`} code={part.code} desk={desk} link={part.link} />);
          })}
        </section>
      )}
      {play && <p className="lede">Marks stay on this phone. Codes you copy are the shared ones.</p>}
    </div>
  );
}
