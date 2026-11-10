import { useMemo, useState } from 'react';
import { MARKETS, type MarketId, type PickView } from '../data/board';
import { PickCard } from '../components/PickCard';
import { useProduct } from '../state/product';

type Sort = 'asc' | 'desc';

const groups = [
  { id: 'elite', title: 'Elite', detail: 'Opponent record pushes confidence above 90%', test: (pick: PickView) => pick.confidence > 0.9 },
  { id: 'strong', title: 'Strong', detail: '85–90% after the opponent check', test: (pick: PickView) => pick.confidence > 0.85 && pick.confidence <= 0.9 },
  { id: 'qualified', title: 'Qualified', detail: 'Still above 80% once the opponent is included', test: (pick: PickView) => pick.confidence > 0.8 && pick.confidence <= 0.85 },
];

export function PicksPage() {
  const { visiblePicks, suggestions, hiddenCount } = useProduct();
  const [market, setMarket] = useState<MarketId | 'all'>('all');
  const [sort, setSort] = useState<Sort>('asc');
  const [showSoft, setShowSoft] = useState(true);
  const tipped = visiblePicks.filter((pick) => pick.bookmarked && !pick.softened && (market === 'all' || pick.market === market));
  const soft = visiblePicks.filter((pick) => pick.softened && (market === 'all' || pick.market === market));
  const ordered = useMemo(() => [...tipped].sort((a, b) => (sort === 'asc' ? a.odds - b.odds : b.odds - a.odds)), [tipped, sort]);

  return (
    <div className="stack">
      <p className="page-lead">
        Tips are prices that imply more than 80%. Odds sort low to high or high to low. Qualifying tips are booked on Slips.
      </p>
      <div className="chips" role="tablist" aria-label="Market">
        <button type="button" className={market === 'all' ? 'chip is-on' : 'chip'} onClick={() => setMarket('all')}>
          All markets
        </button>
        {MARKETS.filter((item) => visiblePicks.some((pick) => pick.market === item.id)).map((item) => (
          <button key={item.id} type="button" className={market === item.id ? 'chip is-on' : 'chip'} onClick={() => setMarket(item.id)}>
            {item.short}
          </button>
        ))}
      </div>
      <div className="toolbar">
        <button type="button" className="btn btn-quiet btn-tiny" onClick={() => setSort((current) => (current === 'asc' ? 'desc' : 'asc'))}>
          Odds {sort === 'asc' ? 'low to high' : 'high to low'}
        </button>
        <button type="button" className="btn btn-quiet btn-tiny" onClick={() => setShowSoft((current) => !current)}>
          {showSoft ? 'Hide' : 'Show'} softened ({soft.length})
        </button>
        {hiddenCount > 0 && <span className="muted">{hiddenCount} blacklisted</span>}
      </div>
      {suggestions.length > 0 && (
        <section className="stack-block">
          <h2>Suggested for you</h2>
          <p className="lede">Similar open tips from the markets and records you have already used.</p>
          {suggestions.map((pick) => (
            <PickCard key={pick.id} pick={pick} />
          ))}
        </section>
      )}
      {groups.map((group) => {
        const rows = ordered.filter(group.test);
        if (!rows.length) return null;
        return (
          <section key={group.id} className="stack-block">
            <h2>{group.title}</h2>
            <p className="lede">{group.detail}</p>
            {rows.map((pick) => (
              <PickCard key={pick.id} pick={pick} />
            ))}
          </section>
        );
      })}
      {showSoft && soft.length > 0 && (
        <section className="stack-block">
          <h2>Softened by the opponent</h2>
          <p className="lede">The raw trend is above 80%, but the opponent pulls confidence back through 80%.</p>
          {soft.map((pick) => (
            <PickCard key={pick.id} pick={pick} />
          ))}
        </section>
      )}
      {ordered.length === 0 && soft.length === 0 && (
        <div className="empty">
          <h2>No tips on this board</h2>
          <p>Tips appear when today’s fixtures and prices load. Nothing on this board is above 80%.</p>
        </div>
      )}
    </div>
  );
}
