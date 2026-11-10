import { bookAll, type DeviceBookResult } from '../../server/bookers.mjs';
import type { SharePayload } from '../data/board';
import { nativeBookRequest } from './nativeHttp';

export async function bookOnDevice(
  legs: Array<{ eventId: string; market: string; odds: number; match: string }>,
  onUpdate: (payload: SharePayload) => void,
  stopped: () => boolean,
): Promise<void> {
  const seen: Record<string, DeviceBookResult> = {};
  const books = await bookAll(legs, nativeBookRequest, (name, result) => {
    seen[name] = result;
    if (stopped()) return;
    onUpdate({ status: 'pending', books: { ...seen } });
  });
  if (!stopped()) onUpdate({ status: 'ready', books });
}
