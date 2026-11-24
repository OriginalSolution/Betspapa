import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { bookingFailureMessage, bookGroups, type BookLeg } from '../lib/bookFollow';
import { desksFromBooking, failedDeskLine } from '../lib/bookedSlip';
import { readBuilder, subscribeBuilder, writeBuilder } from '../lib/builderStore';
import { cx } from '../lib/format';
import { tipsFromEngine } from '../lib/matchPicks';
import { legsForPacks, PART_SIZE, partsOf, totalOddsLine, trendPacks, type BuilderLeg, type TrendPack } from '../lib/slipPacks';
import { goToBookedCodes } from '../lib/useFreshCodes';
import { useEngineBoard } from '../state/engine';
import { useStore } from '../state/store';
import { Crest } from './Crest';
import { catalogCrest, loadCrestCatalog, type CrestCatalog } from '../lib/crestCatalog';
import { crestKey } from '../lib/crests';
import { marketLabel } from '../lib/engineSlips';
import { kickoffClock } from '../lib/format';
import type { Team } from '../types';

function teamOf(name: string, crest: string | null): Team {
  return { id: name || 'side', name, shortName: name, abbr: '', color: '#2a303c', crest };
}

/** Badge for a slip side: the leg's own, then today's board, then the bundled catalogue. */
function sideCrest(name: string, own: string | null, board: Map<string, string>, catalog: CrestCatalog | null): string | null {
  if (own) return own;
  const fromBoard = board.get(crestKey(name));
  if (fromBoard) return fromBoard;
  return catalog ? catalogCrest(catalog, { id: '', name }) : null;
}

