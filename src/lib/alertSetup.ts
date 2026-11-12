/**
 * Guided live-alert setup. Version 1 is the first walkthrough (app 0.3.2).
 * Installs from 0.3.1 have no record, so they see it once after updating.
 */
export const ALERT_SETUP_VERSION = 1;
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
  transsion: 'On Tecno, Infinix, and itel, open Phone Master and turn on Autostart for Betspapa.',
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
  };
}

export function parseDeviceStatus(raw: {
  notifications?: unknown;
  batteryUnrestricted?: unknown;
  exactAlarms?: unknown;
  oem?: unknown;
  setupVersion?: unknown;
  setupFinished?: unknown;
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
      title: 'Allow notifications',
      body: 'Live goals, kick-off, and full-time need permission to appear on this phone.',
      action: 'Allow notifications',
    };
  }
  if (step === 'battery') {
    return {
      title: 'Allow background activity',
      body: 'Battery optimization can stop those alerts when Betspapa is closed. Allow background activity so the watcher keeps running.',
      action: 'Allow background activity',
    };
  }
  if (step === 'exact') {
    return {
      title: 'Allow exact alarms',
      body: 'Android 12 and newer can delay an alert unless Betspapa may schedule an exact alarm.',
      action: 'Allow exact alarms',
    };
  }
  if (step === 'autostart') {
    return {
      title: 'Turn on Autostart',
      body: OEM_INSTRUCTION[oem ?? 'samsung'],
      action: phase === 'opened' ? "I've turned it on" : 'Open autostart settings',
    };
  }
  if (phase === 'confirm') {
    return {
      title: 'Did you get it?',
      body: 'The test alert is sent with Betspapa closed. It should be in your notifications.',
      action: 'Yes',
    };
  }
  return {
    title: 'Test it',
    body: 'We send one alert in about 10 seconds. Leave Betspapa, then come back.',
    action: 'Send test notification',
  };
}

export function sentCopy(): string {
  return 'Leave Betspapa now. The test alert should arrive in about 10 seconds.';
}

export function retryNote(): string {
  return 'That test did not arrive. This step is still blocking live alerts.';
}
