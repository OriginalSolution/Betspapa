import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../components/MatchBoard';
import { staleAlertIds } from '../lib/alerts';
import { ago, cx } from '../lib/format';
import { useStore } from '../state/store';

export function InboxPage() {
  const { inbox, matches, markAllRead, clearStaleAlerts } = useStore();
  const [confirm, setConfirm] = useState(false);
  const stale = staleAlertIds(inbox, matches, Date.now());
  useEffect(() => {
    markAllRead();
  }, [inbox, markAllRead]);

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
      <EmptyState
        title="No alerts yet"
        body="Kick-off, goals, half-time and full-time for teams you follow, plus a trend you follow once that market hits, collect here and stay after you reopen the app."
        action={
          <Link to="/" className="btn">
            Find a match
          </Link>
        }
      />
    );
  }

  return (
    <>
      {tools}
      <ul className="inbox">
        {inbox.map((item) => (
          <li key={item.id} className={cx(!item.read && 'is-unread')}>
            <Link to={`/match/${item.matchId}`} className={cx('inbox-item', `kind-${item.kind}`)}>
              <div>
                <strong>{item.title}</strong>
                <p>{item.body}</p>
              </div>
              <time dateTime={new Date(item.createdAt).toISOString()}>{ago(item.createdAt)}</time>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
