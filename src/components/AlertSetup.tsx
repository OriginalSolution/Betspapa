import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ALERT_SETUP_VERSION,
  bannerNeeded,
  doneCopy,
  emptyDeviceStatus,
  fixSteps,
  introSteps,
  isStepSatisfied,
  nativeSetupIsCurrent,
  nextUnsatisfiedIndex,
  parseDeviceStatus,
  parseOem,
  pollIsStale,
  readStoredSetup,
  retryNote,
  retrySteps,
  sentCopy,
  setupIsCurrent,
  shouldShowIntro,
  stepCopy,
  stepHint,
  writeStoredSetup,
  type AlertDeviceStatus,
  type AlertStepId,
  type FlowPhase,
} from '../lib/alertSetup';
import {
  markAlertSetup,
  openAutostartSettings,
  requestBatteryExemption,
  requestExactAlarm,
  requestWatchNotifications,
  scheduleBackgroundTest,
  watchNativeEvents,
  watchStatus,
  type WatchDeviceStatus,
} from '../lib/deviceWatch';
import { isNativeApp } from '../lib/nativeHttp';
import { useProduct } from '../state/product';
import { useStore } from '../state/store';
import { SetupHint } from './SetupHint';

type AlertSetupContextValue = {
  status: AlertDeviceStatus | null;
  showBanner: boolean;
  applyStatus: (next: WatchDeviceStatus | null) => void;
  refresh: () => Promise<void>;
  fixNow: () => void;
  startAgain: () => void;
};

const AlertSetupContext = createContext<AlertSetupContextValue | null>(null);

