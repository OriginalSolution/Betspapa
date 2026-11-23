import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { FeedPause } from '../lib/backoff';
import { ENGINE_POLL_MS, fetchEngine, readEngineCache, writeEngineCache, type EngineState } from '../lib/engineSlips';

type EngineBoard = { state: EngineState | null; problem: string | null };

const EngineContext = createContext<EngineBoard>({ state: null, problem: null });

/** One engine read for the whole app. Tabs subscribe; they do not fetch or parse again. */
export function EngineProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<EngineState | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    let stop = false;
    const cached = readEngineCache();
    if (cached) setState(cached);
    let pauseUntil = 0;
    const pull = async () => {
      if (document.visibilityState === 'hidden' || Date.now() < pauseUntil) return;
      try {
        const next = await fetchEngine();
        if (stop) return;
        writeEngineCache(next);
        setState(next);
        setProblem(null);
      } catch (error) {
        if (error instanceof FeedPause) pauseUntil = error.retryAt;
        if (!stop) setProblem(error instanceof Error ? error.message : 'Could not load the board');
      }
    };
    void pull();
    const timer = window.setInterval(() => void pull(), ENGINE_POLL_MS);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, []);
  return <EngineContext.Provider value={{ state, problem }}>{children}</EngineContext.Provider>;
}

export function useEngineBoard(): EngineBoard {
  return useContext(EngineContext);
}
