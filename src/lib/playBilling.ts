import { registerPlugin } from '@capacitor/core';
import { apiUrl } from './apiJson';
import { isNativeApp, nativeRequestOptions, readJsonBody } from './nativeHttp';
import { CapacitorHttp } from '@capacitor/core';
import { PRO_PRODUCTS, saveEntitlement, type ProEntitlement, type ProProductId } from './proAccess';

type NativeProduct = { id: string; price: string };
type NativePurchase = { productId: string; purchaseToken: string };

interface PlayBillingPlugin {
  products(): Promise<{ products: NativeProduct[] }>;
  purchase(options: { productId: string }): Promise<NativePurchase>;
  restore(): Promise<{ purchases: NativePurchase[] }>;
  acknowledge(options: { purchaseToken: string }): Promise<void>;
}

const PlayBilling = registerPlugin<PlayBillingPlugin>('PlayBilling');

export type PlanPrice = { id: ProProductId; period: string; price: string; fromPlay: boolean };

export function fallbackPlans(): PlanPrice[] {
  return PRO_PRODUCTS.map((item) => ({ id: item.id, period: item.period, price: item.fallback, fromPlay: false }));
}

export function isAndroidApp(): boolean {
  return isNativeApp();
}

async function postVerify(productId: string, purchaseToken: string): Promise<ProEntitlement | null> {
  const path = '/api/pro/verify';
  const url = apiUrl(path);
  const payload = { productId, purchaseToken };
  let body: { entitled?: boolean; productId?: string; expiryMs?: number; error?: string };
  if (isNativeApp()) {
    const response = await CapacitorHttp.request(nativeRequestOptions('POST', url, { body: payload, connectMs: 12_000, readMs: 20_000 }));
    if (response.status < 200 || response.status >= 300) return null;
    body = readJsonBody(response.data) as typeof body;
  } else {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!response.ok) return null;
    body = await response.json();
  }
  if (!body.entitled || typeof body.expiryMs !== 'number' || body.productId !== productId) return null;
  return { productId: productId as ProProductId, expiryMs: body.expiryMs, token: purchaseToken };
}

export async function loadPlayPrices(): Promise<PlanPrice[]> {
  const fallback = fallbackPlans();
  if (!isAndroidApp()) return fallback;
  try {
    const result = await PlayBilling.products();
    const byId = new Map((result.products || []).map((item) => [item.id, item.price]));
    return fallback.map((plan) => {
      const price = byId.get(plan.id);
      return price ? { ...plan, price, fromPlay: true } : plan;
    });
  } catch {
    return fallback;
  }
}

async function accept(purchase: NativePurchase): Promise<ProEntitlement | null> {
  const row = await postVerify(purchase.productId, purchase.purchaseToken);
  if (!row) return null;
  try {
    await PlayBilling.acknowledge({ purchaseToken: purchase.purchaseToken });
  } catch {
    /* Play still has the purchase. Restore can confirm it again. */
  }
  saveEntitlement(row);
  return row;
}

export async function buyPlan(productId: ProProductId): Promise<ProEntitlement | null> {
  if (!isAndroidApp()) return null;
  const purchase = await PlayBilling.purchase({ productId });
  return accept(purchase);
}

export async function restorePlans(): Promise<ProEntitlement | null> {
  if (!isAndroidApp()) return null;
  const result = await PlayBilling.restore();
  let latest: ProEntitlement | null = null;
  for (const purchase of result.purchases || []) {
    const row = await accept(purchase);
    if (row && (!latest || row.expiryMs > latest.expiryMs)) latest = row;
  }
  return latest;
}
