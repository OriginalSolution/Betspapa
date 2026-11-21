import { CapacitorHttp } from '@capacitor/core';
import type { Follows, Settings } from '../types';
import { APP_VERSION } from './appVersion';
import { readPushToken } from './deviceWatch';
import { isNativeApp, nativeRequestOptions } from './nativeHttp';

/** Same host as the slips feed. The phone posts its token here when FCM is compiled in. */
export const DEVICES_URL = 'https://api.betspapa.com/api/devices';

export type DeviceRegistration = {
  token: string;
  appVersion: string;
  follows: Follows;
  trends: string[];
  bookings: Array<{ id: string; odds: number }>;
  settings: Pick<
    Settings,
    'kickoff' | 'goal' | 'red' | 'penalty' | 'ht' | 'ft' | 'var' | 'goalSound' | 'redSound' | 'varSound' | 'penaltySound' | 'promos'
  >;
};

let tokenWait: Promise<{ token: string; enabled: boolean }> | null = null;

/** Play Services often returns the token a few seconds after the first read. */
async function waitForPushToken(): Promise<{ token: string; enabled: boolean }> {
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

/** Registers the FCM token. A build without google-services.json has no token and this is a no-op. */
export async function syncPushDevice(body: Omit<DeviceRegistration, 'token' | 'appVersion'>): Promise<boolean> {
  if (!isNativeApp()) return false;
  const push = await waitForPushToken();
  if (!push.enabled || !push.token) return false;
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
