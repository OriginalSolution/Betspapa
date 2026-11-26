import { registerPlugin } from '@capacitor/core';
import { isNativeApp } from './nativeHttp';

/**
 * Google's public test units. Real AdMob unit ids are not in this build.
 * Banner: ca-app-pub-3940256099942544/6300978111
 * Rewarded: ca-app-pub-3940256099942544/5224354917
 * App id: ca-app-pub-3940256099942544~3347511713
 */
interface AdsPlugin {
  placeBanner(options: { x: number; y: number; width: number; height: number }): Promise<void>;
  hideBanner(): Promise<void>;
  showRewarded(): Promise<{ rewarded: boolean }>;
}

const Ads = registerPlugin<AdsPlugin>('Ads');

export function adsOnAndroid(): boolean {
  return isNativeApp();
}

export async function placeTestBanner(box: { x: number; y: number; width: number; height: number }) {
  if (!adsOnAndroid()) return;
  await Ads.placeBanner(box);
}

export async function hideTestBanner() {
  if (!adsOnAndroid()) return;
  try {
    await Ads.hideBanner();
  } catch {
    /* the slot can leave without a banner */
  }
}

/** Opt-in only. Resolves true when the test video grants the reward. */
export async function showTestRewarded(): Promise<boolean> {
  if (!adsOnAndroid()) return false;
  try {
    const result = await Ads.showRewarded();
    return Boolean(result.rewarded);
  } catch {
    return false;
  }
}