export function SlipBuilder() {
  const navigate = useNavigate();
  const { state } = useEngineBoard();
  const { matches } = useStore();
  const [builder, setBuilder] = useState(readBuilder);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => subscribeBuilder(() => setBuilder(readBuilder())), []);
  const [catalog, setCatalog] = useState<CrestCatalog | null>(null);
  useEffect(() => {
    let alive = true;
    void loadCrestCatalog().then((loaded) => {
      if (alive) setCatalog(loaded);
    });
    return () => {
      alive = false;
    };
  }, []);
  const boardCrests = useMemo(() => {
    const found = new Map<string, string>();
    for (const match of matches) {
      for (const team of [match.home, match.away]) {
        if (!team.crest) continue;
        found.set(crestKey(team.name), team.crest);
        if (team.shortName) found.set(crestKey(team.shortName), team.crest);
      }
    }
    return found;
  }, [matches]);

  const packs = useMemo(() => trendPacks(tipsFromEngine(state, matches), matches), [state, matches]);
  const selected = builder.tracked?.legs?.length ? builder.tracked.legs : legsForPacks(packs, builder.packIds);
  const added = new Set(builder.packIds);
  const matchCount = new Set(selected.map((leg) => leg.eventId)).size;
  const average = selected.length ? selected.reduce((sum, leg) => sum + leg.odds, 0) / selected.length : 0;
  const partCount = selected.length ? Math.ceil(selected.length / PART_SIZE) : 0;

  const toggle = (pack: TrendPack) => {
    const packIds = added.has(pack.id) ? builder.packIds.filter((id) => id !== pack.id) : [...builder.packIds, pack.id];
    writeBuilder({ packIds, tracked: null });
    setProblem(null);
  };

  const book = async () => {
    if (!selected.length || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const chunks = partsOf(selected);
      const groups = chunks.map((legs, index) => ({ id: `slip-${index + 1}`, legs: legs.map(bookLeg) }));
      const booked = await bookGroups(groups);
      const desks = desksFromBooking(selected.length, chunks, booked);
      const parts = desks.flatMap((desk) => desk.parts.map((part) => ({ desk: desk.desk, code: part.code, legs: part.legs })));
      const reasons = booked.map((group) => group.reason).filter((reason): reason is string => Boolean(reason));
      const failed = failedDeskLine(desks);
      if (!parts.length) {
        setProblem(failed || reasons[0] || 'No desk returned a code. Nothing was invented.');
        return;
      }
      writeBuilder({
        packIds: builder.packIds,
        tracked: {
          id: `slip-${Date.now().toString(36)}`,
          legs: selected,
          bookedAt: new Date().toISOString(),
          parts,
          desks,
          alerted: false,
        },
      });
      // Land on the booked codes with an arrival animation and the new codes glowing.
      goToBookedCodes(navigate, '/slips/booked', parts.map((part) => ({ code: part.code, desk: part.desk })));
    } catch (error) {
      setProblem(bookingFailureMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack slip-builder">
      {!state && <p className="lede">Loading today’s trends.</p>}
      {state && packs.length === 0 && <p className="lede">No 80%+ trend is open inside the odds table right now.</p>}
      {packs.map((pack) => {
        const on = added.has(pack.id);
        return (
          <article key={pack.id} className="pack-row">
            <div>
              <strong>{pack.label}</strong>
              <p>{pack.legs.length} {pack.legs.length === 1 ? 'pick' : 'picks'} today · 80%+</p>
            </div>
            <button type="button" className={cx('pack-add', on && 'is-on')} onClick={() => toggle(pack)} aria-pressed={on}>
              {on ? 'Added' : 'Add'}
            </button>
          </article>
        );
      })}

      <section className="pack-slip" aria-label="In your slip">
        <div className="tip-head">
          <h2>In your slip</h2>
          <span>
            {selected.length} legs · {matchCount} matches
            {selected.length ? ` · avg ${average.toFixed(2)} · ${totalOddsLine(selected)}` : ' · avg —'}
          </span>
        </div>
        {selected.length === 0 ? (
          <p className="lede">Add a whole trend. Every pick in it has to sit inside the odds table.</p>
        ) : (
          <ul className="pack-legs">
            {selected.map((leg) => (
              <li key={leg.key} className={cx('slip-leg', editing && 'is-editing')}>
                <span className="slip-leg-crests" aria-hidden="true">
                  <Crest team={teamOf(leg.home, sideCrest(leg.home, leg.homeCrest, boardCrests, catalog))} size={22} fallback="initials" />
                  <Crest team={teamOf(leg.away, sideCrest(leg.away, leg.awayCrest, boardCrests, catalog))} size={22} fallback="initials" />
                </span>
                <span className="slip-leg-main">
                  <span className="slip-leg-teams">
                    {leg.home} <i>v</i> {leg.away}
                  </span>
                  <small>
                    {marketLabel(leg.market)}
                    {leg.kickoff ? ` · ${kickoffClock(leg.kickoff)}` : ''}
                  </small>
                </span>
                <b className="slip-leg-odds">{leg.odds.toFixed(2)}</b>
                {editing && (
                  <button type="button" className="pack-remove" onClick={() => removeLeg(builder.packIds, packs, leg)} aria-label={`Remove the ${leg.label} trend`}>
                    Remove trend
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {problem && <p className="lede">{problem}</p>}
      </section>

      <div className={cx('pack-bar', busy && 'is-busy', problem && 'has-problem')} aria-busy={busy}>
        {busy && <i className="pack-bar-progress" aria-hidden="true" />}
        <div>
          <p>Slip · {added.size} {added.size === 1 ? 'trend' : 'trends'}</p>
          <strong className="pack-facts">
            {selected.length} legs · {matchCount} matches
            {selected.length && partCount === 1 ? <> · <span className="pack-odds">{totalOddsLine(selected)}</span></> : ''}
          </strong>
          <span role={busy || problem ? 'status' : undefined} className={problem && !busy ? 'pack-bar-error' : undefined}>
            {busy
              ? 'Booking your codes… this can take a moment'
              : problem
                ? problem
                : selected.length
                  ? `${partCount > 1 ? `${totalOddsLine(selected)} · ` : ''}Avg price ${average.toFixed(2)} · ${partCount} ${partCount === 1 ? 'part' : 'parts'} (max ${PART_SIZE})`
                  : 'Add a whole trend'}
          </span>
        </div>
        <button type="button" className="pack-edit" onClick={() => setEditing((value) => !value)} disabled={!selected.length || busy}>
          {editing ? 'Done' : 'Edit'}
        </button>
        <button
          type="button"
          className={cx('pack-book', busy && 'is-busy')}
          onClick={() => void book()}
          disabled={!selected.length || busy}
          aria-busy={busy}
        >
          {busy ? (
            <>
              <i className="pack-book-spin" aria-hidden="true" />
              <span className="pack-book-label">Booking…</span>
            </>
          ) : problem ? (
            'Retry'
          ) : (
            'Book + track'
          )}
        </button>
      </div>
    </div>
  );
}

function bookLeg(leg: BuilderLeg): BookLeg {
  return { eventId: leg.eventId, market: leg.market, odds: leg.odds, kickoff: leg.kickoff, match: `${leg.home} vs ${leg.away}` };
}

function removeLeg(packIds: string[], packs: TrendPack[], leg: BuilderLeg) {
  const owner = packs.find((pack) => pack.legs.some((item) => item.key === leg.key));
  if (!owner) return;
  writeBuilder({ packIds: packIds.filter((id) => id !== owner.id), tracked: null });
}
