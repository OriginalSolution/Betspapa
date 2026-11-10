import { useMemo } from 'react';
import { CountryBadge } from '../components/CountryBadge';
import { MARKETS } from '../data/board';
import { useProduct } from '../state/product';
import { useStore } from '../state/store';

export function ListsPage() {
  const { lists, ledger, toggleList, clearList } = useProduct();
  const { matches } = useStore();
  const boardTeams = useMemo(() => {
    const teams = new Map<string, { id: string; shortName: string; abbr: string }>();
    for (const match of matches) {
      teams.set(match.home.id, match.home);
      teams.set(match.away.id, match.away);
    }
    return [...teams.values()].slice(0, 8);
  }, [matches]);
  const boardCompetitions = useMemo(() => {
    const competitions = new Map<string, { id: string; name: string; area: string; code: string }>();
    for (const match of matches) competitions.set(match.competition.id, match.competition);
    return [...competitions.values()].slice(0, 4);
  }, [matches]);
  const record = (scope: 'team' | 'competition' | 'market', id: string) => {
    const rows = ledger.filter((entry) => (scope === 'team' ? entry.teamId === id : scope === 'competition' ? entry.competitionId === id : entry.market === id));
    const won = rows.filter((entry) => entry.result === 'won').length;
    return { won, bust: rows.length - won };
  };
  return (
    <div className="stack">
      <p className="page-lead">Blacklist hides tips. Greenlist feeds suggestions. Settled results accumulate on the same teams, competitions, and markets.</p>
      {(['green', 'black'] as const).map((list) => {
        const rows = lists.filter((item) => item.list === list);
        return (
          <section key={list} className="stack-block">
            <h2>{list === 'green' ? 'Greenlist' : 'Blacklist'}</h2>
            {rows.length === 0 ? <p className="lede">Nothing here yet. Mark a team from a pick, or add one below.</p> : null}
            {rows.map((item) => {
              const stats = record(item.scope, item.id);
              return (
                <button key={`${item.list}-${item.scope}-${item.id}`} type="button" className="list-row" onClick={() => toggleList(item, list)}>
                  <span>
                    {item.name}
                    <small>
                      {item.scope} · {stats.won} won · {stats.bust} bust
                    </small>
                  </span>
                  <em>Remove</em>
                </button>
              );
            })}
            {rows.length > 0 && (
              <button type="button" className="btn btn-quiet btn-tiny" onClick={() => clearList(list)}>
                Clear {list === 'green' ? 'greenlist' : 'blacklist'}
              </button>
            )}
          </section>
        );
      })}
      <section className="stack-block">
        <h2>Add</h2>
        <div className="add-grid">
          {boardTeams.map((team) => (
            <span key={team.id}>
              <button type="button" onClick={() => toggleList({ scope: 'team', id: team.id, name: team.shortName }, 'green')}>
                Green {team.abbr}
              </button>
              <button type="button" onClick={() => toggleList({ scope: 'team', id: team.id, name: team.shortName }, 'black')}>
                Black {team.abbr}
              </button>
            </span>
          ))}
          {boardCompetitions.map((competition) => (
            <span key={competition.id}>
              <button type="button" onClick={() => toggleList({ scope: 'competition', id: competition.id, name: competition.name }, 'black')}>
                Hide <CountryBadge area={competition.area} />
              </button>
            </span>
          ))}
          {MARKETS.slice(0, 4).map((market) => (
            <span key={market.id}>
              <button type="button" onClick={() => toggleList({ scope: 'market', id: market.id, name: market.label }, 'green')}>
                Green {market.short}
              </button>
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
