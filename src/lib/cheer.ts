const CHEER_URL = '/sounds/goal-cheer.wav';

let cheer: HTMLAudioElement | null = null;

function element(): HTMLAudioElement {
  if (!cheer) {
    cheer = new Audio(CHEER_URL);
    cheer.preload = 'auto';
    cheer.volume = 0.55;
  }
  return cheer;
}

/** Lets a later goal alert play after the first tap, without waiting on that tap. */
export function unlockGoalCheer() {
  const audio = element();
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
  const unlock = () => unlockGoalCheer();
  window.addEventListener('pointerdown', unlock, { passive: true });
}

/** Plays the bundled roar from the start. Safe to call when a goal alert is delivered. */
export function playGoalCheer() {
  const audio = element();
  audio.muted = false;
  audio.volume = 0.55;
  audio.currentTime = 0;
  void audio.play().catch(() => {
    /* autoplay can block until the page has been tapped */
  });
}
