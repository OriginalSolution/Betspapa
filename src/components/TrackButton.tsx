import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { addTrackedSlip, findTrackedSlip, slipSignature, subscribeBuilder } from '../lib/builderStore';
import { cx } from '../lib/format';
import type { TrackDraft } from '../lib/trackFrom';

/**
 * Track a code's slip on the Slips tab next to the others. Tracking never replaces
 * a slip already tracked; the same code tracked twice stays one slip.
 * `load` reads the full leg list first when the board feed only carried part of it.
 */
export function TrackButton({ draft, load, className }: { draft: TrackDraft | null; load?: () => Promise<TrackDraft | null>; className?: string }) {
  const [, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(false);
  useEffect(() => subscribeBuilder(() => setVersion((value) => value + 1)), []);
  if (!draft) return null;
  const tracked = findTrackedSlip(slipSignature({ parts: draft.parts, legs: [] }));
  if (tracked) {
    return (
      <Link to={`/slips?slip=${encodeURIComponent(tracked.id)}`} className={cx('track-btn', 'is-on', className)} aria-label={`Tracking as Slip ${tracked.number}. Open it on Slips.`}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" /></svg>
        <span>Slip {tracked.number}</span>
      </Link>
    );
  }
  const track = async () => {
    if (busy) return;
    setProblem(false);
    let ready: TrackDraft | null = draft;
    if (load) {
      setBusy(true);
      try {
        const full = await load();
        if (full?.legs.length) ready = full;
      } catch {
        /* fall back to the legs the board already has */
      } finally {
        setBusy(false);
      }
    }
    if (!ready.legs.length) {
      setProblem(true);
      return;
    }
    addTrackedSlip(ready);
  };
  return (
    <button type="button" className={cx('track-btn', problem && 'is-problem', className)} onClick={() => void track()} disabled={busy} aria-label="Track this slip on the Slips tab">
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>
      <span>{busy ? 'Tracking…' : problem ? 'Retry track' : 'Track'}</span>
    </button>
  );
}
