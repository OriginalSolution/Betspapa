import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CodeActions } from './CodeActions';
import { SlipBell } from './SlipBell';
import { SlipLegRow, gradesFor } from './SlipTrack';
import { readBuilder, subscribeBuilder, addTrackedSlip, type TrackedSlip } from '../lib/builderStore';
import { isPlayStoreBuild } from '../lib/storeBuild';
import { playTierPhrase } from '../lib/pickCodes';
import { applyGrades, combinedOdds, formatTotalOdds, type GradedLeg } from '../lib/slipPacks';
import { deskOf, matchesForSlips, slipCounts, slipFixtureIds, slipFromPublishedCode, splitMonitorLegs } from '../lib/trackedSlips';
import { slipWindow } from '../lib/slipWindow';
import { setBell, toBellLeg } from '../lib/slipBells';
import { useSlipBells } from '../lib/useSlipBells';
import { cx } from '../lib/format';
import { legBlocked } from '../lib/teamMarks';
import { useProduct } from '../state/product';
import { useEngineBoard } from '../state/engine';
import { useStore } from '../state/store';
import type { Match } from '../types';

type MonitorState = 'live' | 'pending' | 'won' | 'lost';

const WORD: Record<MonitorState, string> = { live: 'Live', pending: 'Pending', won: 'Won', lost: 'Lost' };

function monitorState(legs: GradedLeg[], byId: Map<string, Match>): MonitorState {
  if (legs.some((leg) => leg.status === 'lost')) return 'lost';
  if (legs.length && legs.every((leg) => leg.status !== 'open')) return 'won';
  if (legs.some((leg) => leg.status === 'open' && live(byId.get(leg.eventId)))) return 'live';
  return 'pending';
}

function live(match: Match | undefined): boolean {
  return match?.status === 'live' || match?.status === 'halftime';
}

function tally(legs: GradedLeg[]): string {
  const counts = slipCounts(legs);
  const odds = formatTotalOdds(combinedOdds(legs));
  const figures = `${counts.won} won · ${counts.lost} lost · ${counts.open} open`;
  return odds ? `${figures} · odds ${odds}` : figures;
}

