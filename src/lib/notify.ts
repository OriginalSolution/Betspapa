import type { GoalSound, InboxItem, Match } from '../types';
import { eventNotificationChannel, goalNotificationChannel } from './cheer';
import { isNativeApp } from './nativeHttp';

export type BrowserPermission = NotificationPermission | 'unsupported';

export function readPermission(): BrowserPermission {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

/** Creates the goal channels before any post. A missing channel drops the notification on Android 8+. */
export async function ensureGoalChannels(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const channels: Array<{ id: string; name: string; sound?: string }> = [
      { id: goalNotificationChannel('crowd'), name: 'Goal · Crowd', sound: 'cheer_crowd.mp3' },
      { id: goalNotificationChannel('afro'), name: 'Goal · Afrobeats', sound: 'cheer_afro.mp3' },
      { id: goalNotificationChannel('chant'), name: 'Goal · Chant', sound: 'cheer_chant.mp3' },
      { id: goalNotificationChannel('papa'), name: 'Goal · Papa Shout', sound: 'cheer_papa.ogg' },
      { id: goalNotificationChannel('horn'), name: 'Goal · Horn', sound: 'goal_horn.ogg' },
      { id: goalNotificationChannel('arp'), name: 'Goal · Arpeggio', sound: 'goal_arp.ogg' },
      { id: goalNotificationChannel('off'), name: 'Goal · Silent' },
      { id: eventNotificationChannel('red'), name: 'Red card', sound: 'red_card.ogg' },
      { id: eventNotificationChannel('var'), name: 'VAR check', sound: 'var_check.ogg' },
      { id: eventNotificationChannel('penalty'), name: 'Penalty', sound: 'penalty.ogg' },
    ];
    for (const channel of channels) {
      await LocalNotifications.createChannel({
        id: channel.id,
        name: channel.name,
        description: 'Betspapa match alerts',
        importance: 4,
        visibility: 1,
        vibration: channel.id !== goalNotificationChannel('off'),
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

export async function pushBrowserNotification(item: InboxItem, goalSound: GoalSound = 'crowd', match?: Match | null) {
  if (isNativeApp()) {
    try {
      const { registerPlugin } = await import('@capacitor/core');
      const Watch = registerPlugin<{ present(options: { payload: string }): Promise<void> }>('Watch');
      const payload = {
        id: item.id,
        matchId: item.matchId,
        kind: item.kind,
        title: item.title,
        body: item.body,
        goalSound,
        varCheck: item.kind === 'var',
        minute: match?.minute ?? null,
        player: match?.events.find((event) => event.id === item.id)?.player || '',
        home: match?.home.shortName,
        away: match?.away.shortName,
        homeFull: match?.home.name,
        awayFull: match?.away.name,
        homeAbbr: match?.home.abbr,
        awayAbbr: match?.away.abbr,
        homeColor: match?.home.color,
        awayColor: match?.away.color,
        homeCrest: match?.home.crest || '',
        awayCrest: match?.away.crest || '',
        competition: match?.competition?.name || '',
        homeScore: match?.homeScore,
        awayScore: match?.awayScore,
      };
      await Watch.present({ payload: JSON.stringify(payload) });
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
