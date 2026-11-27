import { CapacitorHttp } from '@capacitor/core';
import type { Follows, Settings } from '../types';
import { APP_VERSION } from './appVersion';
import { readPushToken, type PushState } from './deviceWatch';
import { isNativeApp, nativeRequestOptions } from './nativeHttp';

/** Same host as the slips feed. The phone posts its token here when FCM is compiled in. */
export const DEVICES_URL = 'https://api.betspapa.com/api/devices';

export type DeviceRegistration = {
  token: string;
  appVersion: string;
  follows: Follows;
  trends: string[];
  bookings: Array<{ id: string; odds: number }>;
  lineupOff?: string[];
  builderSlip?: {
    id: string;
    label?: string;
    legs: Array<{ eventId: string; market: string; home: string; away: string; odds: number; label: string }>;
  } | null;
  /** Every tracked slip. The server alerts each one; booking another does not drop the rest. */
  builderSlips?: Array<{
    id: string;
    label?: string;
    legs: Array<{ eventId: string; market: string; home: string; away: string; odds: number; label: string }>;
  }>;
  /** Slips with the bell on. Each leg gets its own won or lost push, then one for the slip. */
  teamLists?: Array<{ id: string; name: string; list: 'black' | 'green'; crest?: string }>;
  slipBells?: Array<{
    id: string;
    label: string;
    legs: Array<{ eventId: string; market: string; home: string; away: string; odds: number; label: string }>;
  }>;
  settings: Pick<
    Settings,
    'kickoff' | 'goal' | 'red' | 'penalty' | 'ht' | 'ft' | 'var' | 'goalSound' | 'redSound' | 'varSound' | 'penaltySound' | 'promos' | 'lineups' | 'lineupBig' | 'bankerCodes'
  >;
};

let tokenWait: Promise<PushState> | null = null;

/** Play Services often returns the token a few seconds after the first read. */
async function waitForPushToken(): Promise<PushState> {
  const push = await readPushToken();
  if (!push.enabled || push.token) return push;
  if (!tokenWait) {
    tokenWait = (async () => {
      let current = push;
      for (let attempt = 0; current.enabled && !current.token && attempt < 10; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        current = await readPushToken();
      }
      return current;
    })().finally(() => {
      tokenWait = null;
    });
  }
  return tokenWait;
}

const DELETED_KEY = 'betspapa.pushDeleted.v1';

export function pushDeletionHeld(token: string): boolean {
  try {
    return Boolean(token) && localStorage.getItem(DELETED_KEY) === token;
  } catch {
    return false;
  }
}

export function clearPushDeletion() {
  try {
    localStorage.removeItem(DELETED_KEY);
  } catch {
    /* the next registration can still be sent */
  }
}

/** Removes this phone's push registration. A later alert opt-in can register again. */
export async function deletePushDevice(): Promise<'removed' | 'none' | 'failed'> {
  if (!isNativeApp()) return 'none';
  const push = await readPushToken();
  if (!push.enabled || !push.token) return 'none';
  try {
    const response = await CapacitorHttp.request(
      nativeRequestOptions('DELETE', DEVICES_URL, {
        connectMs: 15_000,
        readMs: 20_000,
        headers: { 'Content-Type': 'application/json' },
        body: { token: push.token },
      }),
    );
    if (response.status < 200 || response.status >= 300) return 'failed';
    try {
      localStorage.setItem(DELETED_KEY, push.token);
    } catch {
      /* the server copy is already gone */
    }
    await stashForTokenRefresh('');
    return 'removed';
  } catch {
    return 'failed';
  }
}

/** Registers the FCM token. A build without google-services.json has no token and this is a no-op. */
export async function syncPushDevice(body: Omit<DeviceRegistration, 'token' | 'appVersion'>): Promise<boolean> {
  if (!isNativeApp()) return false;
  const push = await waitForPushToken();
  if (!push.enabled || !push.token || pushDeletionHeld(push.token)) return false;
  const payload: DeviceRegistration = { ...body, token: push.token, appVersion: APP_VERSION };
  const signature = JSON.stringify(payload);
  if (!shouldResend(signature, Date.now())) return true;
  void stashForTokenRefresh(signature);
  try {
    const response = await CapacitorHttp.request(
      nativeRequestOptions('POST', DEVICES_URL, {
        connectMs: 15_000,
        readMs: 20_000,
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      }),
    );
    const ok = response.status >= 200 && response.status < 300;
    if (ok) lastSent = { signature, at: Date.now() };
    return ok;
  } catch {
    return false;
  }
}

/** The same registration is re-sent at most every 10 minutes. Every live tick used to post it again. */
export const RESEND_MS = 10 * 60 * 1000;
let lastSent: { signature: string; at: number } | null = null;

export function shouldResend(signature: string, now: number, last = lastSent): boolean {
  if (!last || last.signature !== signature) return true;
  return now - last.at >= RESEND_MS;
}

/** Native keeps the last body so a token FCM rotates while the app is closed is re-registered without the app. */
async function stashForTokenRefresh(payload: string) {
  try {
    const { registerPlugin } = await import('@capacitor/core');
    const Watch = registerPlugin<{ stashDevice(options: { payload: string }): Promise<void> }>('Watch');
    await Watch.stashDevice({ payload });
  } catch {
    /* an older native shell has no stash; the next app open still registers */
  }
}
