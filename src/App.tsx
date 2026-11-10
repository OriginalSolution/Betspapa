import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { Rail, SideNav, TabBar, Toasts, TopBar } from './components/Chrome';
import { FollowingPage } from './pages/FollowingPage';
import { InboxPage } from './pages/InboxPage';
import { LivePage } from './pages/LivePage';
import { MatchPage } from './pages/MatchPage';
import { SettingsPage } from './pages/SettingsPage';
import { TodayPage } from './pages/TodayPage';
import { useStore } from './state/store';

const titles: Record<string, string> = {
  '/': 'Today',
  '/live': 'Live',
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
