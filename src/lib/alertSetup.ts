/**
 * Guided live-alert setup.
 * Version 1 was the first walkthrough (app 0.3.2).
 * Version 2 adds the illustrated "tap this" cards, so an install that finished
 * version 1 sees the clearer guide once.
 */
export const ALERT_SETUP_VERSION = 2;
export const ALERT_SETUP_KEY = 'betspapa.alertSetup.v1';

export const OEM_BRANDS = ['transsion', 'xiaomi', 'oppo', 'vivo', 'huawei', 'samsung'] as const;
export type OemBrand = (typeof OEM_BRANDS)[number];
export type AlertStepId = 'notifications' | 'battery' | 'exact' | 'autostart' | 'test';
export type ExactAlarmState = 'granted' | 'denied' | 'unsupported';
export type FlowPhase = 'ask' | 'sent' | 'confirm' | 'opened';

export type AlertDeviceStatus = {
  notifications: 'granted' | 'denied' | 'prompt';
  batteryUnrestricted: boolean;
  exactAlarms: ExactAlarmState;
  oem: OemBrand | null;
  setupVersion: number;
  setupFinished: boolean;
  /** Epoch millis of the last native poll that reached the feeds. 0 means none yet. */
  lastPollAt: number;
  /** Whether the selected cheer can be heard. Off when the user picked Off, or the phone will mute it. */
  notificationSound: 'on' | 'off';
  /** Notifications are allowed, a cheer is selected, and the phone will still not play it. */
  soundBlocked: boolean;
};

export type SetupRecord = {
  version: number;
  finished: boolean;
};

export type StepCopy = {
  title: string;
  body: string;
  action: string;
};

const ORDER: AlertStepId[] = ['notifications', 'battery', 'exact', 'autostart', 'test'];

export const OEM_INSTRUCTION: Record<OemBrand, string> = {
  transsion: 'On Tecno, Infinix, and itel, open Phone Master, turn on Autostart for Betspapa, and lock the app in the recent-apps list so HiOS does not close it.',
  xiaomi: 'On Xiaomi, Redmi, and POCO, open Autostart and allow Betspapa.',
  oppo: 'On Oppo and Realme, open App launch and allow Betspapa to run in the background.',
  vivo: 'On Vivo and iQOO, open Autostart and allow Betspapa.',
  huawei: 'On Huawei and Honor, open App launch and let Betspapa start automatically.',
  samsung: 'On Samsung, open Battery and take Betspapa out of Sleeping apps.',
};

export function parseOem(value: unknown): OemBrand | null {
  return OEM_BRANDS.find((brand) => brand === value) ?? null;
}

export function emptyDeviceStatus(): AlertDeviceStatus {
  return {
    notifications: 'prompt',
    batteryUnrestricted: false,
    exactAlarms: 'unsupported',
    oem: null,
    setupVersion: 0,
    setupFinished: false,
    lastPollAt: 0,
    notificationSound: 'off',
    soundBlocked: false,
  };
}

export function parseDeviceStatus(raw: {
  notifications?: unknown;
  batteryUnrestricted?: unknown;
  exactAlarms?: unknown;
  oem?: unknown;
  setupVersion?: unknown;
  setupFinished?: unknown;
  lastPollAt?: unknown;
  notificationSound?: unknown;
  soundBlocked?: unknown;
} | null | undefined): AlertDeviceStatus {
  const fallback = emptyDeviceStatus();
  if (!raw) return fallback;
  const notifications = raw.notifications === 'granted' || raw.notifications === 'denied' || raw.notifications === 'prompt' ? raw.notifications : fallback.notifications;
  const exactAlarms = raw.exactAlarms === 'granted' || raw.exactAlarms === 'denied' || raw.exactAlarms === 'unsupported' ? raw.exactAlarms : fallback.exactAlarms;
  return {
    notifications,
    batteryUnrestricted: Boolean(raw.batteryUnrestricted),
    exactAlarms,
    oem: parseOem(raw.oem),
    setupVersion: typeof raw.setupVersion === 'number' && Number.isFinite(raw.setupVersion) ? raw.setupVersion : 0,
    setupFinished: Boolean(raw.setupFinished),
    lastPollAt: typeof raw.lastPollAt === 'number' && Number.isFinite(raw.lastPollAt) ? raw.lastPollAt : 0,
    notificationSound: raw.notificationSound === 'on' ? 'on' : 'off',
    soundBlocked: Boolean(raw.soundBlocked),
  };
}

export function parseSetupRecord(raw: string | null): SetupRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SetupRecord>;
    if (!parsed || typeof parsed.version !== 'number' || typeof parsed.finished !== 'boolean') return null;
    return { version: parsed.version, finished: parsed.finished };
  } catch {
    return null;
  }
}

export const POLL_STALE_MS = 10 * 60 * 1000;

