import { useState } from 'react';
import { DEMO_GUIDE } from '../data/catalog';
import { playGoalCheer } from '../lib/cheer';
import type { Settings } from '../types';
import { useStore } from '../state/store';

const toggles: Array<{ key: keyof Settings; label: string; detail: string }> = [
  { key: 'kickoff', label: 'Kick-off', detail: 'When a followed match starts' },
  { key: 'goal', label: 'Goals', detail: 'Including penalties and own goals' },
  { key: 'red', label: 'Red cards', detail: 'Straight reds and second yellows' },
  { key: 'ht', label: 'Half-time', detail: 'The break, and the score at the break' },
  { key: 'ft', label: 'Full-time', detail: 'The final score' },
  { key: 'browser', label: 'Browser alerts', detail: 'Also show a system notification' },
];

export function SettingsPage() {
  const {
    settings,
    setSetting,
    permission,
    requestPermission,
    mode,
    provider,
    pollMs,
    reason,
    restartDemo,
    clearInbox,
    clearFollows,
  } = useStore();
  const [confirm, setConfirm] = useState<'inbox' | 'follows' | null>(null);

  return (
    <div className="settings">
      <section className="panel">
        <h2>Notifications</h2>
        <p className="lede">In-app alerts follow these switches. They start from the moment you follow a match or team.</p>
        <CheerSetting on={settings.cheer} onChange={(value) => setSetting('cheer', value)} />
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
        {mode === 'demo' && (
          <>
            <p className="lede">The clock starts when you open the tab. Restart it to play the scripted events again.</p>
            <ol className="guide guide-block">
              {DEMO_GUIDE.map((item) => (
                <li key={item.after}>
                  <b>{item.after}</b>
                  <span>{item.text}</span>
                </li>
              ))}
            </ol>
            <button type="button" className="btn" onClick={restartDemo}>
              Restart demo clock
            </button>
          </>
        )}
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
          A matchday board for football scores and alerts. Club names identify fixtures. Betspapa is not affiliated with those clubs, the competitions, or SofaScore.
        </p>
      </section>
    </div>
  );
}

function CheerSetting({ on, onChange }: { on: boolean; onChange: (value: boolean) => void }) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="setting cheer-setting">
      <div>
        <strong>Goal cheer</strong>
        <span>A short crowd roar plays with each goal alert, including demo goals.</span>
      </div>
      <div className="setting-controls">
        <button
          type="button"
          className="btn btn-quiet btn-tiny"
          onClick={() => {
            playGoalCheer();
            setPlaying(true);
            window.setTimeout(() => setPlaying(false), 1600);
          }}
        >
          {playing ? 'Playing' : 'Preview'}
        </button>
        <Switch on={on} label="Goal cheer" onChange={onChange} />
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
