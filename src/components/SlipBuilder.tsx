import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { bookGroups, type BookLeg } from '../lib/bookFollow';
import { readBuilder, subscribeBuilder, writeBuilder, type BookedPart } from '../lib/builderStore';
import { DESK_NAMES, DESKS, type DeskId } from '../lib/engineSlips';
import { cx } from '../lib/format';
import { tipsFromEngine } from '../lib/matchPicks';
import { combinedOdds, legsForPacks, partsOf, trendPacks, type BuilderLeg, type TrendPack } from '../lib/slipPacks';
import { useEngineBoard } from '../state/engine';
import { useStore } from '../state/store';
import { BookMark } from './BookMark';
import { Crest } from './Crest';
import type { Team } from '../types';

function teamOf(name: string, crest: string | null): Team {
  return { id: name || 'side', name, shortName: name, abbr: '', color: '#2a303c', crest };
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return;
  } catch {
    /* the WebView can refuse the async clipboard */
  }
  const area = document.createElement('textarea');
  area.value = value;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.left = '-9999px';
  document.body.appendChild(area);
  area.select();
  document.execCommand('copy');
  area.remove();
}

export function SlipBuilder() {
  const { state } = useEngineBoard();
  const { matches } = useStore();
  const [builder, setBuilder] = useState(readBuilder);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => subscribeBuilder(() => setBuilder(readBuilder())), []);

  const packs = useMemo(() => trendPacks(tipsFromEngine(state, matches), matches), [state, matches]);
  const selected = builder.tracked?.legs?.length ? builder.tracked.legs : legsForPacks(packs, builder.packIds);
  const odds = combinedOdds(selected);
  const added = new Set(builder.packIds);

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
      const groups = partsOf(selected).map((legs, index) => ({ id: `slip-${index + 1}`, legs: legs.map(bookLeg) }));
      const booked = await bookGroups(groups);
      const parts: BookedPart[] = [];
      const reasons: string[] = [];
      for (const group of booked) {
        if (group.reason) reasons.push(group.reason);
        for (const desk of DESKS) {
          for (const part of group.books?.[desk]?.parts || []) {
            if (part.code) parts.push({ desk, code: part.code, legs: part.legs });
          }
        }
      }
      if (!parts.length) {
        setProblem(reasons[0] || 'No desk returned a code. Nothing was invented.');
        return;
      }
      writeBuilder({
        packIds: builder.packIds,
        tracked: {
          id: `slip-${Date.now().toString(36)}`,
          legs: selected,
          bookedAt: new Date().toISOString(),
          parts,
          alerted: false,
        },
      });
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Booking failed.');
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
          <span>{selected.length} {selected.length === 1 ? 'leg' : 'legs'} · {odds ? odds.toFixed(2) : '—'}</span>
        </div>
        {selected.length === 0 ? (
          <p className="lede">Add a whole trend. Every pick in it has to sit inside the odds table.</p>
        ) : (
          <ul className="pack-legs">
            {selected.map((leg) => (
              <li key={leg.key}>
                <Crest team={teamOf(leg.home, leg.homeCrest)} size={22} />
                <span>{leg.home}</span>
                <b>{leg.odds.toFixed(2)}</b>
                {editing && (
                  <button type="button" className="pack-remove" onClick={() => removeLeg(builder.packIds, packs, leg)} aria-label={`Remove the ${leg.label} trend`}>
                    Remove trend
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {builder.tracked && builder.tracked.parts.length > 0 && (
          <ul className="pack-codes">
            {builder.tracked.parts.map((part) => (
              <li key={`${part.desk}:${part.code}`}>
                <BookMark id={part.desk} />
                <span>{DESK_NAMES[part.desk as DeskId] || part.desk}</span>
                <b>{part.code}</b>
                <button
                  type="button"
                  className="rec-copy"
                  onClick={() => {
                    void copyText(part.code);
                    setCopied(part.code);
                  }}
                >
                  {copied === part.code ? 'Copied' : 'Copy'}
                </button>
              </li>
            ))}
          </ul>
        )}
        {problem && <p className="lede">{problem}</p>}
        <Link to="/slips" className="rec-codes-link">
          Open the tracked slip
        </Link>
      </section>

      <div className="pack-bar">
        <div>
          <p>Slip · {selected.length} {selected.length === 1 ? 'leg' : 'legs'}</p>
          <strong>{odds ? odds.toFixed(2) : '—'}</strong>
        </div>
        <button type="button" className="pack-edit" onClick={() => setEditing((value) => !value)} disabled={!selected.length}>
          {editing ? 'Done' : 'Edit'}
        </button>
        <button type="button" className="pack-book" onClick={() => void book()} disabled={!selected.length || busy}>
          {busy ? 'Booking' : 'Book + track'}
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