/** A poll older than 10 minutes means the background watcher has gone quiet. */
export function pollIsStale(lastPollAt: number, now = Date.now()): boolean {
  return lastPollAt > 0 && now - lastPollAt > POLL_STALE_MS;
}

export function setupIsCurrent(record: SetupRecord | null, version = ALERT_SETUP_VERSION): boolean {
  return Boolean(record && record.finished && record.version >= version);
}

export function nativeSetupIsCurrent(status: Pick<AlertDeviceStatus, 'setupVersion' | 'setupFinished'> | null, version = ALERT_SETUP_VERSION): boolean {
  return Boolean(status && status.setupFinished && status.setupVersion >= version);
}

/** Missing localStorage on a 0.3.1 install is not current, so the walkthrough shows once. */
export function shouldShowIntro(record: SetupRecord | null, nativeCurrent: boolean, version = ALERT_SETUP_VERSION): boolean {
  return !setupIsCurrent(record, version) && !nativeCurrent;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export function readStoredSetup(storage: StorageLike | null): SetupRecord | null {
  if (!storage) return null;
  try {
    return parseSetupRecord(storage.getItem(ALERT_SETUP_KEY));
  } catch {
    return null;
  }
}

export function writeStoredSetup(storage: StorageLike | null, record: SetupRecord) {
  if (!storage) return;
  try {
    storage.setItem(ALERT_SETUP_KEY, JSON.stringify(record));
  } catch {
    /* private mode should not trap the user on the step */
  }
}

export function isStepSatisfied(status: AlertDeviceStatus, step: AlertStepId): boolean {
  if (step === 'notifications') return status.notifications === 'granted';
  if (step === 'battery') return status.batteryUnrestricted;
  if (step === 'exact') return status.exactAlarms !== 'denied';
  return false;
}

/** The first check Android can actually report. Autostart has no public API. */
export function failingStep(status: AlertDeviceStatus): AlertStepId | null {
  if (!isStepSatisfied(status, 'notifications')) return 'notifications';
  if (!isStepSatisfied(status, 'battery')) return 'battery';
  if (!isStepSatisfied(status, 'exact')) return 'exact';
  return null;
}

export function bannerNeeded(finished: boolean, flowOpen: boolean, status: AlertDeviceStatus | null): boolean {
  if (!finished || flowOpen || !status) return false;
  return failingStep(status) !== null;
}

export function stepsFrom(status: AlertDeviceStatus, start: AlertStepId, includeAutostart: boolean): AlertStepId[] {
  const from = ORDER.indexOf(start);
  const steps: AlertStepId[] = [];
  for (const step of ORDER.slice(from)) {
    if (step === 'test') {
      steps.push('test');
      continue;
    }
    if (step === 'autostart') {
      if (includeAutostart && status.oem) steps.push('autostart');
      continue;
    }
    if (step === start || !isStepSatisfied(status, step)) steps.push(step);
  }
  return steps;
}

/** First launch and Run alert setup again. Granted checks are left out. */
export function introSteps(status: AlertDeviceStatus): AlertStepId[] {
  const start = failingStep(status) ?? (status.oem ? 'autostart' : 'test');
  return stepsFrom(status, start, true);
}

/** Banner Fix now. Starts at the failing check and does not detour through Autostart. */
export function fixSteps(status: AlertDeviceStatus): AlertStepId[] {
  const start = failingStep(status) ?? 'test';
  const steps = stepsFrom(status, start, false);
  return steps.length ? steps : ['test'];
}

/** The test alert did not arrive. Go back to the check that is still blocking it. */
export function retrySteps(status: AlertDeviceStatus): AlertStepId[] {
  const start = failingStep(status) ?? (status.oem ? 'autostart' : 'test');
  return stepsFrom(status, start, true);
}

export function nextUnsatisfiedIndex(steps: AlertStepId[], index: number, status: AlertDeviceStatus): number {
  let cursor = Math.max(0, index);
  while (cursor < steps.length && isStepSatisfied(status, steps[cursor]!)) cursor += 1;
  return cursor;
}

export function stepCopy(step: AlertStepId, oem: OemBrand | null, phase: FlowPhase): StepCopy {
  if (step === 'notifications') {
    return {
      title: 'Turn on alerts',
      body: 'This lets goals, kick-off, and full-time show on your phone. On the next screen, tap Allow.',
      action: 'Allow alerts',
    };
  }
  if (step === 'battery') {
    return {
      title: 'Keep Betspapa awake',
      body: 'Phones save battery by stopping apps. Tap Unrestricted so alerts still arrive when Betspapa is closed.',
      action: 'Open battery settings',
    };
  }
  if (step === 'exact') {
    return {
      title: 'Let alerts arrive on time',
      body: 'Turn on the switch next to Betspapa. A goal can be late if this stays off.',
      action: 'Open alarm settings',
    };
  }
  if (step === 'autostart') {
    const phone =
      oem === 'transsion'
        ? 'On Tecno, Infinix, and itel, '
        : oem === 'xiaomi'
          ? 'On Xiaomi, Redmi, and POCO, '
          : oem === 'oppo'
            ? 'On Oppo and Realme, '
            : oem === 'vivo'
              ? 'On Vivo and iQOO, '
              : oem === 'huawei'
                ? 'On Huawei and Honor, '
                : 'On Samsung, ';
    return {
      title: 'Turn on Autostart',
      body: `${phone}the picture shows the switch to turn on.`,
      action: phase === 'opened' ? 'I turned it on' : 'Open Autostart',
    };
  }
  if (phase === 'confirm') {
    return {
      title: 'Did the alert show up?',
      body: 'Look at the top of your phone. It should say Betspapa.',
      action: 'Yes, I saw it',
    };
  }
  return {
    title: 'Send a test alert',
    body: 'We will send one alert in about 10 seconds. Close Betspapa and wait for it.',
    action: 'Send test alert',
  };
}

export type HintControl = 'allow' | 'switch' | 'radio';

export type HintRow = {
  label: string;
  detail?: string;
  control: HintControl;
  on: boolean;
  target: boolean;
};

/** A picture of the system screen, with the control the person should tap marked. */
export type StepHint = {
  screen: string;
  caption: string;
  rows: HintRow[];
};

const APP = 'Betspapa';

function row(label: string, control: HintControl, on: boolean, target: boolean, detail?: string): HintRow {
  return { label, detail, control, on, target };
}

function autostartHint(oem: OemBrand | null): StepHint {
  if (oem === 'transsion') {
    return {
      screen: 'Phone Master · Autostart',
      caption: 'Find Betspapa and tap the switch so it turns on.',
      rows: [row(APP, 'switch', true, true, 'Autostart')],
    };
  }
  if (oem === 'xiaomi') {
    return {
      screen: 'Security · Autostart',
      caption: 'Find Betspapa and tap the switch so it turns on.',
      rows: [row(APP, 'switch', true, true)],
    };
  }
  if (oem === 'oppo') {
    return {
      screen: 'App launch · Betspapa',
      caption: 'Turn on Auto launch and Background activity.',
      rows: [row('Auto launch', 'switch', true, true), row('Background activity', 'switch', true, true)],
    };
  }
  if (oem === 'vivo') {
    return {
      screen: 'Autostart',
      caption: 'Find Betspapa and tap the switch so it turns on.',
      rows: [row(APP, 'switch', true, true)],
    };
  }
  if (oem === 'huawei') {
    return {
      screen: 'App launch · Betspapa',
      caption: 'Choose Manage manually, then turn on Auto-launch.',
      rows: [row('Manage manually', 'radio', true, true), row('Auto-launch', 'switch', true, true)],
    };
  }
  return {
    screen: 'Battery · Betspapa',
    caption: 'Tap Unrestricted. If Betspapa is in Sleeping apps, take it out.',
    rows: [row('Optimized', 'radio', false, false), row('Unrestricted', 'radio', true, true)],
  };
}

export function stepHint(step: AlertStepId, oem: OemBrand | null, phase: FlowPhase): StepHint | null {
  if (phase === 'confirm') return null;
  if (step === 'test' || phase === 'sent') {
    return {
      screen: 'Your notifications',
      caption: 'This card should appear even when Betspapa is closed.',
      rows: [row('Goal · Arsenal', 'allow', true, false, 'Saka scores · Arsenal 1–0 Chelsea')],
    };
  }
  if (step === 'notifications') {
    return {
      screen: 'Allow Betspapa to send notifications?',
      caption: 'Tap Allow. That is the button on the right.',
      rows: [row('Don’t allow', 'allow', false, false), row('Allow', 'allow', true, true)],
    };
  }
  if (step === 'battery') {
    return {
      screen: 'Battery · Betspapa',
      caption: 'Tap Unrestricted so the phone does not put Betspapa to sleep.',
      rows: [row('Optimized', 'radio', false, false), row('Unrestricted', 'radio', true, true)],
    };
  }
  if (step === 'exact') {
    return {
      screen: 'Alarms and reminders',
      caption: 'Tap the switch next to Betspapa so it turns on.',
      rows: [row(APP, 'switch', true, true, 'Allow setting alarms and reminders')],
    };
  }
  return autostartHint(oem);
}

export function doneCopy(step: AlertStepId): string {
  if (step === 'notifications') return 'Alerts are allowed.';
  if (step === 'battery') return 'Betspapa can stay awake.';
  if (step === 'exact') return 'Alerts can arrive on time.';
  if (step === 'autostart') return 'Autostart is on.';
  return 'Test alert sent.';
}

export function sentCopy(): string {
  return 'Close Betspapa now. The test alert should arrive in about 10 seconds.';
}

export function retryNote(): string {
  return 'That test did not arrive. Let’s turn on the step that is still off.';
}
