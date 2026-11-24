import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { fetchResults, type RecordPick } from '../lib/results';
import {
  readBuilder,
  readOpenSlips,
  readTrackedSlips,
  removeTrackedSlip,
  slipName,
  subscribeBuilder,
  updateTrackedSlip,
  writeOpenSlips,
} from '../lib/builderStore';
import { codesLegGrades } from '../lib/trackFrom';
import { cx, kickoffClock } from '../lib/format';
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
import { bellLegCopy, legScore, slipCallName } from '../lib/noteCopy.mjs';
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

/** One inbox card per tracked slip when it settles. Later polls do not send another. */
export function useSlipAlert() {
  const { matches, pushNotices } = useStore();
  useEffect(() => {
    let stop = false;
    const look = async () => {
      const waiting = readTrackedSlips().filter((slip) => !slip.alerted && slip.legs.length);
      if (!waiting.length) return;
      const grades = await gradesFor(waiting.flatMap((slip) => slip.legs), matches);
      if (stop) return;
      const notes: InboxItem[] = [];
      for (const slip of waiting) {
        const alert = slipAlert(applyGrades(slip.legs, grades), slipName(slip));
        if (!alert) continue;
        updateTrackedSlip(slip.id, { alerted: true });
        notes.push({ id: `slip:${slip.id}`, matchId: '', kind: alert.kind, title: alert.title, body: alert.body, createdAt: Date.now(), read: false });
      }
      if (notes.length) pushNotices(notes);
    };
    void look();
    const timer = window.setInterval(() => void look(), 60_000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [matches, pushNotices]);
}

export type SlipState = 'open' | 'live' | 'won' | 'lost';

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

export function slipStateOf(legs: GradedLeg[], byId: Map<string, Match>): SlipState {
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

/** "28 matches · 29 legs, as 1 match has 2 picks". The bell follows matches; the slip counts legs. */
export function bellCoverLine(legs: Array<{ eventId: string }>): string {
  const perMatch = new Map<string, number>();
  for (const leg of legs) perMatch.set(leg.eventId, (perMatch.get(leg.eventId) || 0) + 1);
  const matches = perMatch.size;
  const head = `Alerts on for ${matches} ${matches === 1 ? 'match' : 'matches'}`;
  if (matches === legs.length) return `${head}: kick-off, goals and every result.`;
  const shared = [...perMatch.values()].filter((count) => count > 1);
  const pairs = shared.every((count) => count === 2);
  const why = shared.length === 1
    ? `1 match has ${shared[0]} picks`
    : `${shared.length} matches have ${pairs ? '2 picks each' : 'more than one pick'}`;
  return `${head} · ${legs.length} legs, as ${why}. Kick-off and goals once per match, a result for every leg.`;
}

/** Height-and-fade open/close. The legs only mount while open or closing. CSS turns it off for reduced motion. */
function Collapse({ open, id, children }: { open: boolean; id: string; children: ReactNode }) {
  const [mounted, setMounted] = useState(open);
  const [expanded, setExpanded] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      let second = 0;
      const first = window.requestAnimationFrame(() => {
        second = window.requestAnimationFrame(() => setExpanded(true));
      });
      return () => {
        window.cancelAnimationFrame(first);
        window.cancelAnimationFrame(second);
      };
    }
    setExpanded(false);
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(() => setMounted(false), reduce ? 0 : 300);
    return () => window.clearTimeout(timer);
  }, [open]);
  return (
    <div id={id} className={cx('slip-collapse', expanded && 'is-open')} hidden={!mounted}>
      <div className="slip-collapse-inner">{mounted && children}</div>
    </div>
  );
}

type CardSlip = {
  id: string;
  name: string;
  kicker: string;
  origin: string;
  source: BuilderLeg[];
  legs: GradedLeg[];
  state: SlipState;
  tracked: boolean;
  number: number;
};

