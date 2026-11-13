import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BookMark } from '../components/BookMark';
import { Crest } from '../components/Crest';
import { PickCard } from '../components/PickCard';
import { catalogCrest, loadCrestCatalog, type CrestCatalog } from '../lib/crestCatalog';
import {
  DESK_NAMES,
  DESKS,
  ENGINE_POLL_MS,
  deskBook,
  fetchEngine,
  marketLabel,
  picksLabel,
  readEngineCache,
  showOdds,
  splitMatch,
  visibleLegs,
  writeEngineCache,
  type DeskId,
  type EngineBook,
  type EngineSlip,
  type EngineState,
} from '../lib/engineSlips';
import { cx } from '../lib/format';
import type { Team } from '../types';
import { useProduct } from '../state/product';
import { useStore } from '../state/store';

const emptyCatalog: CrestCatalog = { byKey: {}, byId: {} };

function when(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'team';
}

function abbr(name: string): string {
  const parts = name.replace(/[^A-Za-z ]/g, '').split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 3).toUpperCase();
}

function namedTeam(name: string, catalog: CrestCatalog): Team {
  const team: Team = { id: slug(name), name, shortName: name, abbr: abbr(name), color: '#2a303c' };
  const crest = catalogCrest(catalog, team);
  return crest ? { ...team, crest } : team;
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

function useEngineSlips() {
  const [state, setState] = useState<EngineState | null>(() => readEngineCache());
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    let stop = false;
    const pull = async () => {
      try {
        const next = await fetchEngine();
        if (stop) return;
        writeEngineCache(next);
        setState(next);
        setProblem(null);
      } catch (error) {
        if (!stop) setProblem(error instanceof Error ? error.message : 'Could not load slips');
      }
    };
    void pull();
    const timer = window.setInterval(() => void pull(), ENGINE_POLL_MS);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, []);
  return { state, problem };
}

