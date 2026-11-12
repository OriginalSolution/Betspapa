import type { GoalSound, InboxItem } from '../types';
import { GOAL_NOTIFICATION_FILE, goalNotificationChannel } from './cheer';
import { isNativeApp } from './nativeHttp';

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

/** Creates the goal channels before any post. A missing channel drops the notification on Android 8+. */
export async function ensureGoalChannels(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const channels: Array<{ id: string; name: string; sound?: string }> = [
      { id: 'betspapa.goal.crowd', name: 'Goal · Crowd', sound: 'cheer_crowd.mp3' },
      { id: 'betspapa.goal.afro', name: 'Goal · Afrobeats', sound: 'cheer_afro.mp3' },
      { id: 'betspapa.goal.chant', name: 'Goal · Chant', sound: 'cheer_chant.mp3' },
      { id: 'betspapa.goal.off', name: 'Goal · Silent' },
      { id: 'betspapa.alerts', name: 'Match alerts' },
    ];
    for (const channel of channels) {
      await LocalNotifications.createChannel({
        id: channel.id,
        name: channel.name,
        description: 'Betspapa match alerts',
        importance: 5,
        visibility: 1,
        vibration: channel.id !== 'betspapa.goal.off',
        ...(channel.sound ? { sound: channel.sound } : {}),
      });
    }
  } catch {
    /* the native watcher creates the same channel ids before it posts */
  }
}

export async function readNativePermission(): Promise<BrowserPermission> {
  if (!isNativeApp()) return readPermission();
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await ensureGoalChannels();
    const result = await LocalNotifications.checkPermissions();
    if (result.display === 'granted') return 'granted';
    if (result.display === 'denied') return 'denied';
    return 'default';
  } catch {
    return 'unsupported';
  }
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

export async function pushBrowserNotification(item: InboxItem, goalSound: GoalSound = 'crowd') {
  if (isNativeApp()) {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const permission = await LocalNotifications.checkPermissions();
      if (permission.display !== 'granted') return;
      const goal = item.kind === 'goal';
      const channelId = goal ? goalNotificationChannel(goalSound) : undefined;
      const sound = goal && goalSound !== 'off' ? GOAL_NOTIFICATION_FILE[goalSound] : undefined;
      await LocalNotifications.schedule({
        notifications: [
          {
            id: notificationId(item.id),
            title: item.title,
            body: item.body,
            schedule: { at: new Date(Date.now() + 250), allowWhileIdle: true },
            ...(channelId ? { channelId } : {}),
            ...(sound ? { sound } : {}),
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
