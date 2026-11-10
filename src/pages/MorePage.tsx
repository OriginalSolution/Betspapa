import { Link } from 'react-router-dom';

const links = [
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
      </nav>
    </div>
  );
}
