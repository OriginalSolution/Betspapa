import { BookMark } from '../components/BookMark';
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
        Every tip above 80% is booked on this slip. Betspapa tracks each leg and settles wins and busts here. A share code appears when that bookmaker accepts the slip.
      </p>
      <p className="page-lead">
        {legs.length} booked · {open} open · {won} won · {bust} bust
      </p>
      <section className="stack-block">
        <h2>Booking codes</h2>
        {codes.map((code) => (
          <article key={code.id} className={cx('code-card', `book-${code.id}`, code.status !== 'open' && `pick-${code.status}`)}>
            <header>
              <BookMark id={code.id} />
              <strong>{code.name}</strong>
              <span>{code.bookingState === 'ready' ? 'Code ready' : code.bookingState === 'pending' ? 'Booking' : code.bookingState === 'error' ? 'Could not book' : 'Not booked'}</span>
            </header>
            {code.parts.length ? (
              code.parts.map((part, index) => (
                <div className="booking-part" key={`${code.id}-${part.code}-${index}`}>
                  <p className="booking-code">{part.code}</p>
                  <a className="booking-link" href={part.link} target="_blank" rel="noreferrer">
                    {code.parts.length > 1 ? `Load part ${index + 1}` : 'Load this code'}
                  </a>
                  <p className="lede">
                    {part.legs} legs on this code{part.totalOdds ? ` · combined price ${part.totalOdds}` : ''}.
                  </p>
                </div>
              ))
            ) : (
              <p className="booking-code">{code.bookingState === 'pending' ? 'Booking' : 'Not booked'}</p>
            )}
            <p className="lede">
              {code.note} On this site: {code.legs.length} legs, {code.status === 'won' ? 'won' : code.status === 'bust' ? 'bust' : 'still open'}.
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
      {legs.length > 8 && <p className="lede">Showing 8 of {legs.length} booked trends. Each booking card above covers the slip.</p>}
    </div>
  );
}
