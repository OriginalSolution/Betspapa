import { useEffect } from 'react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { AlertSetupProvider } from './components/AlertSetup';
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
import { isNativeApp } from './lib/nativeHttp';
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

type OpenTarget = { route?: string; matchId?: string; trendId?: string };

export function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const { matches } = useStore();
  const match = location.pathname.startsWith('/match/')
    ? matches.find((item) => location.pathname === `/match/${item.id}`)
    : undefined;
  const title = match ? `${match.home.shortName} vs ${match.away.shortName}` : titles[location.pathname] ?? 'Betspapa';

  useEffect(() => {
    document.title = `${title} · Betspapa`;
  }, [title]);

  useEffect(() => {
    if (!isNativeApp()) return;
    let alive = true;
    let handle: PluginListenerHandle | undefined;
    const Watch = registerPlugin<{
      pendingOpen(): Promise<OpenTarget>;
      addListener(eventName: 'open', listener: (open: OpenTarget) => void): Promise<PluginListenerHandle>;
    }>('Watch');
    const follow = (open: OpenTarget | null | undefined) => {
      if (!alive || !open) return;
      if (open.matchId) {
        const trend = open.trendId ? `?trend=${encodeURIComponent(open.trendId)}` : '';
        navigate(`/match/${open.matchId}${trend}`);
        return;
      }
      if (open.route === 'slip') {
        navigate('/slips');
        return;
      }
      if (open.route === 'trend') {
        navigate(open.trendId ? `/trends?trend=${encodeURIComponent(open.trendId)}` : '/trends');
      }
    };
    void (async () => {
      handle = await Watch.addListener('open', follow);
      try {
        follow(await Watch.pendingOpen());
      } catch {
        /* the card still opens the app */
      }
    })();
    return () => {
      alive = false;
      void handle?.remove();
    };
  }, [navigate]);

  useEffect(() => {
    const splash = document.getElementById('boot-splash');
    if (!splash) return;
    const started = Number(document.documentElement.dataset.boot || Date.now());
    const hold = isNativeApp() ? 0 : Math.max(0, 1100 - (Date.now() - started));
    const timer = window.setTimeout(() => {
      splash.classList.add('is-gone');
      window.setTimeout(() => splash.remove(), 450);
    }, hold);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <AlertSetupProvider>
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
    </AlertSetupProvider>
  );
}
