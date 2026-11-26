import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adsOnAndroid, showTestRewarded } from '../lib/ads';
import { fallbackPlans, buyPlan, loadPlayPrices, restorePlans, type PlanPrice } from '../lib/playBilling';
import { FREE_FOLLOW_LIMIT, hasPro, saveReward, type ProProductId } from '../lib/proAccess';
import { PRO_UI_ENABLED } from '../lib/proFlag';

export function ProPage() {
  const [plans, setPlans] = useState<PlanPrice[]>(fallbackPlans);
  const [pro, setPro] = useState(() => hasPro());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const android = adsOnAndroid();
  useEffect(() => {
    if (!PRO_UI_ENABLED) return;
    void loadPlayPrices().then(setPlans);
  }, []);
  if (!PRO_UI_ENABLED) {
    return (
      <div className="empty">
        <h2>Pro is not on</h2>
        <p>Nothing here is for sale.</p>
        <Link to="/more" className="btn">
          Back to More
        </Link>
      </div>
    );
  }

  const buy = async (id: ProProductId) => {
    setBusy(true);
    setNote('');
    try {
      const row = await buyPlan(id);
      if (!row) setNote('Play did not confirm that purchase.');
      else {
        setPro(true);
        setNote('Pro is on for this Google account.');
      }
    } catch {
      setNote('Play did not confirm that purchase.');
    } finally {
      setBusy(false);
    }
  };
  const restore = async () => {
    setBusy(true);
    setNote('');
    try {
      const row = await restorePlans();
      setPro(Boolean(row) || hasPro());
      setNote(row ? 'Purchases restored.' : 'No active Pro purchase was found.');
    } finally {
      setBusy(false);
    }
  };
  const watch = async () => {
    const rewarded = await showTestRewarded();
    if (!rewarded) {
      setNote('The video did not finish, so no extra code was added.');
      return;
    }
    saveReward('reward');
    setNote('One extra Pro code is open for today.');
  };

  return (
    <div className="stack pro-screen">
      <button type="button" className="btn btn-quiet pro-close" onClick={() => window.history.back()}>
        Close
      </button>
      {android ? (
        <p className="pro-note">Prices come from Google Play. {plans.some((plan) => plan.fromPlay) ? 'These are Play’s prices for this phone.' : 'Play’s price shows here when the store answers. Until then the approved Ghana prices are shown.'}</p>
      ) : (
        <p className="pro-note">Betspapa Pro is available in the Android app. There is no purchase on the website.</p>
      )}
      <section className="pro-prices" aria-label="Pro prices">
        {plans.map((plan) => (
          <p key={plan.id}>
            {plan.price} / {plan.period}
            {android && (
              <button type="button" className="btn" disabled={busy || pro} onClick={() => void buy(plan.id)}>
                {pro ? 'Pro is on' : 'Subscribe with Play'}
              </button>
            )}
          </p>
        ))}
        {android && (
          <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => void restore()}>
            Restore purchases
          </button>
        )}
        <p className="pro-note">Each price is for that period. A year is not shown as a monthly price. A subscription renews automatically until cancelled.</p>
        <p className="pro-note">Cancel in Google Play: open your profile photo, then Payments and subscriptions, then Subscriptions.</p>
        <p className="pro-note">
          <a href="https://play.google.com/store/account/subscriptions?package=com.betspapa.scores">Manage subscription</a>
        </p>
      </section>
      <div className="pro-limits">
        <section>
          <h2>Free</h2>
          <p>Scores, alerts, and today’s 80%+ picks. Up to {FREE_FOLLOW_LIMIT} follows.</p>
        </section>
        <section>
          <h2>Pro</h2>
          <p>100% and 90% tiers, early codes, unlimited follows, saved filters, lineup alerts, and no ads.</p>
        </section>
      </div>
      {android && !pro && (
        <button type="button" className="ad-slot ad-opt" onClick={() => void watch()}>
          Watch a short video for one extra Pro code today
        </button>
      )}
      {note && <p className="pro-note">{note}</p>}
    </div>
  );
}
