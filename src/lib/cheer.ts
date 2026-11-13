import type { EventSound, GoalSound } from '../types';

export type PlayableGoalSound = Exclude<GoalSound, 'off'>;

/** Bundled cheers. Peaks sit near −8 dBFS. Playback does not boost them. */
export const GOAL_SOUND_URL: Record<PlayableGoalSound, string> = {
  crowd: '/sounds/cheer-crowd.mp3',
  afro: '/sounds/cheer-afro.mp3',
  chant: '/sounds/cheer-chant.mp3',
  papa: '/sounds/cheer-papa.mp3',
  horn: '/sounds/goal-horn.ogg',
  arp: '/sounds/goal-arp.ogg',
};

/** Android res/raw file, including the extension Capacitor expects on API 24–25. */
export const GOAL_NOTIFICATION_FILE: Record<PlayableGoalSound, string> = {
  crowd: 'cheer_crowd.mp3',
  afro: 'cheer_afro.mp3',
  chant: 'cheer_chant.mp3',
  papa: 'cheer_papa.ogg',
  horn: 'goal_horn.ogg',
  arp: 'goal_arp.ogg',
};

/** Dedicated stings. Licence: docs/sfx-LICENSE.md (CC0). */
export const EVENT_SOUND_URL: Record<EventSound, string> = {
  red: '/sounds/red-card.ogg',
  var: '/sounds/var-check.ogg',
  penalty: '/sounds/penalty.ogg',
};

export const EVENT_NOTIFICATION_FILE: Record<EventSound, string> = {
  red: 'red_card.ogg',
  var: 'var_check.ogg',
  penalty: 'penalty.ogg',
};

export function eventNotificationChannel(kind: EventSound): string {
  if (kind === 'red') return 'betspapa.redcard.v1';
  if (kind === 'var') return 'betspapa.var.v1';
  return 'betspapa.penalty.v1';
}

/**
 * One notification channel per cheer. v4 replaced the unversioned ids, which
 * were created with a resource URI HiOS does not play. Keep these in step with AlertPoster.
 */
export function goalNotificationChannel(sound: GoalSound): string {
  const name = sound === 'afro' || sound === 'chant' || sound === 'papa' || sound === 'horn' || sound === 'arp' || sound === 'off' ? sound : 'crowd';
  return `betspapa.goal.${name}.v4`;
}

/**
 * On the phone, a granted browser alert plays through the notification channel
 * even while the page is open. The WebView must not play a second copy.
 * The preview button and the website still use the in-app player.
 */
export function shouldPlayInAppCheer(native: boolean, browserAlerts: boolean, permission: string): boolean {
  return !(native && browserAlerts && permission === 'granted');
}

export const DEFAULT_GOAL_VOLUME = 60;

/**
 * Linear in-app gain from the Settings slider.
 * 60% is 0.6. 100% is 1. Nothing is multiplied on top.
 */
export function playbackGain(percent: number): number {
  if (typeof percent !== 'number' || !Number.isFinite(percent)) return DEFAULT_GOAL_VOLUME / 100;
  const clamped = Math.min(100, Math.max(0, percent));
  return clamped / 100;
}

type SoundHandle = {
  src: string;
  volume: number;
  muted: boolean;
  currentTime: number;
  preload: string;
  play: () => Promise<void> | void;
  pause: () => void;
};

const players = new Map<PlayableGoalSound, SoundHandle>();

function element(sound: PlayableGoalSound): SoundHandle {
  const existing = players.get(sound);
  if (existing) return existing;
  const audio = new Audio(GOAL_SOUND_URL[sound]);
  audio.preload = 'auto';
  audio.volume = playbackGain(DEFAULT_GOAL_VOLUME);
  players.set(sound, audio);
  return audio;
}

/** Lets a later goal alert play after the first tap, without waiting on that tap. */
export function unlockGoalCheer() {
  (Object.keys(GOAL_SOUND_URL) as PlayableGoalSound[]).forEach((sound) => {
    const audio = element(sound);
    const previous = audio.volume;
    audio.muted = true;
    audio.volume = 0;
    const attempt = audio.play();
    if (!attempt) return;
    void Promise.resolve(attempt)
      .then(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.muted = false;
        audio.volume = previous;
      })
      .catch(() => {
        audio.muted = false;
        audio.volume = previous;
      });
  });
}

export function installCheerUnlock() {
  if (typeof window === 'undefined') return;
  window.addEventListener('pointerdown', () => unlockGoalCheer(), { passive: true });
}

const eventPlayers = new Map<EventSound, SoundHandle>();

function eventElement(sound: EventSound): SoundHandle {
  const existing = eventPlayers.get(sound);
  if (existing) return existing;
  const audio = new Audio(EVENT_SOUND_URL[sound]);
  audio.preload = 'auto';
  audio.volume = 1;
  eventPlayers.set(sound, audio);
  return audio;
}

/** In-app preview of a red-card, VAR, or penalty sting. The phone notification uses the channel. */
export function playEventSound(sound: EventSound) {
  const audio = eventElement(sound);
  audio.muted = false;
  audio.volume = 1;
  audio.currentTime = 0;
  void Promise.resolve(audio.play()).catch(() => {
    /* autoplay can block until the page has been tapped */
  });
}

/** Plays the selected bundled goal sound from the start, at the slider gain. */
export function playGoalSound(sound: GoalSound = 'crowd', volume: number = DEFAULT_GOAL_VOLUME) {
  if (sound === 'off') return;
  const audio = element(sound);
  audio.muted = false;
  audio.volume = playbackGain(volume);
  audio.currentTime = 0;
  void Promise.resolve(audio.play()).catch(() => {
    /* autoplay can block until the page has been tapped */
  });
}

export function resetGoalAudioForTests() {
  players.clear();
  eventPlayers.clear();
}
