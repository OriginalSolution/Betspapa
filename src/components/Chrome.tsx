import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { addDays } from '../lib/dates';
import { ago, cx, dayWord, formatDay, longDay } from '../lib/format';
import { applyFilter, isLiveStatus, type BoardFilter } from '../lib/group';
import { useStore } from '../state/store';
import { IconBell, IconLive, IconPicks, IconRank, IconRefresh, IconSettings, IconSlip, IconStar, IconToday, IconTrends, Mark } from './Icons';

const sideLinks = [
  { to: '/', label: 'Today', icon: <IconToday />, end: true },
  { to: '/live', label: 'Live', icon: <IconLive />, end: false },
  { to: '/picks', label: 'Picks', icon: <IconPicks />, end: false },
  { to: '/trends', label: 'Trends', icon: <IconTrends />, end: false },
  { to: '/slips', label: 'Slips', icon: <IconSlip />, end: false },
  { to: '/rankings', label: 'Rankings', icon: <IconRank />, end: false },
  { to: '/following', label: 'Following', icon: <IconStar />, end: false },
  { to: '/inbox', label: 'Alerts', icon: <IconBell />, end: false },
  { to: '/lists', label: 'Lists', icon: <IconStar />, end: false },
  { to: '/settings', label: 'Settings', icon: <IconSettings />, end: false },
];

const tabLinks = [
  { to: '/', label: 'Today', icon: <IconToday />, end: true },
  { to: '/picks', label: 'Picks', icon: <IconPicks />, end: false },
  { to: '/slips', label: 'Slips', icon: <IconSlip />, end: false },
  { to: '/trends', label: 'Trends', icon: <IconTrends />, end: false },
  { to: '/more', label: 'More', icon: <IconSettings />, end: false },
];

export function SideNav() {
  const { matches, unread } = useStore();
  const live = matches.filter((match) => isLiveStatus(match.status)).length;
  return (
    <nav className="sidenav" aria-label="Primary">
      <NavLink to="/" className="brand" end>
        <Mark />
        <span>Betspapa</span>
      </NavLink>
      {sideLinks.map((link) => (
        <NavLink key={link.to} to={link.to} end={link.end} className={({ isActive }) => cx('side-link', isActive && 'is-active')}>
          <span className="tab-icon">
            {link.icon}
            {link.to === '/live' && live > 0 && <i className="count">{live}</i>}
            {link.to === '/inbox' && unread > 0 && <i className="count">{unread}</i>}
          </span>
          {link.label}
        </NavLink>
      ))}
    </nav>
  );
}

