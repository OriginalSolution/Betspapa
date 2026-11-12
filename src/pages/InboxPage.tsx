import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LiveAlertsBanner } from '../components/AlertSetup';
import { EmptyState } from '../components/MatchBoard';
import { staleAlertIds } from '../lib/alerts';
import { ago, cx } from '../lib/format';
import type { InboxItem } from '../types';
import { useStore } from '../state/store';

export function InboxPage() {
  const { inbox, matches, markAllRead, clearStaleAlerts, deleteAlert, restoreAlert } = useStore();
  const [confirm, setConfirm] = useState(false);
  const [undo, setUndo] = useState<InboxItem | null>(null);
  const stale = staleAlertIds(inbox, matches, Date.now());
  useEffect(() => {
    markAllRead();
  }, [inbox, markAllRead]);

  useEffect(() => {
    if (!undo) return;
    const timer = window.setTimeout(() => setUndo(null), 4000);
    return () => window.clearTimeout(timer);
  }, [undo]);

  const tools = inbox.length > 0 && (
    <div className="inbox-tools">
      <button
        type="button"
        className="btn btn-quiet"
        disabled={!stale.length && !confirm}
        onClick={() => {
          if (!stale.length) {
            setConfirm(false);
            return;
          }
          if (!confirm) {
            setConfirm(true);
            return;
          }
          clearStaleAlerts();
          setConfirm(false);
        }}
      >
        {confirm ? `Confirm clear ${stale.length}` : 'Clear old alerts'}
      </button>
      {confirm && (
        <button type="button" className="btn btn-quiet" onClick={() => setConfirm(false)}>
          Cancel
        </button>
      )}
      <p>{confirm ? 'Finished matches, settled trends, and alerts from before today will go. Today’s live alerts stay.' : 'Old and settled alerts can be removed. They will not come back.'}</p>
    </div>
  );

  if (!inbox.length) {
    return (
      <>
        <LiveAlertsBanner />
        <EmptyState
        title="No alerts yet"
        body="Kick-off, goals, half-time and full-time for teams you follow, plus a trend you follow once that market hits, collect here and stay after you reopen the app."
        action={
          <Link to="/" className="btn">
            Find a match
          </Link>
        }
      />
      </>
    );
  }

  return (
    <>
      <LiveAlertsBanner />
      {tools}
      <ul className="inbox">
        {inbox.map((item) => (
          <SwipeAlert
            key={item.id}
            item={item}
            onDelete={() => {
              deleteAlert(item.id);
              setUndo(item);
            }}
          />
        ))}
      </ul>
      {undo && (
        <div className="undo-snack" role="status">
          <span>Alert deleted</span>
          <button
            type="button"
            onClick={() => {
              restoreAlert(undo);
              setUndo(null);
            }}
          >
            Undo
          </button>
        </div>
      )}
    </>
  );
}

function SwipeAlert({ item, onDelete }: { item: InboxItem; onDelete: () => void }) {
  const [offset, setOffset] = useState(0);
  const shift = useRef(0);
  const start = useRef<{ x: number; y: number; pointer: number } | null>(null);
  const dragging = useRef(false);

  const move = (next: number) => {
    shift.current = next;
    setOffset(next);
  };

  const end = (commit: boolean) => {
    if (commit && shift.current < -72) onDelete();
    move(0);
    start.current = null;
    dragging.current = false;
  };

  return (
    <li className={cx('inbox-swipe', !item.read && 'is-unread')}>
      <span className="inbox-delete">Delete</span>
      <div
        className="inbox-front"
        style={{ transform: `translateX(${offset}px)` }}
        onPointerDown={(event) => {
          start.current = { x: event.clientX, y: event.clientY, pointer: event.pointerId };
          dragging.current = false;
        }}
        onPointerMove={(event) => {
          if (!start.current || start.current.pointer !== event.pointerId) return;
          const dx = event.clientX - start.current.x;
          const dy = event.clientY - start.current.y;
          if (!dragging.current && Math.abs(dx) < 8) return;
          if (!dragging.current && Math.abs(dy) > Math.abs(dx)) {
            start.current = null;
            return;
          }
          dragging.current = true;
          move(Math.max(-140, Math.min(0, dx)));
        }}
        onPointerUp={() => end(dragging.current)}
        onPointerCancel={() => end(false)}
      >
        <Link
          to={item.kind === 'win' || item.kind === 'bust' ? '/trends' : `/match/${item.matchId}`}
          className={cx('inbox-item', `kind-${item.kind}`)}
          onClick={(event) => {
            if (dragging.current || offset < -8) event.preventDefault();
          }}
        >
          <div>
            <strong>{item.title}</strong>
            <p>{item.body}</p>
          </div>
          <time dateTime={new Date(item.createdAt).toISOString()}>{ago(item.createdAt)}</time>
        </Link>
      </div>
    </li>
  );
}
