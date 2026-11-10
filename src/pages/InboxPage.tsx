import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../components/MatchBoard';
import { ago, cx } from '../lib/format';
import { useStore } from '../state/store';

export function InboxPage() {
  const { inbox, markAllRead } = useStore();
  useEffect(() => {
    markAllRead();
  }, [inbox, markAllRead]);

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
  );
}
