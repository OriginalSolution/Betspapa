import { Link } from 'react-router-dom';
import { PRO_UI_ENABLED } from '../lib/proFlag';

export function ProPage() {
  if (!PRO_UI_ENABLED) {
    return (
      <div className="empty">
        <h2>Pro is not on</h2>
        <p>Prices are still placeholders. Nothing here is for sale.</p>
        <Link to="/more" className="btn">
          Back to More
        </Link>
      </div>
    );
  }
  return (
    <div className="stack pro-screen">
      <p className="pro-note">Placeholder prices. Not a live charge. Google Play billing is not set up.</p>
      <section className="pro-prices" aria-label="Placeholder prices">
        <p>GHS 15 / week</p>
        <p>GHS 45 / month</p>
        <button type="button" className="btn" disabled>
          Continue on Play · placeholder
        </button>
      </section>
      <div className="pro-limits">
        <section>
          <h2>Free · placeholder</h2>
          <p>Today and one slip. This limit is not a shipped rule.</p>
        </section>
        <section>
          <h2>Pro · placeholder</h2>
          <p>No banner. This limit is not a shipped rule.</p>
        </section>
      </div>
      <p className="ad-slot">AdMob banner slot · placeholder, not a live ad</p>
      <button type="button" className="ad-slot ad-opt" disabled>
        Watch a short video for one extra slip · opt-in placeholder
      </button>
    </div>
  );
}
