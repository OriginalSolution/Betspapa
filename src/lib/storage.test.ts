import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSettings, migrateNotificationStyle, saveSettings } from './storage';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => data.clear(),
  };
}

describe('goal sound migration', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
  });

  it('maps the old saved choice onto Crowd, Chant, or Off', () => {
    localStorage.setItem('betspapa.settings.v1', JSON.stringify({ goalSound: 'cheer', kickoff: true }));
    expect(loadSettings().goalSound).toBe('crowd');
    expect(loadSettings().goalVolume).toBe(60);

    localStorage.setItem('betspapa.settings.v1', JSON.stringify({ goalSound: 'chant' }));
    expect(loadSettings().goalSound).toBe('chant');

    localStorage.setItem('betspapa.settings.v1', JSON.stringify({ goalSound: 'off' }));
    expect(loadSettings().goalSound).toBe('off');
    localStorage.setItem('betspapa.settings.v1', JSON.stringify({ goalSound: 'papa' }));
    expect(loadSettings().goalSound).toBe('papa');

    localStorage.setItem('betspapa.settings.v1', JSON.stringify({ cheer: false }));
    expect(loadSettings().goalSound).toBe('off');

    localStorage.setItem('betspapa.settings.v1', JSON.stringify({}));
    expect(loadSettings().goalSound).toBe('crowd');
  });

  it('keeps a saved volume and clamps it to the slider', () => {
    localStorage.setItem('betspapa.settings.v1', JSON.stringify({ goalSound: 'afro', goalVolume: 40 }));
    const quiet = loadSettings();
    expect(quiet.goalSound).toBe('afro');
    expect(quiet.goalVolume).toBe(40);

    localStorage.setItem('betspapa.settings.v1', JSON.stringify({ goalVolume: 140 }));
    expect(loadSettings().goalVolume).toBe(100);

    localStorage.setItem('betspapa.settings.v1', JSON.stringify({ goalVolume: -5 }));
    expect(loadSettings().goalVolume).toBe(0);

    const next = loadSettings();
    next.goalSound = 'crowd';
    next.goalVolume = 60;
    saveSettings(next);
    expect(loadSettings().goalSound).toBe('crowd');
    expect(loadSettings().goalVolume).toBe(60);
  });

  it('keeps Auto, Dark, and Light and falls back to Auto', () => {
    expect(migrateNotificationStyle(undefined)).toBe('auto');
    expect(migrateNotificationStyle('system')).toBe('auto');
    expect(loadSettings().notificationStyle).toBe('auto');
    localStorage.setItem('betspapa.settings.v1', JSON.stringify({ notificationStyle: 'dark' }));
    expect(loadSettings().notificationStyle).toBe('dark');
    localStorage.setItem('betspapa.settings.v1', JSON.stringify({ notificationStyle: 'light' }));
    expect(loadSettings().notificationStyle).toBe('light');
    const next = loadSettings();
    next.notificationStyle = 'auto';
    saveSettings(next);
    expect(loadSettings().notificationStyle).toBe('auto');
  });
});