function SlipCard({
  slip,
  graded,
  byId,
  open,
  onToggle,
  onRemove,
}: {
  slip: CardSlip;
  graded: boolean;
  byId: Map<string, Match>;
  open: boolean;
  onToggle: () => void;
  onRemove?: () => void;
}) {
  const { settings, permission, requestPermission } = useStore();
  const bells = useSlipBells();
  const [confirm, setConfirm] = useState(false);
  const { legs: shown, source, state: slipState } = slip;
  const sourceKey = source.map((leg) => leg.key).join('|');
  const { fresh, party } = useFreshResults(slip.id, shown, graded, slipState);
  useEffect(() => {
    if (source.length) refreshBellLegs(slip.id, source.map(toBellLeg), slip.tracked ? slip.name : undefined);
  }, [slip.id, sourceKey, slip.name]);
  useEffect(() => {
    if (!open) setConfirm(false);
  }, [open]);

  const bellOn = Boolean(bells[slip.id]?.on);
  const alert = slipAlert(shown, slip.tracked ? slip.name : '');
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
  const bodyId = `slip-body-${slip.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

  const toggleBell = () => {
    const next = !bellOn;
    setBell(slip.id, next, { label: slip.tracked ? slip.name : 'Slip', legs: source.map(toBellLeg) });
    if (next && (!settings.browser || permission !== 'granted')) void requestPermission();
  };

  return (
    <section
      id={`tracked-${slip.id}`}
      className={cx('slip-card', `is-${slipState}`, party && 'is-party', open ? 'is-expanded' : 'is-collapsed')}
      aria-label={slip.name}
    >
      {party && <SlipConfetti />}
      <header className="slip-card-head">
        <button type="button" className="slip-card-toggle" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
          <span className="slip-card-kicker">{slip.kicker}</span>
          <span className="slip-card-name">
            <strong>{slip.name}</strong>
            <span className={cx('slip-chip', 'slip-card-state', `is-${slipState}`)}>{STATE_WORD[slipState]}</span>
          </span>
          <span className="slip-card-stats">
            <span className="is-won">{won} won</span>
            <span className="is-lost">{lost} lost</span>
            {totalText && <span>odds {totalText}</span>}
          </span>
          <svg className="slip-card-chevron" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 6l4 4 4-4" />
          </svg>
        </button>
        <SlipBell on={bellOn} count={matchCount} onToggle={toggleBell} />
      </header>
      <div className="slip-progress" role="img" aria-label={`${settled} of ${shown.length} legs settled: ${won} won, ${lost} lost`}>
        <i className="is-won" style={{ width: pct(won) }} />
        <i className="is-lost" style={{ width: pct(lost) }} />
        <i className="is-void" style={{ width: pct(voided) }} />
      </div>
      <p className="slip-card-settled">
        {settled}/{shown.length} settled
      </p>
      <Collapse open={open} id={bodyId}>
        {bellOn && (
          <p className="slip-bell-note" role="status">
            {bellCoverLine(source)}
          </p>
        )}
        {slip.origin && <p className="slip-card-origin">{slip.origin}</p>}
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
        {!slip.tracked && (
          <Link to="/trends" className="rec-codes-link">
            Book and track this slip
          </Link>
        )}
        {slip.tracked && onRemove && (
          <div className={cx('slip-remove', confirm && 'is-confirm')}>
            {confirm ? (
              <>
                <p role="alert">Stop tracking {slip.name}? Its alerts stop too.</p>
                <div className="slip-remove-actions">
                  <button type="button" className="btn btn-quiet" onClick={() => setConfirm(false)}>
                    Keep
                  </button>
                  <button type="button" className="btn slip-remove-yes" onClick={onRemove}>
                    Stop tracking
                  </button>
                </div>
              </>
            ) : (
              <button type="button" className="slip-remove-ask" onClick={() => setConfirm(true)}>
                Stop tracking
              </button>
            )}
          </div>
        )}
      </Collapse>
    </section>
  );
}

/** "Tue 24 Nov" in the phone's own zone. */
function shortDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(date).replace(',', '');
}

const ORIGIN: Record<string, string> = { book: 'Booked from trends', trend: 'Trend code', master: 'Master code', picks: 'Picks master code', codes: 'Codes' };

/**
 * Every tracked slip as its own card: newest open slips first, finished ones below.
 * One slip opens by default; with more, all start collapsed. Open state is remembered.
 */
export function TrackedSlips() {
  const { matches } = useStore();
  const { state } = useEngineBoard();
  const [params] = useSearchParams();
  const focus = params.get('slip');
  const [builder, setBuilder] = useState(readBuilder);
  const [slips, setSlips] = useState(readTrackedSlips);
  const [grades, setGrades] = useState<Map<string, { status: LegStatus; ft: string | null; ht: string | null }>>(new Map());
  const [graded, setGraded] = useState(false);
  const [openMap, setOpenMap] = useState(readOpenSlips);
  useEffect(
    () =>
      subscribeBuilder(() => {
        setBuilder(readBuilder());
        setSlips(readTrackedSlips());
      }),
    [],
  );
  const packs = useMemo(() => trendPacks(tipsFromEngine(state, matches), matches), [state, matches]);
  const draftLegs = !builder.tracked && builder.packIds.length ? legsForPacks(packs, builder.packIds) : [];
  const allLegs = useMemo(() => {
    const seen = new Map<string, BuilderLeg>();
    for (const leg of [...draftLegs, ...slips.flatMap((slip) => slip.legs)]) if (!seen.has(leg.key)) seen.set(leg.key, leg);
    return [...seen.values()];
  }, [draftLegs.map((leg) => leg.key).join('|'), slips]);
  const allKey = allLegs.map((leg) => leg.key).join('|');
  const hasCodes = slips.some((slip) => slip.source === 'codes');

  useEffect(() => {
    let stop = false;
    if (!allLegs.length) return;
    void Promise.all([gradesFor(allLegs, matches), hasCodes ? codesLegGrades() : Promise.resolve(new Map())]).then(([found, coded]) => {
      if (stop) return;
      for (const [key, grade] of coded) if (!found.has(key)) found.set(key, grade);
      setGrades(found);
      setGraded(true);
    });
    return () => {
      stop = true;
    };
  }, [matches, allKey, hasCodes]);

  const byId = useMemo(() => new Map(matches.map((match) => [match.id, match])), [matches]);
  const cards: CardSlip[] = [];
  if (draftLegs.length) {
    const first = draftLegs[0]?.kickoff || '';
    const legs = applyGrades(draftLegs, grades);
    cards.push({
      id: `draft:${dayOf(first)}:${builder.packIds.join('+')}`,
      name: 'Your slip · not booked',
      kicker: `${first ? shortDay(first) : 'Slip'} · ${draftLegs.length} ${draftLegs.length === 1 ? 'leg' : 'legs'}`,
      origin: '',
      source: draftLegs,
      legs,
      state: slipStateOf(legs, byId),
      tracked: false,
      number: Number.MAX_SAFE_INTEGER,
    });
  }
  const tracked = slips.map((slip): CardSlip => {
    const first = [...slip.legs].sort((a, b) => a.kickoff.localeCompare(b.kickoff))[0]?.kickoff || slip.bookedAt;
    const legs = applyGrades(slip.legs, grades);
    return {
      id: slip.id,
      name: slipName(slip),
      kicker: `${first ? shortDay(first) : 'Tracked'} · ${slip.legs.length} ${slip.legs.length === 1 ? 'leg' : 'legs'}`,
      origin: [ORIGIN[slip.source || 'book'], slip.origin].filter(Boolean).join(' · '),
      source: slip.legs,
      legs,
      state: slipStateOf(legs, byId),
      tracked: true,
      number: slip.number || 0,
    };
  });
  const finished = (card: CardSlip) => card.state === 'won' || card.state === 'lost';
  tracked.sort((a, b) => Number(finished(a)) - Number(finished(b)) || b.number - a.number);
  cards.push(...tracked);

  const many = cards.length > 1;
  const isOpen = (id: string) => openMap[id] ?? (focus ? focus === id : !many);
  const save = (next: Record<string, boolean>) => {
    const live = new Set(cards.map((card) => card.id));
    const kept = Object.fromEntries(Object.entries(next).filter(([id]) => live.has(id)));
    setOpenMap(kept);
    writeOpenSlips(kept);
  };
  const allOpen = cards.length > 0 && cards.every((card) => isOpen(card.id));

  useEffect(() => {
    if (!focus) return;
    if (!isOpen(focus)) save({ ...openMap, [focus]: true });
    document.getElementById(`tracked-${focus}`)?.scrollIntoView({ block: 'start' });
  }, [focus]);

  if (!cards.length) return null;

  const remove = (card: CardSlip) => {
    setBell(card.id, false, { label: card.name, legs: [] });
    removeTrackedSlip(card.id);
    const next = { ...openMap };
    delete next[card.id];
    save(next);
  };

  return (
    <section className="tracked-slips" aria-label="Tracked slips">
      {many && (
        <div className="tracked-bar">
          <h2>
            Tracked slips <small>{tracked.length}</small>
          </h2>
          <button
            type="button"
            className="tracked-all"
            aria-pressed={allOpen}
            onClick={() => save(Object.fromEntries(cards.map((card) => [card.id, !allOpen])))}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d={allOpen ? 'M4 10l4-4 4 4' : 'M4 6l4 4 4-4'} />
            </svg>
            {allOpen ? 'Collapse all' : 'Expand all'}
          </button>
        </div>
      )}
      {cards.map((card) => (
        <SlipCard
          key={card.id}
          slip={card}
          graded={graded}
          byId={byId}
          open={isOpen(card.id)}
          onToggle={() => save({ ...openMap, [card.id]: !isOpen(card.id) })}
          onRemove={card.tracked ? () => remove(card) : undefined}
        />
      ))}
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
          notes.push(legNotice(id, leg, done, graded.length, bell.label));
        }
        const final = slipAlert(graded, slipCallName(bell.label));
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

export function legNotice(id: string, leg: GradedLeg, done: number, total: number, slip = ''): InboxItem {
  const won = leg.status === 'won';
  const copy = bellLegCopy({ won, slip, label: leg.label, score: legScore(leg, leg.ft || ''), odds: leg.odds.toFixed(2), settled: done, total });
  return {
    id,
    matchId: leg.eventId,
    kind: won ? 'win' : 'bust',
    title: copy.title,
    body: copy.body,
    createdAt: Date.now(),
    read: false,
  };
}
