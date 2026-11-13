import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_GOAL_VOLUME,
  GOAL_NOTIFICATION_FILE,
  GOAL_SOUND_URL,
  goalNotificationChannel,
  playbackGain,
  shouldPlayInAppCheer,
  playGoalSound,
  resetGoalAudioForTests,
} from './cheer';

class FakeAudio {
  static made: FakeAudio[] = [];
  volume = 1;
  muted = false;
  currentTime = 0;
  preload = 'none';
  src: string;
  played = 0;
  constructor(src: string) {
    this.src = src;
    FakeAudio.made.push(this);
  }
  play() {
    this.played += 1;
    return Promise.resolve();
  }
  pause() {}
}

describe('goal cheer playback', () => {
  beforeEach(() => {
    FakeAudio.made = [];
    resetGoalAudioForTests();
    vi.stubGlobal('Audio', FakeAudio);
  });

  afterEach(() => {
    resetGoalAudioForTests();
    vi.unstubAllGlobals();
  });

  it('previews each bundled file at the slider gain, with no extra boost', () => {
    expect(DEFAULT_GOAL_VOLUME).toBe(60);
    expect(playbackGain(60)).toBe(0.6);
    expect(playbackGain(100)).toBe(1);
    expect(playbackGain(140)).toBe(1);
    expect(playbackGain(-20)).toBe(0);
    expect(playbackGain(Number.NaN)).toBe(0.6);

    playGoalSound('crowd', 60);
    playGoalSound('afro', 60);
    playGoalSound('chant', 60);
    playGoalSound('papa', 60);
    playGoalSound('off', 100);

    const played = FakeAudio.made.map((audio) => ({
      src: audio.src,
      volume: audio.volume,
      played: audio.played,
      muted: audio.muted,
    }));
    expect(goalNotificationChannel('crowd')).toBe('betspapa.goal.crowd.v4');
    expect(goalNotificationChannel('afro')).toBe('betspapa.goal.afro.v4');
    expect(goalNotificationChannel('chant')).toBe('betspapa.goal.chant.v4');
    expect(goalNotificationChannel('papa')).toBe('betspapa.goal.papa.v4');
    expect(goalNotificationChannel('off')).toBe('betspapa.goal.off.v4');
    expect(shouldPlayInAppCheer(true, true, 'granted')).toBe(false);
    expect(shouldPlayInAppCheer(true, false, 'granted')).toBe(true);
    expect(shouldPlayInAppCheer(true, true, 'denied')).toBe(true);
    expect(shouldPlayInAppCheer(false, true, 'granted')).toBe(true);

    expect(played).toEqual([
      { src: GOAL_SOUND_URL.crowd, volume: 0.6, played: 1, muted: false },
      { src: GOAL_SOUND_URL.afro, volume: 0.6, played: 1, muted: false },
      { src: GOAL_SOUND_URL.chant, volume: 0.6, played: 1, muted: false },
      { src: GOAL_SOUND_URL.papa, volume: 0.6, played: 1, muted: false },
    ]);

    playGoalSound('afro', 25);
    expect(FakeAudio.made[1]?.volume).toBe(0.25);
    expect(FakeAudio.made[1]?.played).toBe(2);

    console.info(
      [
        `preview crowd ${GOAL_SOUND_URL.crowd} gain ${playbackGain(60)} file ${GOAL_NOTIFICATION_FILE.crowd} channel ${goalNotificationChannel('crowd')}`,
        `preview afro ${GOAL_SOUND_URL.afro} gain ${playbackGain(60)} file ${GOAL_NOTIFICATION_FILE.afro} channel ${goalNotificationChannel('afro')}`,
        `preview chant ${GOAL_SOUND_URL.chant} gain ${playbackGain(60)} file ${GOAL_NOTIFICATION_FILE.chant} channel ${goalNotificationChannel('chant')}`,
        `preview papa ${GOAL_SOUND_URL.papa} gain ${playbackGain(60)} file ${GOAL_NOTIFICATION_FILE.papa} channel ${goalNotificationChannel('papa')}`,
        `preview off channel ${goalNotificationChannel('off')} (no file, gain not applied)`,
      ].join('\n'),
    );
  });
});
