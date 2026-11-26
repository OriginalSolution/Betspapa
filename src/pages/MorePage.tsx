import { Link } from 'react-router-dom';
import { PRO_UI_ENABLED } from '../lib/proFlag';

const links = [
  { to: '/record', title: 'Record', detail: 'Every 80%+ pick, graded from the full-time score' },
  { to: '/live', title: 'Live', detail: 'In-play scores' },
  { to: '/trends', title: 'Trends', detail: 'Rates above 80% are tipped' },
  { to: '/rankings', title: 'Rankings', detail: 'Week, month, and year' },
  { to: '/following', title: 'Following', detail: 'Starred matches and teams' },
  { to: '/lists', title: 'Lists', detail: 'Blacklist and greenlist' },
  { to: '/settings', title: 'Settings', detail: 'Alerts, cheer, and VAR' },
];

export function MorePage() {
  return (
    <div className="stack">
      <nav className="more-list" aria-label="More">
        {links.map((link) => (
          <Link key={link.to} to={link.to}>
            <strong>{link.title}</strong>
            <span>{link.detail}</span>
          </Link>
        ))}
        {PRO_UI_ENABLED && (
          <Link to="/pro">
            <strong>Betspapa Pro</strong>
            <span>Placeholder prices. Nothing is charged.</span>
          </Link>
        )}
        <a href="https://betspapa.com/privacy/" target="_blank" rel="noopener noreferrer">
          <strong>Privacy policy</strong>
          <span>What alerts send and how to delete it</span>
        </a>
      </nav>
    </div>
  );
}
