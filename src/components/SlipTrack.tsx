import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchResults, type RecordPick } from '../lib/results';
import { readBuilder, subscribeBuilder, writeBuilder } from '../lib/builderStore';
import { cx, longDay } from '../lib/format';
import { tipsFromEngine } from '../lib/matchPicks';
import { applyGrades, gradeScore, legsForPacks, slipAlert, trendPacks, type GradedLeg, type LegStatus } from '../lib/slipPacks';
import { useEngineBoard } from '../state/engine';
import type { InboxItem, Match } from '../types';
import { useStore } from '../state/store';
import { Crest } from './Crest';
import type { Team } from '../types';

function teamOf(name: string, crest: string | null): Team {
  return { id: name || 'side', name, shortName: name, abbr: '', color: '#2a303c', crest };
}

function dayOf(iso: string): string {
  const time = Date.parse(iso);
  return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : '';
}

async function gradesFor(legs: Array<{ key: string; eventId: string; market: string; kickoff: string }>, matches: Match[]) {
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

export function SlipTimeline() {
  const { matches } = useStore();
  const { state } = useEngineBoard();
  const [builder, setBuilder] = useState(readBuilder);
  const [legs, setLegs] = useState<GradedLeg[]>([]);
  useEffect(() => subscribeBuilder(() => setBuilder(readBuilder())), []);
  const packs = useMemo(() => trendPacks(tipsFromEngine(state, matches), matches), [state, matches]);
  const source = builder.tracked?.legs?.length ? builder.tracked.legs : legsForPacks(packs, builder.packIds);
  const sourceKey = source.map((leg) => leg.key).join('|');

  useEffect(() => {
    let stop = false;
    if (!source.length) {
      setLegs([]);
      return;
    }
    void gradesFor(source, matches).then((grades) => {
      if (!stop) setLegs(applyGrades(source, grades));
    });
    return () => {
      stop = true;
    };
  }, [matches, sourceKey]);

  if (!source.length) return null;
  const shown = legs.length ? legs : applyGrades(source, new Map());
  const alert = slipAlert(shown);
  const won = shown.filter((leg) => leg.status === 'won').length;
  const played = shown.filter((leg) => leg.status === 'won' || leg.status === 'lost').length;
  const lost = shown.some((leg) => leg.status === 'lost');
  const open = shown.some((leg) => leg.status === 'open');
  const first = source[0]?.kickoff || '';
  const missed = shown.find((leg) => leg.status === 'lost');
  return (
    <section className={cx('slip-time', lost ? 'is-lost' : alert ? 'is-won' : 'is-open')} aria-label="Tracked slip">
      <p className="slip-time-day">{first ? longDay(dayOf(first)) : 'Tracked slip'} · {source.length} {source.length === 1 ? 'leg' : 'legs'}</p>
      <div className="slip-time-banner">
        <strong>{open ? 'Slip open' : lost ? 'Slip lost' : 'Slip won'}</strong>
        <span>{open ? `${played} of ${shown.length} settled` : `${won} of ${played} legs won`}</span>
        {missed && <p>Missed by {missed.home} {missed.ft?.replace('-', '-')} {missed.away}</p>}
      </div>
      <ol className="slip-line">
        {shown.map((leg) => (
          <li key={leg.key} className={cx('is-' + leg.status)}>
            <i />
            <div className="slip-line-main">
              <Crest team={teamOf(leg.home, leg.homeCrest)} size={22} />
              <div>
                <strong>{leg.home} {leg.ft ? leg.ft.replace('-', '-') : ''} {leg.away}</strong>
                <p>
                  {leg.label} · {leg.odds.toFixed(2)} · {leg.status === 'won' ? 'landed' : leg.status === 'lost' ? 'missed' : leg.status === 'void' ? 'void' : 'open'}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ol>
      {alert && <article className="slip-alert"><p>Betspapa · Slips</p><strong>{alert.title}</strong><span>{alert.body}</span></article>}
      {!builder.tracked && <Link to="/trends" className="rec-codes-link">Book and track this slip</Link>}
    </section>
  );
}
