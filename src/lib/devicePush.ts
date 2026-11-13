import { CapacitorHttp } from '@capacitor/core';
import type { Follows, Settings } from '../types';
import { readPushToken } from './deviceWatch';
import { isNativeApp, nativeRequestOptions } from './nativeHttp';

/** Same host as the slips feed. The phone posts its token here when FCM is compiled in. */
export const DEVICES_URL = 'https://api.betspapa.com/api/devices';

export type DeviceRegistration = {
  token: string;
  follows: Follows;
  trends: string[];
  bookings: Array<{ id: string; odds: number }>;
  settings: Pick<
    Settings,
    'kickoff' | 'goal' | 'red' | 'penalty' | 'ht' | 'ft' | 'var' | 'goalSound' | 'redSound' | 'varSound' | 'penaltySound'
  >;
};

/** Registers the FCM token. A build without google-services.json has no token and this is a no-op. */
export async function syncPushDevice(body: Omit<DeviceRegistration, 'token'>): Promise<boolean> {
  if (!isNativeApp()) return false;
  let push = await readPushToken();
  for (let attempt = 0; push.enabled && !push.token && attempt < 8; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    push = await readPushToken();
  }
  if (!push.enabled || !push.token) return false;
  const payload: DeviceRegistration = { token: push.token, ...body };
  try {
    const response = await CapacitorHttp.request(
      nativeRequestOptions('POST', DEVICES_URL, {
        connectMs: 15_000,
        readMs: 20_000,
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      }),
    );
    return response.status >= 200 && response.status < 300;
  } catch {
    return false;
  }
}
