import { useState } from 'react';
import { useAlertSetup } from '../components/AlertSetup';
import { playEventSound, playGoalSound } from '../lib/cheer';
import { OEM_INSTRUCTION, pollIsStale } from '../lib/alertSetup';
import { openNotificationSound, requestBatteryExemption, requestExactAlarm, requestWatchNotifications, scheduleBackgroundTest } from '../lib/deviceWatch';
import { isNativeApp } from '../lib/nativeHttp';
import type { GoalSound, NotificationStyle } from '../types';
import { useStore } from '../state/store';

const toggles: Array<{ key: 'kickoff' | 'goal' | 'red' | 'penalty' | 'ht' | 'ft' | 'var' | 'browser' | 'promos'; label: string; detail: string }> = [
  { key: 'promos', label: 'Promos', detail: 'Booking-code cards, match posters, and the Saturday bankers flyer' },
  { key: 'kickoff', label: 'Kick-off', detail: 'When a followed match starts, including if you open the app after kick-off' },
  { key: 'goal', label: 'Goals', detail: 'Including own goals. A scored penalty also uses the penalty sound' },
  { key: 'red', label: 'Red cards', detail: 'Straight reds and second yellows' },
  { key: 'penalty', label: 'Penalties', detail: 'When a penalty is awarded or scored for a followed match' },
  { key: 'ht', label: 'Half-time', detail: 'The break, and the score at the break' },
  { key: 'ft', label: 'Full-time', detail: 'The final score' },
  { key: 'var', label: 'VAR reviews', detail: 'Tell me a goal is being checked, before it counts' },
  { key: 'browser', label: 'Browser alerts', detail: 'Also show a system notification, including when Betspapa is not on screen' },
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
        <p className="lede">In-app alerts follow these switches. They start from the moment you follow a match or team. With browser alerts on, the phone posts them on the home screen, in another app, and with the screen off.</p>
        <p className="lede">While a followed match is about to kick off or in play, Android keeps a low-priority notice: Betspapa is watching N live matches. That notice stays up with the app closed, and it stops when the match ends.</p>
        <NotificationStyleSetting
          value={settings.notificationStyle}
          onChange={(value) => setSetting('notificationStyle', value)}
        />
        {isNativeApp() ? <AndroidWatchStatus /> : <Permission permission={permission} onEnable={() => void requestPermission()} />}
        <GoalSoundSetting
          sound={settings.goalSound}
          volume={settings.goalVolume}
          onChange={(value) => setSetting('goalSound', value)}
          onVolume={(value) => setSetting('goalVolume', value)}
        />
        <EventSoundSetting
          label="Red card sound"
          detail="Pea whistle and a short brass stab. Off still posts the alert, with no sound."
          on={settings.redSound}
          onToggle={(value) => setSetting('redSound', value)}
          onTest={() => {
            playEventSound('red');
            void scheduleBackgroundTest({ kind: 'red' });
          }}
        />
        <EventSoundSetting
          label="VAR sound"
          detail="A suspense build for a goal that is being checked."
          on={settings.varSound}
          onToggle={(value) => setSetting('varSound', value)}
          onTest={() => {
            playEventSound('var');
            void scheduleBackgroundTest({ kind: 'var' });
          }}
        />
        <EventSoundSetting
          label="Penalty sound"
          detail="Two referee tweets and a punch. Used when a penalty is awarded or scored."
          on={settings.penaltySound}
          onToggle={(value) => setSetting('penaltySound', value)}
          onTest={() => {
            playEventSound('penalty');
            void scheduleBackgroundTest({ kind: 'penalty' });
          }}
        />
        {toggles.map((toggle) => (
          <div className="setting" key={toggle.key}>
            <div>
              <strong>{toggle.label}</strong>
              <span>{toggle.detail}</span>
            </div>
            <Switch
              on={settings[toggle.key]}
              label={toggle.label}
              onChange={(value) => {
                setSetting(toggle.key, value);
                if (toggle.key === 'browser' && value && isNativeApp()) void requestWatchNotifications();
              }}
            />
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
  { id: 'crowd', label: 'Crowd' },
  { id: 'afro', label: 'Afrobeats' },
  { id: 'chant', label: 'Chant' },
  { id: 'papa', label: 'Papa Shout' },
  { id: 'horn', label: 'Horn' },
  { id: 'arp', label: 'Arpeggio' },
  { id: 'off', label: 'Off' },
];

function GoalSoundSetting({
  sound,
  volume,
  onChange,
  onVolume,
}: {
  sound: GoalSound;
  volume: number;
  onChange: (value: GoalSound) => void;
  onVolume: (value: number) => void;
}) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="setting cheer-setting">
      <div>
        <strong>Notification sound</strong>
        <span>Crowd, Afrobeats, Chant, Papa Shout, Horn, or Arpeggio. Horn is a stadium fanfare. Arpeggio is a bright rising line. Off keeps the goal cheer silent. The slider is the in-app level. A phone notification uses the same sound at the system volume.</span>
      </div>
      <div className="setting-controls">
          <div className="chips sound-choices" role="radiogroup" aria-label="Notification sound">
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
            playGoalSound(sound, volume);
            setPlaying(true);
            window.setTimeout(() => setPlaying(false), 5200);
          }}
        >
          {playing ? 'Playing' : 'Preview'}
        </button>
      </div>
      <div className="volume-row">
        <label htmlFor="goal-volume">Volume</label>
        <input
          id="goal-volume"
          type="range"
          min={0}
          max={100}
          step={1}
          value={volume}
          aria-valuetext={`${volume}%`}
          onChange={(event) => onVolume(Number(event.target.value))}
        />
        <strong>{volume}%</strong>
      </div>
    </div>
  );
}

