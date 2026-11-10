import { MARKETS } from '../data/board';
import { competitions, teams } from '../data/catalog';
import { useProduct } from '../state/product';

export function ListsPage() {
  const { lists, ledger, toggleList, clearList } = useProduct();
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
          {teams.slice(0, 8).map((team) => (
            <span key={team.id}>
              <button type="button" onClick={() => toggleList({ scope: 'team', id: team.id, name: team.shortName }, 'green')}>
                Green {team.abbr}
              </button>
              <button type="button" onClick={() => toggleList({ scope: 'team', id: team.id, name: team.shortName }, 'black')}>
                Black {team.abbr}
              </button>
            </span>
          ))}
          {competitions.slice(0, 4).map((competition) => (
            <span key={competition.id}>
              <button type="button" onClick={() => toggleList({ scope: 'competition', id: competition.id, name: competition.name }, 'black')}>
                Hide {competition.code}
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