export function SlipsPage() {
  const [params] = useSearchParams();
  const focus = params.get('trend');
  const requested = params.get('book');
  const { state, problem } = useEngineSlips();
  const { picks, slip } = useProduct();
  const { matches } = useStore();
  const [desk, setDesk] = useState<DeskId>(DESKS.includes(requested as DeskId) ? (requested as DeskId) : 'sportybet');
  const [openTrend, setOpenTrend] = useState<string | null>(focus);
  const [dropsOpen, setDropsOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CrestCatalog>(emptyCatalog);

  useEffect(() => {
    void loadCrestCatalog().then(setCatalog);
  }, []);

  useEffect(() => {
    if (!focus) return;
    setOpenTrend(focus);
    document.getElementById(`slip-${focus}`)?.scrollIntoView({ block: 'center' });
  }, [focus, state]);

  const master = state?.master ?? null;
  const book = deskBook(master, desk);
  const trends = state?.trends ?? [];
  const legs = picks.filter((pick) => slip.includes(pick.id));
  const won = legs.filter((pick) => pick.status === 'won').length;
  const bust = legs.filter((pick) => pick.status === 'bust').length;

  const copy = (id: string, value: string) => {
    void copyText(value).then(() => {
      setCopied(id);
      window.setTimeout(() => setCopied((current) => (current === id ? null : current)), 1500);
    });
  };

  return (
    <div className="stack slips-page">
      <div className="book-switch" role="tablist" aria-label="Bookmaker">
        {DESKS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={desk === id}
            className={cx('book-chip', `book-chip-${id}`, desk === id && 'is-on')}
            onClick={() => {
              setDesk(id);
              setDropsOpen(false);
            }}
          >
            <BookMark id={id} />
            <span>{DESK_NAMES[id]}</span>
          </button>
        ))}
      </div>

      {!state && <p className="lede">{problem ? 'Could not load slips. Codes appear when the engine responds.' : 'Loading slips.'}</p>}

      <MasterHero desk={desk} book={book} master={master} copied={copied} onCopy={copy} />

      {book.dropped.length > 0 && (
        <section className="drop-note">
          <button type="button" className="drop-toggle" aria-expanded={dropsOpen} onClick={() => setDropsOpen((open) => !open)}>
            {picksLabel(book.dropped.length)} not on this bookmaker
          </button>
          {dropsOpen && (
            <ul className="drop-list">
              {book.dropped.map((drop) => (
                <li key={`${drop.eventId}:${drop.market}:${drop.reason}`}>
                  <strong>{drop.match}</strong>
                  <span>
                    {marketLabel(drop.market)} · {drop.reason}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="stack-block">
        <h2>Trends</h2>
        {trends.length === 0 ? (
          <p className="lede">No trend codes yet.</p>
        ) : (
          trends.map((trend) => (
            <TrendSlip
              key={trend.id}
              trend={trend}
              desk={desk}
              open={openTrend === trend.id}
              focused={focus === trend.id}
              copied={copied}
              catalog={catalog}
              matches={matches}
              onToggle={() => setOpenTrend((current) => (current === trend.id ? null : trend.id))}
              onCopy={copy}
            />
          ))
        )}
      </section>

      <section className="stack-block">
        <h2>Your slip</h2>
        <p className="lede">
          {legs.length} saved · {legs.length - won - bust} open · {won} won · {bust} bust. Add or remove a pick from the board. These stay on the phone.
        </p>
        {legs.length === 0 ? (
          <p className="lede">Nothing saved. Qualifying tips can still be added from Picks.</p>
        ) : (
          legs.slice(0, 8).map((pick) => <PickCard key={pick.id} pick={pick} />)
        )}
        {legs.length > 8 && <p className="lede">Showing 8 of {legs.length} saved picks.</p>}
      </section>
    </div>
  );
}

function MasterHero({
  desk,
  book,
  master,
  copied,
  onCopy,
}: {
  desk: DeskId;
  book: EngineBook;
  master: EngineSlip | null;
  copied: string | null;
  onCopy: (id: string, value: string) => void;
}) {
  const booked = when(master?.bookedAt);
  return (
    <article className={cx('master-hero', `book-${desk}`)}>
      <header>
        <BookMark id={desk} />
        <div>
          <p className="master-kicker">Master slip</p>
          <strong>{DESK_NAMES[desk]}</strong>
        </div>
      </header>
      {book.parts.length ? (
        book.parts.map((part) => {
          const odds = showOdds(part.totalOdds);
          const id = `master:${desk}:${part.code}`;
          return (
            <div className="master-part" key={part.code}>
              <p className="master-code">{part.code}</p>
              <p className="master-meta">
                {picksLabel(part.legs)}
                {odds ? ` · ${odds}` : ''}
              </p>
              <div className="master-actions">
                <button type="button" className="btn" onClick={() => onCopy(id, part.code)}>
                  {copied === id ? 'Copied' : 'Copy'}
                </button>
                <a className="btn" href={part.link} target="_blank" rel="noreferrer">
                  Load
                </a>
              </div>
            </div>
          );
        })
      ) : (
        <p className="master-code">No code yet</p>
      )}
      {book.parts.length > 0 && booked && <p className="master-when">Booked {booked}</p>}
    </article>
  );
}

function TrendSlip({
  trend,
  desk,
  open,
  focused,
  copied,
  catalog,
  matches,
  onToggle,
  onCopy,
}: {
  trend: EngineSlip;
  desk: DeskId;
  open: boolean;
  focused: boolean;
  copied: string | null;
  catalog: CrestCatalog;
  matches: ReturnType<typeof useStore>['matches'];
  onToggle: () => void;
  onCopy: (id: string, value: string) => void;
}) {
  const book = deskBook(trend, desk);
  const codes = book.parts.map((part) => part.code);
  const odds = book.parts.map((part) => showOdds(part.totalOdds)).filter((value): value is string => Boolean(value));
  const count = book.parts.length ? book.parts.reduce((sum, part) => sum + part.legs, 0) : visibleLegs(trend).length;
  const copyId = `trend:${desk}:${trend.id}`;
  const legs = visibleLegs(trend);
  return (
    <article id={`slip-${trend.id}`} className={cx('slip-trend', open && 'is-open', focused && 'trend-focus')}>
      <div className="slip-trend-top">
        <button type="button" className="slip-trend-main" aria-expanded={open} onClick={onToggle}>
          <strong>{trend.label}</strong>
          <span className="slip-code">{codes.length ? codes.join(' · ') : 'No code yet'}</span>
        </button>
        <p className="slip-meta">
          {picksLabel(count)}
          {odds.length ? ` · ${odds.join(' · ')}` : ''}
        </p>
        {codes.length > 0 && (
          <button type="button" className="btn btn-quiet btn-tiny" onClick={() => onCopy(copyId, codes.join('\n'))}>
            {copied === copyId ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>
      {open && (
        <ul className="slip-legs">
          {legs.map((leg) => {
            const [homeName, awayName] = splitMatch(leg.match);
            const board = matches.find((match) => match.id === leg.eventId);
            const home = board?.home ?? namedTeam(homeName, catalog);
            const away = awayName ? (board?.away ?? namedTeam(awayName, catalog)) : null;
            const price = showOdds(leg.odds);
            const kick = when(leg.kickoff);
            return (
              <li key={`${leg.eventId}:${leg.market}`}>
                <span className="slip-leg-teams">
                  <Crest team={home} size={22} />
                  <span>{home.shortName}</span>
                  {away && (
                    <>
                      <span className="muted">vs</span>
                      <Crest team={away} size={22} />
                      <span>{away.shortName}</span>
                    </>
                  )}
                </span>
                <span className="slip-leg-meta">
                  {marketLabel(leg.market)}
                  {price ? ` · ${price}` : ''}
                  {kick ? ` · ${kick}` : ''}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}
