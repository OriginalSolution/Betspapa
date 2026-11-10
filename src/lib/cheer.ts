import type { GoalSound } from '../types';

const URLS: Record<Exclude<GoalSound, 'off'>, string> = {
  cheer: '/sounds/goal-cheer.wav',
  chant: '/sounds/goal-chant.wav',
};

const players = new Map<string, HTMLAudioElement>();

function element(sound: Exclude<GoalSound, 'off'>): HTMLAudioElement {
  const existing = players.get(sound);
  if (existing) return existing;
  const audio = new Audio(URLS[sound]);
  audio.preload = 'auto';
  audio.volume = 1;
  players.set(sound, audio);
  return audio;
}

/** Lets a later goal alert play after the first tap, without waiting on that tap. */
export function unlockGoalCheer() {
  const audio = element('cheer');
  audio.muted = true;
  const attempt = audio.play();
  if (!attempt) return;
  attempt
    .then(() => {
      audio.pause();
      audio.currentTime = 0;
      audio.muted = false;
    })
    .catch(() => {
      audio.muted = false;
    });
}

export function installCheerUnlock() {
  if (typeof window === 'undefined') return;
  window.addEventListener('pointerdown', () => unlockGoalCheer(), { passive: true });
}

/** Plays the selected bundled goal sound from the start. */
export function playGoalSound(sound: GoalSound = 'cheer') {
  if (sound === 'off') return;
  const audio = element(sound);
  audio.muted = false;
  audio.volume = 1;
  audio.currentTime = 0;
  void audio.play().catch(() => {
    /* autoplay can block until the page has been tapped */
  });
}

export function playGoalCheer() {
  playGoalSound('cheer');
}