export function TabBar() {
  const { matches } = useStore();
  const live = matches.filter((match) => isLiveStatus(match.status)).length;
  return (
    <nav className="tabbar" aria-label="Primary">
      {tabLinks.map((link) => (
        <NavLink key={link.to} to={link.to} end={link.end} className={({ isActive }) => cx('tab', isActive && 'is-active')}>
          <span className="tab-icon">
            {link.icon}
            {link.to === '/live' && live > 0 && <i className="count">{live}</i>}
          </span>
          <span>{link.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export function TopBar({ title }: { title: string }) {
  const { unread, refresh, date } = useStore();
  return (
    <header className="topbar">
      <NavLink to="/" className="brand mobile-brand" end aria-label="Betspapa home">
        <Mark size={26} />
      </NavLink>
      <div className="top-title">
        <h1>{title}</h1>
        <p>{title === 'Today' ? longDay(date) : title === 'Trends' ? 'Flip the code to see legs' : 'Today’s fixtures'}</p>
      </div>
      <div className="top-actions">
        <button type="button" className="icon-btn" onClick={refresh} aria-label="Refresh scores">
          <IconRefresh />
        </button>
        <NavLink to="/inbox" className="icon-btn bell" aria-label={unread ? `${unread} unread alerts` : 'Alerts'}>
          <IconBell />
          {unread > 0 && <i className="count">{unread}</i>}
        </NavLink>
      </div>
    </header>
  );
}

export function DateBar() {
  const { date, today, setDate, updatedAt, pollMs } = useStore();
  const span = 21;
  const min = addDays(today, -span);
  const max = addDays(today, span);
  const word = dayWord(date, today);
  return (
    <div className="subbar">
      <div className="date-row">
        <button type="button" className="step" onClick={() => setDate(addDays(date, -1))} disabled={date <= min} aria-label="Previous day">
          ‹
        </button>
        <div className="date-label">
          <strong>{formatDay(date)}</strong>
          {word && <span>{word}</span>}
        </div>
        <button type="button" className="step" onClick={() => setDate(addDays(date, 1))} disabled={date >= max} aria-label="Next day">
          ›
        </button>
      </div>
      <Updated at={updatedAt} pollMs={pollMs} />
    </div>
  );
}

function Updated({ at, pollMs }: { at: number | null; pollMs: number }) {
  const [, bump] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => bump((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return <p className="updated">{at ? `Updated ${ago(at)} · every ${Math.round(pollMs / 1000)}s` : 'Waiting for scores'}</p>;
}

const filters: Array<{ id: BoardFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'live', label: 'Live' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'finished', label: 'Finished' },
];

export function FilterChips({ value, onChange }: { value: BoardFilter; onChange: (filter: BoardFilter) => void }) {
  const { matches } = useStore();
  return (
    <div className="chips" role="tablist" aria-label="Filter fixtures">
      {filters.map((filter) => {
        const count = applyFilter(matches, filter.id).length;
        return (
          <button
            key={filter.id}
            type="button"
            role="tab"
            aria-selected={value === filter.id}
            className={cx('chip', value === filter.id && 'is-on')}
            onClick={() => onChange(filter.id)}
          >
            {filter.label}
            <span>{count}</span>
          </button>
        );
      })}
    </div>
  );
}

export function ErrorBanner() {
  const { error, refresh } = useStore();
  if (!error) return null;
  return (
    <div className="banner" role="alert">
      <p>{error}</p>
      <button type="button" onClick={refresh}>
        Retry
      </button>
    </div>
  );
}

export function Rail() {
  const { inbox, follows, matches } = useStore();
  const latest = inbox.slice(0, 4);
  const followedMatches = matches.filter((match) => follows.matches.includes(match.id));
  const count = follows.matches.length + follows.teams.length;
  return (
    <aside className="rail">
      <div className="rail-block">
        <div className="rail-head">
          <h2>Alerts</h2>
          <NavLink to="/inbox">Open</NavLink>
        </div>
        {latest.length === 0 ? (
          <p className="rail-empty">Follow a match and kick-off, goals, red cards, half-time and full-time show up here.</p>
        ) : (
          <ul className="rail-list">
            {latest.map((item) => (
              <li key={item.id}>
                <NavLink to={`/match/${item.matchId}`}>
                  <strong>{item.title}</strong>
                  <span>{item.body}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="rail-block">
        <div className="rail-head">
          <h2>Following</h2>
          <NavLink to="/following">{count}</NavLink>
        </div>
        {count === 0 ? (
          <p className="rail-empty">Star a match or follow a team.</p>
        ) : (
          <ul className="rail-list">
            {followedMatches.map((match) => (
              <li key={match.id}>
                <NavLink to={`/match/${match.id}`}>
                  <strong>
                    {match.home.shortName} vs {match.away.shortName}
                  </strong>
                  <span>{match.competition.name}</span>
                </NavLink>
              </li>
            ))}
            {follows.teams.map((team) => (
              <li key={team.id}>
                <span className="rail-team">
                  <strong>{team.shortName}</strong>
                  <span>Team</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

export function Toasts() {
  const { toasts, dismissToast } = useStore();
  if (!toasts.length) return null;
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((toast) => (
        <NavLink key={toast.id} to={`/match/${toast.matchId}`} className={cx('toast', `toast-${toast.kind}`)} onClick={() => dismissToast(toast.id)}>
          <strong>{toast.title}</strong>
          <span>{toast.body}</span>
        </NavLink>
      ))}
    </div>
  );
}