const notificationStyles: Array<{ id: NotificationStyle; label: string }> = [
  { id: 'auto', label: 'Auto' },
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
];

function NotificationStyleSetting({ value, onChange }: { value: NotificationStyle; onChange: (value: NotificationStyle) => void }) {
  return (
    <div className="setting notif-style">
      <div>
        <strong>Notification style</strong>
        <span>Auto follows the phone’s dark or light mode. Dark is the red ticker. Light uses the white score panel. The phone keeps this choice when Betspapa is closed.</span>
      </div>
      <div className="notif-style-options" role="radiogroup" aria-label="Notification style">
        {notificationStyles.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={value === option.id}
            className={value === option.id ? 'notif-style-option is-on' : 'notif-style-option'}
            onClick={() => onChange(option.id)}
          >
            <StylePreview mode={option.id === 'light' ? 'light' : 'dark'} />
            <span>{option.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function StylePreview({ mode }: { mode: 'dark' | 'light' }) {
  const dark = mode === 'dark';
  return (
    <span className={dark ? 'notif-preview is-dark' : 'notif-preview is-light'} aria-hidden="true">
      <span className="notif-preview-strip">
        <b>B</b>
        <span>BETSPAPA</span>
        <em>LIVE 67′</em>
      </span>
      <span className="notif-preview-line">{dark ? 'HO 1–0 AK' : 'Hearts  1–0  Kotoko'}</span>
    </span>
  );
}

function EventSoundSetting({
  label,
  detail,
  on,
  onToggle,
  onTest,
}: {
  label: string;
  detail: string;
  on: boolean;
  onToggle: (value: boolean) => void;
  onTest: () => void;
}) {
  const [testing, setTesting] = useState(false);
  return (
    <div className="setting">
      <div>
        <strong>{label}</strong>
        <span>{detail}</span>
      </div>
      <div className="setting-controls">
        <button
          type="button"
          className="btn btn-quiet btn-tiny"
          onClick={() => {
            onTest();
            setTesting(true);
            window.setTimeout(() => setTesting(false), 2500);
          }}
        >
          {testing ? 'Playing' : 'Test'}
        </button>
        <Switch on={on} label={label} onChange={onToggle} />
      </div>
    </div>
  );
}

function AndroidWatchStatus() {
  const { settings } = useStore();
  const { status, applyStatus, refresh, startAgain } = useAlertSetup();
  const [testNote, setTestNote] = useState(false);
  if (!status) return <p className="lede">Checking notification access.</p>;
  const allowed = status.notifications === 'granted';
  const unrestricted = status.batteryUnrestricted;
  const exact = status.exactAlarms;
  return (
    <div className="watch-status">
      <div className="stat">
        <span>Notification permission</span>
        <strong className={allowed ? 'is-good' : 'is-bad'}>{allowed ? 'Allowed' : 'Not allowed'}</strong>
      </div>
      {!allowed && (
        <button
          type="button"
          className="btn"
          onClick={() => {
            void requestWatchNotifications().then(applyStatus);
          }}
        >
          Allow notifications
        </button>
      )}
      <div className="stat">
        <span>Battery optimization</span>
        <strong className={unrestricted ? 'is-good' : 'is-bad'}>{unrestricted ? 'Unrestricted' : 'Optimized'}</strong>
      </div>
      {!unrestricted && (
        <button
          type="button"
          className="btn"
          onClick={() => {
            void requestBatteryExemption().then(() => window.setTimeout(() => void refresh(), 600));
          }}
        >
          Allow background activity
        </button>
      )}
      <div className="stat">
        <span>Exact alarms</span>
        <strong className={exact === 'denied' ? 'is-bad' : exact === 'granted' ? 'is-good' : undefined}>
          {exact === 'granted' ? 'Allowed' : exact === 'denied' ? 'Not allowed' : 'Not required'}
        </strong>
      </div>
      {exact === 'denied' && (
        <button
          type="button"
          className="btn"
          onClick={() => {
            void requestExactAlarm().then(applyStatus);
          }}
        >
          Allow exact alarms
        </button>
      )}
      <p className="lede">
        On Tecno, Infinix, itel, Xiaomi, Oppo, Realme, Vivo, Huawei, and Samsung, open Autostart for Betspapa, take it off the battery saver list, and lock it in the recent-apps list. HiOS and similar skins still stop a watcher after Android’s battery prompt.
      </p>
      {status.oem && <p className="lede">{OEM_INSTRUCTION[status.oem]}</p>}
      <div className="stat">
        <span>Alert health</span>
        <strong className={pollIsStale(status.lastPollAt) ? 'is-bad' : status.lastPollAt ? 'is-good' : undefined}>{pollLabel(status.lastPollAt)}</strong>
      </div>
      <div className="stat">
        <span>Notification sound</span>
        <strong className={status.notificationSound === 'on' ? 'is-good' : 'is-bad'}>{status.notificationSound === 'on' ? 'On' : 'Off'}</strong>
      </div>
      {status.soundBlocked && (
        <button
          type="button"
          className="btn"
          onClick={() => {
            void openNotificationSound().then(applyStatus);
          }}
        >
          Turn notification sound on
        </button>
      )}
      {pollIsStale(status.lastPollAt) && (
        <button type="button" className="btn" onClick={startAgain}>
          Alerts look stuck. Set up again
        </button>
      )}
      <button
        type="button"
        className="btn"
        onClick={() => {
          void scheduleBackgroundTest({ kind: 'goal', goalSound: settings.goalSound }).then((ok) => setTestNote(ok));
        }}
      >
        Play test sound
      </button>
      {testNote && <p className="status-ok">Close Betspapa. You should hear the selected goal sound in about 10 seconds.</p>}
      <button type="button" className="btn" data-setup-again onClick={startAgain}>
        Run alert setup again
      </button>
    </div>
  );
}

function pollLabel(at: number): string {
  if (!at) return 'No poll yet';
  const mins = Math.max(0, Math.round((Date.now() - at) / 60_000));
  if (mins < 1) return 'Just now';
  if (mins === 1) return '1 minute ago';
  return `${mins} minutes ago`;
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