export function SlipMonitor() {
  const { matches, settings, permission, requestPermission } = useStore();
  const { lists } = useProduct();
  const { state } = useEngineBoard();
  const bells = useSlipBells();
  const play = isPlayStoreBuild();
  const [builder, setBuilder] = useState(readBuilder);
  const [params] = useSearchParams();
  const wanted = params.get('slip');
  const [openId, setOpenId] = useState<string | null>(wanted);
  const [grades, setGrades] = useState<Map<string, { status: GradedLeg['status']; ft: string | null; ht: string | null }>>(new Map());
  const [code, setCode] = useState('');
  const [problem, setProblem] = useState('');

  useEffect(() => subscribeBuilder(() => setBuilder(readBuilder())), []);
  useEffect(() => {
    if (wanted) setOpenId(wanted);
  }, [wanted]);

  const key = builder.slips.map((slip) => `${slip.id}:${slip.legs.length}`).join('|');
  const fixtureIds = useMemo(() => slipFixtureIds(builder.slips), [key]);
  const watched = useMemo(() => matchesForSlips(matches, fixtureIds), [matches, fixtureIds]);
  const scoreKey = watched.map((match) => `${match.id}:${match.status}:${match.homeScore ?? ''}:${match.awayScore ?? ''}`).join('|');
  useEffect(() => {
    let stop = false;
    const legs = builder.slips.flatMap((slip) => slip.legs);
    if (!legs.length) {
      setGrades(new Map());
      return;
    }
    void gradesFor(legs, watched).then((next) => {
      if (!stop) setGrades(next);
    });
    return () => {
      stop = true;
    };
  }, [key, scoreKey]);

  const byId = useMemo(() => new Map(watched.map((match) => [match.id, match])), [scoreKey]);
  const rows = useMemo(
    () =>
      builder.slips.map((slip) => {
        const legs = applyGrades(slip.legs.filter((leg) => !legBlocked(lists, leg)), grades);
        const status = monitorState(legs, byId);
        return { slip, legs, status };
      }),
    [builder.slips, grades, byId, lists],
  );

  const listRef = useRef<HTMLUListElement>(null);
  const heights = useRef(new Map<string, number>());
  const [layout, setLayout] = useState({ scrollTop: 0, viewHeight: 720, listOffset: 0 });
  const [revision, setRevision] = useState(0);
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || !rows.length) return;
    const scroller = scrollBox(list);
    const read = () => {
      const next = readLayout(list, scroller);
      setLayout((current) => (sameLayout(current, next) ? current : next));
    };
    read();
    const target: HTMLElement | Window = scroller ?? window;
    target.addEventListener('scroll', read, { passive: true });
    window.addEventListener('resize', read);
    return () => {
      target.removeEventListener('scroll', read);
      window.removeEventListener('resize', read);
    };
  }, [rows.length]);
  const frame = useMemo(() => {
    const measured = rows.map((row) => heights.current.get(row.slip.id));
    return slipWindow(rows.length, measured, layout.scrollTop - layout.listOffset, layout.viewHeight);
  }, [rows, layout, revision, openId]);
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      let changed = false;
      list.querySelectorAll<HTMLLIElement>('[data-slip-id]').forEach((item) => {
        const id = item.dataset.slipId || '';
        const next = Math.ceil(item.getBoundingClientRect().height);
        if (id && next > 0 && heights.current.get(id) !== next) {
          heights.current.set(id, next);
          changed = true;
        }
      });
      if (changed) setRevision((value) => value + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [frame.start, frame.end, openId]);

  const addCode = () => {
    const slip = slipFromPublishedCode(state, code);
    if (!slip) {
      setProblem(play ? 'That code is not on today’s list.' : 'That code is not on today’s published slips.');
      return;
    }
    addTrackedSlip(slip);
    setCode('');
    setProblem('');
  };

  return (
    <section className="slip-monitor" aria-label="Tracked slips">
      <header className="slip-monitor-head">
        <h2>Tracked</h2>
        <span>{rows.length} {rows.length === 1 ? 'slip' : 'slips'}</span>
        <Link to="/slips/teams">Teams</Link>
      </header>
      {rows.length === 0 && <p className="lede">No tracked slips yet. Paste a code from today’s list, or build one on Trends. Booking another keeps the ones you already have.</p>}
      <ul className="slip-monitor-list" ref={listRef}>
        {frame.padTop > 0 && <li className="slip-monitor-pad" style={{ height: frame.padTop }} aria-hidden="true" />}
        {rows.slice(frame.start, frame.end).map((row, offset) => {
          const open = openId === row.slip.id;
          const index = frame.start + offset;
          return (
            <li key={row.slip.id} data-slip-id={row.slip.id} data-index={index}>
              <button
                type="button"
                className={cx('slip-monitor-row', open && 'is-on')}
                aria-expanded={open}
                onClick={() => setOpenId((current) => (current === row.slip.id ? null : row.slip.id))}
              >
                <span>
                  <strong>{playTierPhrase(row.slip.label)}</strong>
                  <small>{rowSub(row.slip, play)} · {tally(row.legs)}</small>
                </span>
                <i className={cx('slip-chip', `is-${row.status === 'pending' ? 'open' : row.status}`)}>{WORD[row.status]}</i>
              </button>
              {open && (
                <OpenSlip
                  row={row}
                  play={play}
                  bellOn={Boolean(bells[row.slip.id]?.on)}
                  matches={watched}
                  onBell={(on) => toggleBell(row.slip, on, settings.browser, permission, requestPermission)}
                />
              )}
            </li>
          );
        })}
        {frame.padBottom > 0 && <li className="slip-monitor-pad" style={{ height: frame.padBottom }} aria-hidden="true" />}
      </ul>
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
  const counts = slipCounts(row.legs);
  const { active, settled } = splitMonitorLegs(row.legs, matches);
  const desk = deskOf(row.slip);
  const part = row.slip.parts[0];
  const odds = formatTotalOdds(combinedOdds(row.legs));
  return (
    <article className="slip-monitor-open" aria-label={playTierPhrase(row.slip.label)}>
      <p className="slip-monitor-won">{counts.settled}/{counts.total} settled · {counts.won} won · {counts.lost} lost · {counts.open} open{odds ? ` · odds ${odds}` : ''}</p>
      {part && <CodeActions code={part.code} desk={play ? null : desk || null} />}
      <div className="slip-monitor-bell">
        <SlipBell on={bellOn} count={new Set(row.legs.map((leg) => leg.eventId)).size} onToggle={() => onBell(!bellOn)} />
        <span>{bellOn ? 'Alerts on for this slip' : 'Alerts off'}</span>
      </div>
      <ol className="slip-legs2">
        {[...active, ...settled].map((leg) => (
          <SlipLegRow key={leg.key} leg={leg} match={byId.get(leg.eventId)} />
        ))}
      </ol>
    </article>
  );
}

function scrollBox(node: HTMLElement): HTMLElement | null {
  const main = node.closest('.main');
  if (!(main instanceof HTMLElement)) return null;
  const overflow = getComputedStyle(main).overflowY;
  return overflow === 'auto' || overflow === 'scroll' ? main : null;
}

function readLayout(list: HTMLElement, scroller: HTMLElement | null) {
  if (!scroller) {
    const rect = list.getBoundingClientRect();
    return { scrollTop: window.scrollY, viewHeight: window.innerHeight, listOffset: rect.top + window.scrollY };
  }
  const listRect = list.getBoundingClientRect();
  const box = scroller.getBoundingClientRect();
  return { scrollTop: scroller.scrollTop, viewHeight: scroller.clientHeight, listOffset: listRect.top - box.top + scroller.scrollTop };
}

function sameLayout(
  current: { scrollTop: number; viewHeight: number; listOffset: number },
  next: { scrollTop: number; viewHeight: number; listOffset: number },
) {
  return current.scrollTop === next.scrollTop && current.viewHeight === next.viewHeight && current.listOffset === next.listOffset;
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
