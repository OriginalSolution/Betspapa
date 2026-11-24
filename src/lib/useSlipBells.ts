import { useSyncExternalStore } from 'react';
import { bellSnapshot, subscribeBells, type SlipBell } from './slipBells';

export function useSlipBells(): Record<string, SlipBell> {
  return useSyncExternalStore(subscribeBells, bellSnapshot, bellSnapshot);
}
