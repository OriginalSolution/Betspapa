import { PRO_UI_ENABLED } from '../lib/proFlag';

/** A labelled placeholder. It does not load an ad and it is not a pop-up. */
export function AdSlot() {
  if (!PRO_UI_ENABLED) return null;
  return <p className="ad-slot">Small banner under the live list · placeholder. No ad is loaded.</p>;
}
