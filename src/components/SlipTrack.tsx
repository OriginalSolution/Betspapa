import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchResults, type RecordPick } from '../lib/results';
import { readBuilder, subscribeBuilder, writeBuilder } from '../lib/builderStore';
import { cx, kickoffClock, longDay } from '../lib/format';
import { tipsFromEngine } from '../lib/matchPicks';
import {
  applyGrades,
  combinedOdds,
  formatTotalOdds,
  gradeScore,
  legsForPacks,
  slipAlert,
  trendPacks,
  type BuilderLeg,
  type GradedLeg,
  type LegStatus,
} from '../lib/slipPacks';
import {
  freshResults,
  legNoteId,
  readSeenResults,
  refreshBellLegs,
  ringingBells,
  setBell,
  slipNoteId,
  toBellLeg,
  writeSeenResults,
  type LegResult,
} from '../lib/slipBells';
import { useSlipBells } from '../lib/useSlipBells';
import { loadAlerted } from '../lib/storage';
import { legScore } from '../lib/noteCopy.mjs';
import { useEngineBoard } from '../state/engine';
import type { InboxItem, Match } from '../types';
import { useStore } from '../state/store';
import { Crest } from './Crest';
import { SlipBell, SlipConfetti } from './SlipBell';
import type { Team } from '../types';

function teamOf(name: string, crest: string | null): Team {
  return { id: name || 'side', name, shortName: name, abbr: '', color: '#2a303c', crest };
}

/** The board's own team when it has a badge; otherwise the leg's name and stored crest. */
function sideOf(name: string, crest: string | null, board: Team | undefined): Team {
  if (board && (board.crest || !crest)) return { ...board, name: name || board.name, shortName: name || board.shortName };
  return teamOf(name, crest);
}

function dayOf(iso: string): string {
  const time = Date.parse(iso);
  return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : '';
}

export async function gradesFor(legs: Array<{ key: string; eventId: string; market: string; kickoff: string }>, matches: Match[]) {
  const grades = new Map<string, { status: LegStatus; ft: string | null; ht: string | null }>();
  const days = [...new Set(legs.map((leg) => dayOf(leg.kickoff)).filter(Boolean))];
  const recorded = new Map<string, RecordPick>();
  await Promise.all(days.map(async (day) => {
    try {
      const view = await fetchResults(day);
      for (const pick of view.picks) recorded.set(pick.key, pick);
    } catch {
      /* the match board can still grade a full-time score */
    }
  }));
  const byId = new Map(matches.map((match) => [match.id, match]));
  for (const leg of legs) {
    const pick = recorded.get(leg.key);
    if (pick && pick.status !== 'open') {
      grades.set(leg.key, { status: pick.status === 'won' ? 'won' : pick.status === 'lost' ? 'lost' : 'void', ft: pick.ft, ht: pick.ht });
      continue;
    }
    const match = byId.get(leg.eventId);
    if (!match || match.status !== 'finished' || match.homeScore == null || match.awayScore == null) continue;
    const status = gradeScore(leg.market, { home: match.homeScore, away: match.awayScore }, null);
    if (status === 'open') continue;
    grades.set(leg.key, { status, ft: `${match.homeScore}-${match.awayScore}`, ht: null });
  }
  return grades;
}

