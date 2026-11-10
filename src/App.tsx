import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { Rail, SideNav, TabBar, Toasts, TopBar } from './components/Chrome';
import { FollowingPage } from './pages/FollowingPage';
import { InboxPage } from './pages/InboxPage';
import { ListsPage } from './pages/ListsPage';
import { LivePage } from './pages/LivePage';
import { MatchPage } from './pages/MatchPage';
import { MorePage } from './pages/MorePage';
import { PicksPage } from './pages/PicksPage';
import { RankingsPage } from './pages/RankingsPage';
import { SettingsPage } from './pages/SettingsPage';
import { SlipsPage } from './pages/SlipsPage';
import { TodayPage } from './pages/TodayPage';
import { TrendsPage } from './pages/TrendsPage';
import { useStore } from './state/store';

const titles: Record<string, string> = {
  '/': 'Today',
  '/live': 'Live',
  '/picks': 'Picks',
  '/trends': 'Trends',
  '/slips': 'Slips',
  '/rankings': 'Rankings',
  '/lists': 'Lists',
  '/more': 'More',
  '/following': 'Following',
  '/inbox': 'Alerts',
  '/settings': 'Settings',
};

export function App() {
  const location = useLocation();
  const { matches } = useStore();
  const match = location.pathname.startsWith('/match/')
    ? matches.find((item) => location.pathname === `/match/${item.id}`)
    : undefined;
  const title = match ? `${match.home.shortName} vs ${match.away.shortName}` : titles[location.pathname] ?? 'Betspapa';

  useEffect(() => {
    document.title = `${title} · Betspapa`;
  }, [title]);

  return (
    <div className="shell">
      <SideNav />
      <div className="center">
        <TopBar title={title} />
        <main className="main">
          <Routes>
            <Route path="/" element={<TodayPage />} />
            <Route path="/live" element={<LivePage />} />
            <Route path="/picks" element={<PicksPage />} />
            <Route path="/trends" element={<TrendsPage />} />
            <Route path="/slips" element={<SlipsPage />} />
            <Route path="/rankings" element={<RankingsPage />} />
            <Route path="/lists" element={<ListsPage />} />
            <Route path="/more" element={<MorePage />} />
            <Route path="/following" element={<FollowingPage />} />
            <Route path="/inbox" element={<InboxPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/match/:id" element={<MatchPage />} />
          </Routes>
        </main>
      </div>
      <Rail />
      <TabBar />
      <Toasts />
    </div>
  );
}
