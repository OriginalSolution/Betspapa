import { useState } from 'react';
import { PickCard } from '../components/PickCard';
import { cx } from '../lib/format';
import { useProduct } from '../state/product';

export function SlipsPage() {
  const { picks, slip, codes } = useProduct();
  const legs = picks.filter((pick) => slip.includes(pick.id));
  const [copied, setCopied] = useState('');
  return (
    <div className="stack">
      <p className="page-lead">Booking codes are demo slips. No bookmaker API is connected. Each desk only prices the markets it lists, and the code changes as the legs change.</p>
      {legs.length === 0 ? (
        <div className="empty">
          <h2>Slip is empty</h2>
          <p>Add a qualifying pick. PapaSlip, Northline, and Kiosk Demo will each write a code for the markets they cover.</p>
        </div>
      ) : (
        legs.map((pick) => <PickCard key={pick.id} pick={pick} />)
      )}
      <section className="stack-block">
        <h2>Demo booking codes</h2>
        {codes.map((code) => (
          <article key={code.id} className={cx('code-card', code.status !== 'open' && `pick-${code.status}`)}>
            <header>
              <strong>{code.name}</strong>
              <span>{code.note}</span>
            </header>
            <p className="booking-code">{code.code || 'Add a covered market'}</p>
            <p className="lede">
              {code.legs.length} covered
              {code.skipped.length > 0 ? ` · ${code.skipped.length} not on this desk` : ''} · {code.status}
            </p>
            {code.code && (
              <button
                type="button"
                className="btn btn-tiny"
                onClick={() => {
                  void navigator.clipboard?.writeText(code.code);
                  setCopied(code.id);
                }}
              >
                {copied === code.id ? 'Copied' : 'Copy code'}
              </button>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
