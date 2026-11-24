import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { addTrackedSlip, findTrackedSlip, slipSignature, subscribeBuilder } from '../lib/builderStore';
import { cx } from '../lib/format';
import type { TrackDraft } from '../lib/trackFrom';

/**
 * Track a code's slip on the Slips tab next to the others. Tracking never replaces
 * a slip already tracked; the same code tracked twice stays one slip.
 */
export function TrackButton({ draft, className }: { draft: TrackDraft | null; className?: string }) {
  const [, setVersion] = useState(0);
  useEffect(() => subscribeBuilder(() => setVersion((value) => value + 1)), []);
  if (!draft) return null;
  const tracked = findTrackedSlip(slipSignature(draft));
  if (tracked) {
    return (
      <Link to={`/slips?slip=${encodeURIComponent(tracked.id)}`} className={cx('track-btn', 'is-on', className)} aria-label={`Tracking as Slip ${tracked.number}. Open it on Slips.`}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" /></svg>
        <span>Slip {tracked.number}</span>
      </Link>
    );
  }
  return (
    <button type="button" className={cx('track-btn', className)} onClick={() => addTrackedSlip(draft)} aria-label="Track this slip on the Slips tab">
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>
      <span>Track</span>
    </button>
  );
}
