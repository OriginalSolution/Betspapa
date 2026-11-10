import { isNativeApp } from './nativeHttp';
import type { InboxItem } from '../types';

export type BrowserPermission = NotificationPermission | 'unsupported';

export function readPermission(): BrowserPermission {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

function notificationId(value: string): number {
  let hash = 0;
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return (hash % 2_000_000_000) + 1;
}

export async function requestBrowserPermission(): Promise<BrowserPermission> {
  if (isNativeApp()) {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const result = await LocalNotifications.requestPermissions();
      return result.display === 'granted' ? 'granted' : 'denied';
    } catch {
      return 'unsupported';
    }
  }
  if (typeof Notification === 'undefined') return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

export async function pushBrowserNotification(item: InboxItem) {
  if (isNativeApp()) {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const permission = await LocalNotifications.checkPermissions();
      if (permission.display !== 'granted') return;
      await LocalNotifications.schedule({
        notifications: [
          {
            id: notificationId(item.id),
            title: item.title,
            body: item.body,
            schedule: { at: new Date(Date.now() + 250), allowWhileIdle: true },
          },
        ],
      });
    } catch {
      /* the in-app alert still stands */
    }
    return;
  }
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const url = `/match/${item.matchId}`;
  const options: NotificationOptions = {
    body: item.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: item.id,
    data: { url },
  };
  try {
    const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (registration) {
      await registration.showNotification(item.title, options);
      return;
    }
  } catch {
    /* fall back to a page notification */
  }
  const notification = new Notification(item.title, options);
  notification.onclick = () => {
    window.focus();
    window.location.assign(url);
  };
}

export function vibrateAlert() {
  try {
    navigator.vibrate?.(18);
  } catch {
    /* vibration is optional */
  }
}