/** One inbox card when a booked slip settles. Later polls do not send another. */
export function useSlipAlert() {
  const { matches, pushNotices } = useStore();
  useEffect(() => {
    let stop = false;
    const look = async () => {
      const { tracked, packIds } = readBuilder();
      if (!tracked || tracked.alerted || !tracked.legs.length) return;
      const grades = await gradesFor(tracked.legs, matches);
      if (stop) return;
      const legs = applyGrades(tracked.legs, grades);
      const alert = slipAlert(legs);
      if (!alert) return;
      writeBuilder({ packIds, tracked: { ...tracked, alerted: true } });
      const note: InboxItem = {
        id: `slip:${tracked.id}`,
        matchId: '',
        kind: alert.kind,
        title: alert.title,
        body: alert.body,
        createdAt: Date.now(),
        read: false,
      };
      pushNotices([note]);
    };
    void look();
    const timer = window.setInterval(() => void look(), 60_000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [matches, pushNotices]);
}

type SlipState = 'open' | 'live' | 'won' | 'lost';

function legLive(match: Match | undefined): { live: boolean; text: string } {
  if (!match) return { live: false, text: '' };
  const score = match.homeScore != null && match.awayScore != null ? `${match.homeScore}-${match.awayScore}` : '';
  if (match.status === 'live') return { live: true, text: `${match.minute ? `${match.minute}′ ` : 'Live '}${score}`.trim() };
  if (match.status === 'halftime') return { live: true, text: `HT ${score}`.trim() };
  if (match.status === 'finished') return { live: false, text: `FT ${score}`.trim() };
  return { live: false, text: '' };
}

/** One leg: both crests and names, the market pill, the price on the right, and a status chip. */
export function SlipLegRow({
  leg,
  match,
  fresh,
}: {
  leg: Pick<GradedLeg, 'key' | 'home' | 'away' | 'homeCrest' | 'awayCrest' | 'label' | 'odds' | 'kickoff' | 'status' | 'ft'>;
  match?: Match;
  fresh?: boolean;
}) {
  const home = sideOf(leg.home, leg.homeCrest, match?.home);
  const away = sideOf(leg.away, leg.awayCrest, match?.away);
  const live = legLive(match);
  const settled = leg.status === 'won' || leg.status === 'lost' || leg.status === 'void';
  const state = settled ? leg.status : live.live ? 'live' : 'open';
  const chip =
    leg.status === 'won'
      ? `Won${leg.ft ? ` ${leg.ft}` : ''}`
      : leg.status === 'lost'
        ? `Lost${leg.ft ? ` ${leg.ft}` : ''}`
        : leg.status === 'void'
          ? 'Void'
          : live.live
            ? live.text
            : kickoffClock(leg.kickoff) || 'Open';
  return (
    <li className={cx('slip-leg2', `is-${state}`, fresh && 'is-fresh')} data-leg={leg.key}>
      <span className="slip-leg2-mark" aria-hidden="true">
        {leg.status === 'won' ? (
          <svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7" /></svg>
        ) : leg.status === 'lost' ? (
          <svg viewBox="0 0 16 16"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" /></svg>
        ) : live.live ? (
          <i className="slip-leg2-pulse" />
        ) : (
          <i />
        )}
      </span>
      <div className="slip-leg2-main">
        <p className="slip-leg2-side">
          <Crest team={home} size={20} fallback="initials" />
          <span>{home.name}</span>
        </p>
        <p className="slip-leg2-side">
          <Crest team={away} size={20} fallback="initials" />
          <span>{away.name}</span>
        </p>
        <p className="slip-leg2-meta">
          <span className="slip-pill">{leg.label}</span>
        </p>
      </div>
      <div className="slip-leg2-side-col">
        <b className="slip-leg2-odds">{leg.odds.toFixed(2)}</b>
        <span className={cx('slip-chip', `is-${state}`)}>{chip}</span>
      </div>
    </li>
  );
}

function slipStateOf(legs: GradedLeg[], byId: Map<string, Match>): SlipState {
  if (legs.some((leg) => leg.status === 'lost')) return 'lost';
  if (legs.length && legs.every((leg) => leg.status !== 'open')) return 'won';
  if (legs.some((leg) => leg.status === 'open' && legLive(byId.get(leg.eventId)).live)) return 'live';
  return 'open';
}

const STATE_WORD: Record<SlipState, string> = { open: 'Open', live: 'Live', won: 'Won', lost: 'Lost' };

/** Animate legs that settled since the phone last showed this slip, and burst confetti once on a won slip. */
function useFreshResults(slipId: string, legs: GradedLeg[], graded: boolean, state: SlipState) {
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [party, setParty] = useState(false);
  const key = legs.map((leg) => `${leg.key}:${leg.status}`).join('|');
  useEffect(() => {
    if (!graded || !slipId || !legs.length) return;
    const seen = readSeenResults(slipId);
    const keys = freshResults(legs, seen);
    const next: Record<string, LegResult> = { ...seen };
    for (const leg of legs) if (leg.status !== 'open') next[leg.key] = leg.status as LegResult;
    const celebrate = state === 'won' && seen.__slip !== 'won';
    if (state === 'won' || state === 'lost') next.__slip = state === 'won' ? 'won' : 'lost';
    if (!keys.length && !celebrate) return;
    writeSeenResults(slipId, next);
    setFresh(new Set(keys));
    if (celebrate) setParty(true);
    const timer = window.setTimeout(() => {
      setFresh(new Set());
      setParty(false);
    }, 3200);
    return () => window.clearTimeout(timer);
  }, [slipId, key, graded, state]);
  return { fresh, party };
}

export function SlipTimeline() {
  const { matches, settings, permission, requestPermission } = useStore();
  const { state } = useEngineBoard();
  const [builder, setBuilder] = useState(readBuilder);
  const [legs, setLegs] = useState<GradedLeg[]>([]);
  const [graded, setGraded] = useState(false);
  const bells = useSlipBells();
  useEffect(() => subscribeBuilder(() => setBuilder(readBuilder())), []);
  const packs = useMemo(() => trendPacks(tipsFromEngine(state, matches), matches), [state, matches]);
  const source = builder.tracked?.legs?.length ? builder.tracked.legs : legsForPacks(packs, builder.packIds);
  const sourceKey = source.map((leg) => leg.key).join('|');
  const first = source[0]?.kickoff || '';
  const slipId = builder.tracked?.id || (source.length ? `draft:${dayOf(first)}:${builder.packIds.join('+')}` : '');

  useEffect(() => {
    let stop = false;
    if (!source.length) {
      setLegs([]);
      return;
    }
    void gradesFor(source, matches).then((grades) => {
      if (stop) return;
      setLegs(applyGrades(source, grades));
      setGraded(true);
    });
    return () => {
      stop = true;
    };
  }, [matches, sourceKey]);

  useEffect(() => {
    if (slipId && source.length) refreshBellLegs(slipId, source.map(toBellLeg));
  }, [slipId, sourceKey]);

  const shown = legs.length ? legs : applyGrades(source, new Map());
  const byId = useMemo(() => new Map(matches.map((match) => [match.id, match])), [matches]);
  const slipState = slipStateOf(shown, byId);
  const { fresh, party } = useFreshResults(slipId, shown, graded, slipState);
  if (!source.length) return null;

  const bellOn = Boolean(bells[slipId]?.on);
  const alert = slipAlert(shown);
  const won = shown.filter((leg) => leg.status === 'won').length;
  const lost = shown.filter((leg) => leg.status === 'lost').length;
  const voided = shown.filter((leg) => leg.status === 'void').length;
  const settled = won + lost + voided;
  const total = combinedOdds(shown);
  const totalText = formatTotalOdds(total);
  const pays = total > 0 ? formatTotalOdds(total * 10) : '';
  const missed = shown.find((leg) => leg.status === 'lost');
  const pct = (value: number) => `${shown.length ? (value / shown.length) * 100 : 0}%`;
  const matchCount = new Set(source.map((leg) => leg.eventId)).size;

  const toggleBell = () => {
    const next = !bellOn;
    setBell(slipId, next, { label: builder.tracked ? 'Tracked slip' : 'Slip', legs: source.map(toBellLeg) });
    if (next && (!settings.browser || permission !== 'granted')) void requestPermission();
  };

  return (
    <section className={cx('slip-card', `is-${slipState}`, party && 'is-party')} aria-label="Tracked slip">
      {party && <SlipConfetti />}
      <header className="slip-card-head">
        <div className="slip-card-title">
          <p className="slip-card-kicker">
            {first ? longDay(dayOf(first)) : 'Tracked slip'} · {source.length} {source.length === 1 ? 'leg' : 'legs'}
          </p>
          <h2>
            {builder.tracked ? 'Your tracked slip' : 'Your slip'}
            <span className={cx('slip-chip', 'slip-card-state', `is-${slipState}`)}>{STATE_WORD[slipState]}</span>
          </h2>
        </div>
        <SlipBell on={bellOn} count={matchCount} onToggle={toggleBell} />
      </header>
      {bellOn && (
        <p className="slip-bell-note" role="status">
          Alerts on for {matchCount} {matchCount === 1 ? 'match' : 'matches'}: kick-off, goals and every result.
        </p>
      )}
      <div className="slip-progress" role="img" aria-label={`${settled} of ${shown.length} legs settled: ${won} won, ${lost} lost`}>
        <i className="is-won" style={{ width: pct(won) }} />
        <i className="is-lost" style={{ width: pct(lost) }} />
        <i className="is-void" style={{ width: pct(voided) }} />
      </div>
      <dl className="slip-summary">
        <div>
          <dt>Settled</dt>
          <dd>
            {settled}/{shown.length}
          </dd>
        </div>
        <div>
          <dt>Won · lost</dt>
          <dd>
            <span className="is-won">{won}</span> · <span className="is-lost">{lost}</span>
          </dd>
        </div>
        {totalText && (
          <div>
            <dt>Total odds</dt>
            <dd>{totalText}</dd>
          </div>
        )}
        {pays && (
          <div>
            <dt>GH₵10 pays</dt>
            <dd>{pays}</dd>
          </div>
        )}
      </dl>
      {missed && <p className="slip-missed">Missed by {legScore(missed, missed.ft || '')} · {missed.label}</p>}
      <ol className="slip-legs2">
        {shown.map((leg) => (
          <SlipLegRow key={leg.key} leg={leg} match={byId.get(leg.eventId)} fresh={fresh.has(leg.key)} />
        ))}
      </ol>
      {alert && (
        <article className={cx('slip-alert', alert.kind === 'win' ? 'is-won' : 'is-lost')}>
          <p>Betspapa · Slips</p>
          <strong>{alert.title}</strong>
          <span>{alert.body}</span>
        </article>
      )}
      {!builder.tracked && (
        <Link to="/trends" className="rec-codes-link">
          Book and track this slip
        </Link>
      )}
    </section>
  );
}

/**
 * In-app cards for belled slips: one per settled leg, then one for the slip.
 * The ids match the server push and the on-phone watcher, so each shows once.
 */
export function useSlipBellAlerts() {
  const { matches, pushNotices } = useStore();
  const bells = useSlipBells();
  const matchesRef = useRef(matches);
  matchesRef.current = matches;
  const boardKey = matches
    .filter((match) => match.status === 'finished')
    .map((match) => `${match.id}:${match.homeScore}:${match.awayScore}`)
    .join('|');
  useEffect(() => {
    let stop = false;
    const look = async () => {
      const ringing = ringingBells(bells);
      if (!ringing.length) return;
      const alerted = loadAlerted();
      const notes: InboxItem[] = [];
      for (const bell of ringing) {
        const legs: BuilderLeg[] = bell.legs.map((leg) => ({ ...leg, homeCrest: null, awayCrest: null, sample: null }));
        const grades = await gradesFor(legs, matchesRef.current);
        if (stop) return;
        const graded = applyGrades(legs, grades);
        const done = graded.filter((leg) => leg.status !== 'open').length;
        for (const leg of graded) {
          if (leg.status !== 'won' && leg.status !== 'lost') continue;
          const id = legNoteId(bell.id, leg.key);
          if (alerted.has(id)) continue;
          notes.push(legNotice(id, leg, done, graded.length));
        }
        const final = slipAlert(graded);
        const finalId = slipNoteId(bell.id);
        if (final && !alerted.has(finalId)) {
          notes.push({ id: finalId, matchId: '', kind: final.kind, title: final.title, body: final.body, createdAt: Date.now(), read: false });
        }
      }
      if (!notes.length || stop) return;
      // Several legs settling at once arrive one after another, so each result gets its own moment.
      notes.forEach((note, index) => {
        if (index === 0) pushNotices([note]);
        else timers.push(window.setTimeout(() => !stop && pushNotices([note]), index * 900));
      });
    };
    const timers: number[] = [];
    void look();
    const timer = window.setInterval(() => void look(), 60_000);
    return () => {
      stop = true;
      window.clearInterval(timer);
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [bells, boardKey, pushNotices]);
}

export function legNotice(id: string, leg: GradedLeg, done: number, total: number): InboxItem {
  const won = leg.status === 'won';
  return {
    id,
    matchId: leg.eventId,
    kind: won ? 'win' : 'bust',
    title: `${won ? 'Leg won' : 'Leg lost'} · ${leg.label}`,
    body: `${legScore(leg, leg.ft || '')} · ${leg.odds.toFixed(2)} · ${done} of ${total} settled`,
    createdAt: Date.now(),
    read: false,
  };
}
