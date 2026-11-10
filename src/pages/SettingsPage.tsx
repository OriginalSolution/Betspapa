import { useState } from 'react';
import { playGoalSound } from '../lib/cheer';
import type { GoalSound } from '../types';
import { useStore } from '../state/store';

const toggles: Array<{ key: 'kickoff' | 'goal' | 'red' | 'ht' | 'ft' | 'var' | 'browser'; label: string; detail: string }> = [
  { key: 'kickoff', label: 'Kick-off', detail: 'When a followed match starts, including if you open the app after kick-off' },
  { key: 'goal', label: 'Goals', detail: 'Including penalties and own goals' },
  { key: 'red', label: 'Red cards', detail: 'Straight reds and second yellows' },
  { key: 'ht', label: 'Half-time', detail: 'The break, and the score at the break' },
  { key: 'ft', label: 'Full-time', detail: 'The final score' },
  { key: 'var', label: 'VAR reviews', detail: 'Tell me a goal is being checked, before it counts' },
  { key: 'browser', label: 'Browser alerts', detail: 'Also show a system notification' },
];

export function SettingsPage() {
  const {
    settings,
    setSetting,
    permission,
    requestPermission,
    provider,
    pollMs,
    reason,
    clearInbox,
    clearFollows,
  } = useStore();
  const [confirm, setConfirm] = useState<'inbox' | 'follows' | null>(null);

  return (
    <div className="settings">
      <section className="panel">
        <h2>Notifications</h2>
        <p className="lede">In-app alerts follow these switches. They start from the moment you follow a match or team.</p>
        <GoalSoundSetting sound={settings.goalSound} onChange={(value) => setSetting('goalSound', value)} />
        <Permission permission={permission} onEnable={() => void requestPermission()} />
        {toggles.map((toggle) => (
          <div className="setting" key={toggle.key}>
            <div>
              <strong>{toggle.label}</strong>
              <span>{toggle.detail}</span>
            </div>
            <Switch on={settings[toggle.key]} label={toggle.label} onChange={(value) => setSetting(toggle.key, value)} />
          </div>
        ))}
      </section>

      <section className="panel">
        <h2>Fixtures</h2>
        <p className="lede">Today’s board is real kickoffs and prices. There is no simulated matchday.</p>
        <h2>Scores</h2>
        <div className="stat">
          <span>Source</span>
          <strong>{provider}</strong>
        </div>
        <div className="stat">
          <span>Refresh</span>
          <strong>Every {Math.round(pollMs / 1000)} seconds</strong>
        </div>
        {reason && <p className="lede">{reason}</p>}
      </section>

      <section className="panel">
        <h2>On this device</h2>
        <p className="lede">Follows and alerts stay in this browser. Clearing them does not affect anyone else.</p>
        <div className="danger-row">
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => {
              if (confirm === 'follows') {
                clearFollows();
                setConfirm(null);
              } else setConfirm('follows');
            }}
          >
            {confirm === 'follows' ? 'Confirm unfollow all' : 'Clear follows'}
          </button>
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => {
              if (confirm === 'inbox') {
                clearInbox();
                setConfirm(null);
              } else setConfirm('inbox');
            }}
          >
            {confirm === 'inbox' ? 'Confirm clear alerts' : 'Clear alerts'}
          </button>
        </div>
      </section>

      <section className="panel about">
        <h2>Betspapa</h2>
        <p>
          A matchday board for scores, trends, picks, and slips. Club names identify fixtures. Fixtures and prices come from Betspapa. Share codes are issued only when a bookmaker accepts the slip.
        </p>
      </section>
    </div>
  );
}

const goalSounds: Array<{ id: GoalSound; label: string }> = [
  { id: 'cheer', label: 'Cheer' },
  { id: 'chant', label: 'Latin chant' },
  { id: 'off', label: 'Off' },
];

function GoalSoundSetting({ sound, onChange }: { sound: GoalSound; onChange: (value: GoalSound) => void }) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="setting cheer-setting">
      <div>
        <strong>Goal sound</strong>
        <span>Cheer is the roar. Latin chant is a short festive gol / olé. Off keeps alerts silent.</span>
      </div>
      <div className="setting-controls">
        <div className="chips sound-choices" role="radiogroup" aria-label="Goal sound">
          {goalSounds.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={sound === option.id}
              className={sound === option.id ? 'chip is-on' : 'chip'}
              onClick={() => onChange(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-quiet btn-tiny"
          disabled={sound === 'off'}
          onClick={() => {
            if (sound === 'off') return;
            playGoalSound(sound);
            setPlaying(true);
            window.setTimeout(() => setPlaying(false), 2200);
          }}
        >
          {playing ? 'Playing' : 'Preview'}
        </button>
      </div>
    </div>
  );
}

function Permission({ permission, onEnable }: { permission: string; onEnable: () => void }) {
  if (permission === 'unsupported') return <p className="lede">This browser does not offer system notifications. In-app alerts still work.</p>;
  if (permission === 'denied') {
    return <p className="lede">Notifications are blocked. Allow them for this site in the browser site settings, then reload.</p>;
  }
  if (permission === 'granted') return <p className="status-ok">Browser alerts are on.</p>;
  return (
    <button type="button" className="btn" onClick={onEnable}>
      Enable browser alerts
    </button>
  );
}

function Switch({ on, label, onChange }: { on: boolean; label: string; onChange: (value: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={on ? 'switch on' : 'switch'} onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}
