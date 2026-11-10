import { useState } from 'react';
import { rankLedger } from '../data/board';
import { useProduct } from '../state/product';

const periods = ['week', 'month', 'year'] as const;
const fields = [
  { id: 'market', label: 'Markets' },
  { id: 'team', label: 'Teams' },
  { id: 'competition', label: 'Competitions' },
] as const;

export function RankingsPage() {
  const { ledger } = useProduct();
  const [period, setPeriod] = useState<(typeof periods)[number]>('week');
  const [field, setField] = useState<(typeof fields)[number]['id']>('market');
  const rows = rankLedger(ledger, period, Date.now(), field);
  return (
    <div className="stack">
      <p className="page-lead">Ranked from tips settled on this device. Week, month, and year only count those results.</p>
      <div className="chips">
        {periods.map((item) => (
          <button key={item} type="button" className={period === item ? 'chip is-on' : 'chip'} onClick={() => setPeriod(item)}>
            {item}
          </button>
        ))}
      </div>
      <div className="chips">
        {fields.map((item) => (
          <button key={item.id} type="button" className={field === item.id ? 'chip is-on' : 'chip'} onClick={() => setField(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <div className="empty">
          <h2>No settled tips in this window</h2>
          <p>Week, month, and year only count results inside that span.</p>
        </div>
      ) : (
        <ol className="ranks">
          {rows.map((row, index) => (
            <li key={row.id}>
              <span>{index + 1}</span>
              <div>
                <strong>{row.name}</strong>
                <p>
                  {row.won} won · {row.played - row.won} bust · {row.played} played
                </p>
              </div>
              <b>{Math.round(row.rate * 100)}%</b>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
