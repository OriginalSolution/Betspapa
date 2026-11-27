import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CodeActions } from './CodeActions';
import { SlipBell } from './SlipBell';
import { SlipLegRow, gradesFor } from './SlipTrack';
import { readBuilder, subscribeBuilder, addTrackedSlip, type TrackedSlip } from '../lib/builderStore';
import { isPlayStoreBuild } from '../lib/storeBuild';
import { playTierPhrase } from '../lib/pickCodes';
import { applyGrades, type GradedLeg } from '../lib/slipPacks';
import { deskOf, slipFromPublishedCode } from '../lib/trackedSlips';
import { setBell, toBellLeg } from '../lib/slipBells';
import { useSlipBells } from '../lib/useSlipBells';
import { cx } from '../lib/format';
import { useEngineBoard } from '../state/engine';
import { useStore } from '../state/store';
import type { Match } from '../types';

type MonitorState = 'live' | 'pending' | 'won' | 'lost';

const WORD: Record<MonitorState, string> = { live: 'Live', pending: 'Pending', won: 'Won', lost: 'Lost' };

function monitorState(legs: GradedLeg[], matches: Match[]): MonitorState {
  const byId = new Map(matches.map((match) => [match.id, match]));
  if (legs.some((leg) => leg.status === 'lost')) return 'lost';
  if (legs.length && legs.every((leg) => leg.status !== 'open')) return 'won';
  if (legs.some((leg) => leg.status === 'open' && live(byId.get(leg.eventId)))) return 'live';
  return 'pending';
}

function live(match: Match | undefined): boolean {
  return match?.status === 'live' || match?.status === 'halftime';
}

function tally(legs: GradedLeg[], state: MonitorState): string {
  const won = legs.filter((leg) => leg.status === 'won').length;
  const lost = legs.filter((leg) => leg.status === 'lost').length;
  if (state === 'won') return `${won}/${legs.length} won`;
  if (state === 'lost') return `${won} won · ${lost} lost`;
  if (state === 'live') return `${won} winning · ${legs.length} legs`;
  return `0/${legs.length}`;
}

export function SlipMonitor() {
  const { matches, settings, permission, requestPermission } = useStore();
  const { state } = useEngineBoard();
  const bells = useSlipBells();
  const play = isPlayStoreBuild();
  const [builder, setBuilder] = useState(readBuilder);
  const [openId, setOpenId] = useState<string | null>(null);
  const [grades, setGrades] = useState<Map<string, { status: GradedLeg['status']; ft: string | null; ht: string | null }>>(new Map());
  const [code, setCode] = useState('');
  const [problem, setProblem] = useState('');

  useEffect(() => subscribeBuilder(() => setBuilder(readBuilder())), []);

  const key = builder.slips.map((slip) => `${slip.id}:${slip.legs.length}`).join('|');
  useEffect(() => {
    let stop = false;
    const legs = builder.slips.flatMap((slip) => slip.legs);
    if (!legs.length) {
      setGrades(new Map());
      return;
    }
    void gradesFor(legs, matches).then((next) => {
      if (!stop) setGrades(next);
    });
    return () => {
      stop = true;
    };
  }, [key, matches]);

  const rows = useMemo(
    () =>
      builder.slips.map((slip) => {
        const legs = applyGrades(slip.legs, grades);
        const status = monitorState(legs, matches);
        return { slip, legs, status };
      }),
    [builder.slips, grades, matches],
  );
  const open = rows.find((row) => row.slip.id === openId) || null;

  const addCode = () => {
    const slip = slipFromPublishedCode(state, code);
    if (!slip) {
      setProblem(play ? 'That code is not on today’s list.' : 'That code is not on today’s published slips.');
      return;
    }
    addTrackedSlip(slip);
    setCode('');
    setProblem('');
    setOpenId(slip.id);
  };

  return (
    <section className="slip-monitor" aria-label="Tracked slips">
      <header className="slip-monitor-head">
        <h2>Tracked</h2>
        <span>{rows.length} {rows.length === 1 ? 'slip' : 'slips'}</span>
      </header>
      {rows.length === 0 && <p className="lede">No tracked slips yet. Paste a code from today’s list, or build one on Trends. Booking another keeps the ones you already have.</p>}
      <ul className="slip-monitor-list">
        {rows.map(({ slip, legs, status }) => (
          <li key={slip.id}>
            <button type="button" className={cx('slip-monitor-row', openId === slip.id && 'is-on')} onClick={() => setOpenId((current) => (current === slip.id ? null : slip.id))}>
              <span>
                <strong>{playTierPhrase(slip.label)}</strong>
                <small>{rowSub(slip, play)} · {tally(legs, status)}</small>
              </span>
              <i className={cx('slip-chip', `is-${status === 'pending' ? 'open' : status}`)}>{WORD[status]}</i>
            </button>
          </li>
        ))}
      </ul>
      {open && <OpenSlip row={open} play={play} bellOn={Boolean(bells[open.slip.id]?.on)} matches={matches} onBell={(on) => toggleBell(open.slip, on, settings.browser, permission, requestPermission)} />}
      <form
        className="slip-monitor-add"
        onSubmit={(event) => {
          event.preventDefault();
          addCode();
        }}
      >
        <label>
          <span>{play ? 'Add a code' : 'Paste a booking code'}</span>
          <input value={code} onChange={(event) => setCode(event.target.value)} placeholder={play ? 'Code from today’s list' : 'Code from a supported book'} autoCapitalize="characters" autoCorrect="off" spellCheck={false} />
        </label>
        <button type="submit" className="btn">Track code</button>
        {problem && <p className="lede">{problem}</p>}
        <Link to="/trends" className="rec-codes-link">Build from today’s trends</Link>
      </form>
    </section>
  );
}

function rowSub(slip: TrackedSlip, play: boolean): string {
  const code = slip.parts[0]?.code;
  if (!code) return `${slip.legs.length} legs`;
  return play ? `Copy ${code}` : code;
}

function OpenSlip({
  row,
  play,
  bellOn,
  matches,
  onBell,
}: {
  row: { slip: TrackedSlip; legs: GradedLeg[]; status: MonitorState };
  play: boolean;
  bellOn: boolean;
  matches: Match[];
  onBell: (on: boolean) => void;
}) {
  const byId = new Map(matches.map((match) => [match.id, match]));
  const won = row.legs.filter((leg) => leg.status === 'won').length;
  const desk = deskOf(row.slip);
  const part = row.slip.parts[0];
  return (
    <article className="slip-monitor-open" aria-label={playTierPhrase(row.slip.label)}>
      <p className="slip-monitor-won">{won} winning · {row.legs.length} legs · {WORD[row.status]}</p>
      {part && <CodeActions code={part.code} desk={play ? null : desk || null} />}
      <div className="slip-monitor-bell">
        <SlipBell on={bellOn} count={new Set(row.legs.map((leg) => leg.eventId)).size} onToggle={() => onBell(!bellOn)} />
        <span>{bellOn ? 'Alerts on for this slip' : 'Alerts off'}</span>
      </div>
      <ol className="slip-legs2">
        {row.legs.map((leg) => (
          <SlipLegRow key={leg.key} leg={leg} match={byId.get(leg.eventId)} />
        ))}
      </ol>
    </article>
  );
}

function toggleBell(
  slip: TrackedSlip,
  on: boolean,
  browser: boolean,
  permission: string,
  requestPermission: () => void,
) {
  setBell(slip.id, on, { label: slip.label, legs: slip.legs.map(toBellLeg) });
  if (on && (!browser || permission !== 'granted')) requestPermission();
}
