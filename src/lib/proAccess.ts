import { PRO_UI_ENABLED } from './proFlag';
import type { CodeTier } from './pickCodes';

export const PRO_PRODUCTS = [
  { id: 'betspapa_pro_weekly', fallback: 'GHS 15', period: 'week' },
  { id: 'betspapa_pro_monthly', fallback: 'GHS 45', period: 'month' },
  { id: 'betspapa_pro_yearly', fallback: 'GHS 399', period: 'year' },
] as const;

export type ProProductId = (typeof PRO_PRODUCTS)[number]['id'];

/** Free follows, teams and matches together. Pro is not capped. */
export const FREE_FOLLOW_LIMIT = 5;

/** A code whose first kick-off is further away than this is an early code. */
export const EARLY_CODE_MS = 6 * 60 * 60 * 1000;

const ENTITLEMENT_KEY = 'betspapa.pro.v1';
const REWARD_KEY = 'betspapa.proCode.v1';

export type ProEntitlement = { productId: ProProductId; expiryMs: number; token: string };

export function limitsApply(): boolean {
  return PRO_UI_ENABLED;
}

export function loadEntitlement(): ProEntitlement | null {
  try {
    const raw = JSON.parse(localStorage.getItem(ENTITLEMENT_KEY) || 'null') as ProEntitlement | null;
    if (!raw || typeof raw.expiryMs !== 'number' || typeof raw.productId !== 'string' || typeof raw.token !== 'string') return null;
    if (!PRO_PRODUCTS.some((item) => item.id === raw.productId)) return null;
    return raw;
  } catch {
    return null;
  }
}

export function saveEntitlement(row: ProEntitlement | null) {
  try {
    if (!row) localStorage.removeItem(ENTITLEMENT_KEY);
    else localStorage.setItem(ENTITLEMENT_KEY, JSON.stringify(row));
  } catch {
    /* a private store must not block the board */
  }
}

export function isEntitled(row: ProEntitlement | null, now = Date.now()): boolean {
  return Boolean(row && row.expiryMs > now);
}

/** Flag off keeps today's access. Flag on requires a verified Play subscription. */
export function hasPro(now = Date.now()): boolean {
  if (!limitsApply()) return true;
  return isEntitled(loadEntitlement(), now);
}

export function canSeeTier(tier: CodeTier, pro = hasPro(), limitsOn = limitsApply()): boolean {
  if (!limitsOn || pro) return true;
  return tier === '80';
}

export function canAddFollow(count: number, pro = hasPro(), limitsOn = limitsApply()): boolean {
  if (!limitsOn || pro) return true;
  return count < FREE_FOLLOW_LIMIT;
}

export function canUseSavedFilters(pro = hasPro(), limitsOn = limitsApply()): boolean {
  return !limitsOn || pro;
}

export function canUseLineupAlerts(pro = hasPro(), limitsOn = limitsApply()): boolean {
  return !limitsOn || pro;
}

export function isEarlyCode(firstKick: string | null | undefined, now = Date.now()): boolean {
  const kick = Date.parse(firstKick || '');
  if (!Number.isFinite(kick)) return false;
  return kick - now > EARLY_CODE_MS;
}

type Reward = { day: string; code: string };

function todayKey(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function loadReward(now = Date.now()): Reward | null {
  try {
    const raw = JSON.parse(localStorage.getItem(REWARD_KEY) || 'null') as Reward | null;
    if (!raw || raw.day !== todayKey(now) || typeof raw.code !== 'string' || !raw.code) return null;
    return raw;
  } catch {
    return null;
  }
}

export function saveReward(code: string, now = Date.now()) {
  try {
    localStorage.setItem(REWARD_KEY, JSON.stringify({ day: todayKey(now), code }));
  } catch {
    /* the code can still be shown this session */
  }
}

export function canSeeCode(
  code: string,
  firstKick: string | null | undefined,
  pro = hasPro(),
  now = Date.now(),
  limitsOn = limitsApply(),
  rewardedCode = loadReward(now)?.code || '',
): boolean {
  if (!limitsOn || pro) return true;
  if (!isEarlyCode(firstKick, now)) return true;
  return rewardedCode === code;
}
