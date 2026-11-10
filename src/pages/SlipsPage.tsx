import { PickCard } from '../components/PickCard';
import { cx } from '../lib/format';
import { useProduct } from '../state/product';

export function SlipsPage() {
  const { picks, slip, codes } = useProduct();
  const legs = picks.filter((pick) => slip.includes(pick.id));
  const won = legs.filter((pick) => pick.status === 'won').length;
  const bust = legs.filter((pick) => pick.status === 'bust').length;
  const open = legs.length - won - bust;
  return (
    <div className="stack">
      <p className="page-lead">
        Every tip above 80% is booked on this slip. Betspapa tracks each leg and settles wins and busts here. Bookmaker codes stay unavailable until a live booking connection exists.
      </p>
      <p className="page-lead">
        {legs.length} booked · {open} open · {won} won · {bust} bust
      </p>
      <section className="stack-block">
        <h2>Booking codes</h2>
        {codes.map((code) => (
          <article key={code.id} className={cx('code-card', code.status !== 'open' && `pick-${code.status}`)}>
            <header>
              <strong>{code.name}</strong>
              <span>{code.bookingState === 'ready' ? 'Code ready' : 'Code unavailable'}</span>
            </header>
            <p className="booking-code">{code.code || 'Unavailable'}</p>
            <p className="lede">
              {code.note} Tracked here: {code.legs.length} legs, {code.status === 'won' ? 'won' : code.status === 'bust' ? 'bust' : 'still open'}.
            </p>
          </article>
        ))}
      </section>
      {legs.length === 0 ? (
        <div className="empty">
          <h2>Nothing booked</h2>
          <p>Qualifying tips appear here on their own. You can still add a pick from the board.</p>
        </div>
      ) : (
        legs.slice(0, 8).map((pick) => <PickCard key={pick.id} pick={pick} />)
      )}
      {legs.length > 8 && <p className="lede">Showing 8 of {legs.length} booked trends. Each booking card above covers every leg.</p>}
    </div>
  );
}