function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function AlertSetupProvider({ children }: { children: ReactNode }) {
  const { follows } = useStore();
  const { trendFollows } = useProduct();
  const [status, setStatus] = useState<AlertDeviceStatus | null>(null);
  const [finished, setFinished] = useState(() => setupIsCurrent(readStoredSetup(browserStorage())));
  const [booting, setBooting] = useState(() => isNativeApp() && !setupIsCurrent(readStoredSetup(browserStorage())));
  const [open, setOpen] = useState(false);
  const [steps, setSteps] = useState<AlertStepId[]>([]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<FlowPhase>('ask');
  const [noted, setNoted] = useState(false);
  const [celebrating, setCelebrating] = useState<AlertStepId | null>(null);
  const phaseRef = useRef(phase);
  const leftRef = useRef(false);
  const finishing = useRef(false);
  phaseRef.current = phase;

  const applyParsed = useCallback((next: AlertDeviceStatus) => {
    setStatus(next);
  }, []);

  const applyStatus = useCallback((next: WatchDeviceStatus | null) => {
    if (!next) return;
    applyParsed(parseDeviceStatus(next));
  }, [applyParsed]);

  const refresh = useCallback(async () => {
    const next = await watchStatus();
    if (next) applyParsed(parseDeviceStatus(next));
  }, [applyParsed]);

  const finish = useCallback(async () => {
    if (finishing.current) return;
    finishing.current = true;
    writeStoredSetup(browserStorage(), { version: ALERT_SETUP_VERSION, finished: true });
    setFinished(true);
    setOpen(false);
    setPhase('ask');
    setNoted(false);
    setCelebrating(null);
    const saved = await markAlertSetup(ALERT_SETUP_VERSION, true);
    if (saved) applyParsed(parseDeviceStatus(saved));
    else await refresh();
  }, [applyParsed, refresh]);

  const openFlow = useCallback((nextSteps: AlertStepId[]) => {
    finishing.current = false;
    setSteps(nextSteps);
    setIndex(0);
    setPhase('ask');
    setNoted(false);
    setCelebrating(null);
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const params = new URLSearchParams(window.location.search);
    const preview = params.get('setupPreview');
    if (!preview) return;
    const known = (['notifications', 'battery', 'exact', 'autostart', 'test'] as const).find((item) => item === preview) ?? 'notifications';
    setStatus({ ...emptyDeviceStatus(), oem: parseOem(params.get('oem')) ?? 'transsion', notifications: 'prompt', batteryUnrestricted: false, exactAlarms: 'denied' });
    setSteps([known]);
    setIndex(0);
    setPhase('ask');
    setOpen(true);
    setBooting(false);
  }, []);

  useEffect(() => {
    if (!isNativeApp() || (import.meta.env.DEV && new URLSearchParams(window.location.search).get('setupPreview'))) return;
    let cancelled = false;
    const decided = { current: false };
    const settle = (parsed: AlertDeviceStatus) => {
      applyParsed(parsed);
      if (decided.current) return;
      decided.current = true;
      const local = readStoredSetup(browserStorage());
      if (shouldShowIntro(local, nativeSetupIsCurrent(parsed))) {
        setFinished(false);
        openFlow(introSteps(parsed));
      } else if (pollIsStale(parsed.lastPollAt)) {
        setFinished(false);
        openFlow(retrySteps(parsed));
      } else {
        setFinished(true);
        setOpen(false);
        if (setupIsCurrent(local) && !nativeSetupIsCurrent(parsed)) void markAlertSetup(ALERT_SETUP_VERSION, true);
        if (!setupIsCurrent(local) && nativeSetupIsCurrent(parsed)) {
          writeStoredSetup(browserStorage(), { version: ALERT_SETUP_VERSION, finished: true });
        }
      }
      setBooting(false);
    };
    const timer = window.setTimeout(() => {
      if (!cancelled) settle(emptyDeviceStatus());
    }, 2500);
    void (async () => {
      const next = await watchStatus();
      if (cancelled) return;
      window.clearTimeout(timer);
      settle(parseDeviceStatus(next));
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [applyParsed, openFlow]);

  useEffect(() => {
    if (!open || !status || phase === 'sent' || phase === 'confirm' || celebrating) return;
    const next = nextUnsatisfiedIndex(steps, index, status);
    if (next === index) return;
    const current = steps[index];
    if (current && isStepSatisfied(status, current)) {
      setCelebrating(current);
      return;
    }
    if (next >= steps.length) {
      void finish();
      return;
    }
    setIndex(next);
    setPhase('ask');
  }, [open, status, steps, index, phase, finish, celebrating]);

  useEffect(() => {
    if (!celebrating || !status) return;
    const timer = window.setTimeout(() => {
      const next = nextUnsatisfiedIndex(steps, index, status);
      setCelebrating(null);
      if (next >= steps.length) {
        void finish();
        return;
      }
      setIndex(next);
      setPhase('ask');
    }, 900);
    return () => window.clearTimeout(timer);
  }, [celebrating, finish, index, status, steps]);

  const onReturn = useCallback(async () => {
    const waiting = leftRef.current && phaseRef.current === 'sent';
    if (!waiting) leftRef.current = false;
    await refresh();
    if (waiting) {
      leftRef.current = false;
      setPhase('confirm');
    }
  }, [refresh]);

  useEffect(() => {
    const stop = watchNativeEvents({
      pause: () => {
        leftRef.current = true;
      },
      resume: (raw) => {
        applyParsed(parseDeviceStatus(raw));
        if (leftRef.current && phaseRef.current === 'sent') {
          leftRef.current = false;
          setPhase('confirm');
        } else if (phaseRef.current !== 'sent') {
          leftRef.current = false;
        }
        window.setTimeout(() => void refresh(), 600);
      },
    });
    const onVis = () => {
      if (document.visibilityState === 'hidden') leftRef.current = true;
      if (document.visibilityState === 'visible') void onReturn();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onVis);
    };
  }, [applyParsed, onReturn]);

  const followSig = `${follows.matches.length}|${follows.teams.length}|${trendFollows.length}`;
  const followRef = useRef(followSig);
  useEffect(() => {
    const before = followRef.current;
    followRef.current = followSig;
    if (before === followSig) return;
    const previous = before.split('|').reduce((sum, part) => sum + Number(part), 0);
    const current = followSig.split('|').reduce((sum, part) => sum + Number(part), 0);
    if (current > previous) void refresh();
  }, [followSig, refresh]);

  const startAgain = useCallback(() => {
    openFlow(introSteps(status ?? emptyDeviceStatus()));
  }, [openFlow, status]);

  const fixNow = useCallback(() => {
    openFlow(fixSteps(status ?? emptyDeviceStatus()));
  }, [openFlow, status]);

  const advance = useCallback(() => {
    const next = index + 1;
    if (next >= steps.length) {
      void finish();
      return;
    }
    setIndex(next);
    setPhase('ask');
    setNoted(false);
    setCelebrating(null);
  }, [finish, index, steps.length]);

  const onPrimary = useCallback(async () => {
    const step = steps[index];
    if (!step) return;
    if (step === 'notifications') {
      applyStatus(await requestWatchNotifications());
      return;
    }
    if (step === 'battery') {
      applyStatus(await requestBatteryExemption());
      return;
    }
    if (step === 'exact') {
      applyStatus(await requestExactAlarm());
      return;
    }
    if (step === 'autostart') {
      if (phase === 'opened') {
        advance();
        return;
      }
      const opened = await openAutostartSettings();
      if (opened) setPhase('opened');
      return;
    }
    if (phase === 'confirm') {
      await finish();
      return;
    }
    leftRef.current = false;
    const sent = await scheduleBackgroundTest();
    if (sent) {
      leftRef.current = false;
      setPhase('sent');
    }
  }, [advance, applyStatus, finish, index, phase, steps]);

  const onNo = useCallback(() => {
    const next = retrySteps(status ?? emptyDeviceStatus());
    finishing.current = false;
    setSteps(next);
    setIndex(0);
    setPhase('ask');
    setNoted(true);
    setCelebrating(null);
    setOpen(true);
  }, [status]);

  const value = useMemo<AlertSetupContextValue>(
    () => ({
      status,
      showBanner: isNativeApp() && bannerNeeded(finished, open || booting, status),
      applyStatus,
      refresh,
      fixNow,
      startAgain,
    }),
    [status, finished, open, booting, applyStatus, refresh, fixNow, startAgain],
  );

  const step = steps[index];
  const copy = step ? stepCopy(step, status?.oem ?? null, phase) : null;
  const hint = step && !celebrating ? stepHint(step, status?.oem ?? null, phase) : null;
  const previewing = import.meta.env.DEV && new URLSearchParams(window.location.search).has('setupPreview');
  const showOverlay = (isNativeApp() || previewing) && (booting || (open && Boolean(copy)));

  return (
    <AlertSetupContext.Provider value={value}>
      {children}
      {showOverlay && (
        <div className="alert-setup" role="dialog" aria-modal="true" aria-labelledby="alert-setup-title" data-setup={booting ? 'booting' : 'open'} data-setup-step={step ?? ''} data-setup-phase={phase}>
              <p className="alert-setup-kicker">Alerts on this phone</p>
          {booting || !copy || !step ? (
            <h2 id="alert-setup-title">Checking this phone</h2>
          ) : (
            <>
              <div className="alert-setup-progress" aria-hidden="true">
                {steps.map((item, itemIndex) => (
                  <i key={item} className={itemIndex < index || (itemIndex === index && celebrating) ? 'is-on is-done' : itemIndex === index ? 'is-on' : ''} />
                ))}
              </div>
              <p className="alert-setup-count">
                Step {index + 1} of {steps.length}
              </p>
              <h2 id="alert-setup-title">{celebrating ? 'Done' : copy.title}</h2>
              <p className="alert-setup-body">{celebrating ? doneCopy(celebrating) : phase === 'sent' ? sentCopy() : copy.body}</p>
              {hint && <SetupHint hint={hint} />}
              {noted && phase === 'ask' && !celebrating && <p className="alert-setup-note">{retryNote()}</p>}
              <div className="alert-setup-spacer" />
              {celebrating && (
                <p className="setup-done" role="status">
                  <span className="setup-done-mark" aria-hidden="true">
                    ✓
                  </span>
                  This step is on.
                </p>
              )}
              {phase !== 'sent' && !celebrating && (
                <button type="button" className="btn" data-setup-action="primary" onClick={() => void onPrimary()}>
                  {copy.action}
                </button>
              )}
              {phase === 'confirm' && (
                <button type="button" className="btn btn-quiet" data-setup-action="no" onClick={onNo}>
                  No
                </button>
              )}
              {phase !== 'confirm' && (
                <button type="button" className="alert-setup-skip" data-setup-skip onClick={advance}>
                  Skip for now
                </button>
              )}
            </>
          )}
        </div>
      )}
    </AlertSetupContext.Provider>
  );
}

export function useAlertSetup(): AlertSetupContextValue {
  const value = useContext(AlertSetupContext);
  if (!value) throw new Error('useAlertSetup must be used inside AlertSetupProvider');
  return value;
}

export function LiveAlertsBanner() {
  const { showBanner, fixNow } = useAlertSetup();
  if (!showBanner) return null;
  return (
    <button type="button" className="banner banner-alert" data-alert-banner onClick={fixNow}>
      Live alerts are off — Fix now
    </button>
  );
}
