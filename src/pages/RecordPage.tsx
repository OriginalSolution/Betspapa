import { useEffect, useMemo, useState } from 'react';
import { friendlyError } from '../lib/apiJson';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { BookMark } from '../components/BookMark';
import { Crest } from '../components/Crest';
import { DESK_NAMES, DESKS, type DeskId } from '../lib/engineSlips';
import { cx, longDay, weekdayChip } from '../lib/format';
import {
  accraToday,
  bandLine,
  dayWindow,
  fetchResults,
  halfText,
  hitPercent,
  kickClock,
  recordingSince,
  recordMarket,
  scoreText,
  type RecordCode,
  type RecordPick,
  type ResultsView,
} from '../lib/results';
import type { Team } from '../types';
import { useStore } from '../state/store';

const BAR: Record<string, string> = {
  over15: 'red',
  over25: 'red',
  over35: 'gold',
  under15: 'gold',
  under25: 'gold',
  under35: 'gold',
  'dc-12': 'gold',
  'dc-1x': 'red',
  'dc-x2': 'gold',
  'sh-over05': 'green',
  'fh-over05': 'green',
  'home-score': 'gold',
  'away-score': 'gold',
  btts: 'green',
};

function teamOf(name: string, crest: string | null): Team {
  return { id: name || 'team', name, shortName: name, abbr: '', color: '#2a303c', crest };
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

export function RecordPage() {
  const { pathname } = useLocation();
  const [params, setParams] = useSearchParams();
  const { updatedAt } = useStore();
  const requested = params.get('day') || '';
  const [view, setView] = useState<ResultsView | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'won' | 'lost' | 'league'>('all');

  useEffect(() => {
    let stop = false;
    const day = requested || accraToday();
    void fetchResults(day)
      .then((next) => {
        if (!stop) {
          setView(next);
          setProblem(null);
        }
      })
      .catch((error: unknown) => {
        if (!stop) setProblem(friendlyError(error, 'Could not load the record. Check your connection and try again.'));
      });
    return () => {
      stop = true;
    };
  }, [requested, updatedAt]);

  const day = view?.day || requested || accraToday();
  const href = (path: string, nextDay = day) => `${path}?day=${encodeURIComponent(nextDay)}`;
  const choose = (nextDay: string) => {
    const next = new URLSearchParams(params);
    next.set('day', nextDay);
    setParams(next, { replace: true });
  };

  const graded = useMemo(() => (view?.picks || []).filter((pick) => pick.status === 'won' || pick.status === 'lost'), [view]);
  const shown = useMemo(() => {
    if (filter === 'won') return graded.filter((pick) => pick.status === 'won');
    if (filter === 'lost') return graded.filter((pick) => pick.status === 'lost');
    return graded;
  }, [filter, graded]);

  const copy = (id: string, value: string) => {
    void copyText(value).then(() => {
      setCopied(id);
      window.setTimeout(() => setCopied((current) => (current === id ? null : current)), 1400);
    });
  };

  return (
    <div className="stack record-page">
      {pathname === '/record' && <DayStrip day={day} onChoose={choose} />}
      {!view && <p className="lede">{problem ? 'Could not load the record. It appears when the server responds.' : 'Loading the record.'}</p>}
      {view && pathname === '/record' && <DaySummary view={view} picksHref={href('/record/picks')} codesHref={href('/record/codes')} />}
      {view && pathname === '/record/picks' && (
        <GradedList
          view={view}
          filter={filter}
          shown={shown}
          graded={graded}
          onFilter={setFilter}
        />
      )}
      {view && pathname === '/record/codes' && <CodesRecord view={view} copied={copied} onCopy={copy} />}
    </div>
  );
}

function DayStrip({ day, onChoose }: { day: string; onChoose: (day: string) => void }) {
  return (
    <div className="rec-days" role="tablist" aria-label="Matchday">
      {dayWindow(day).map((iso) => {
        const chip = weekdayChip(iso);
        const on = iso === day;
        return (
          <button key={iso} type="button" role="tab" aria-selected={on} className={cx('rec-day', on && 'is-on')} onClick={() => onChoose(iso)}>
            <small>{chip.weekday}</small>
            <strong>{chip.day}</strong>
          </button>
        );
      })}
    </div>
  );
}

function DaySummary({ view, picksHref, codesHref }: { view: ResultsView; picksHref: string; codesHref: string }) {
  const { summary } = view;
  const pct = hitPercent(summary.won, summary.graded);
  const label = longDay(view.day);
  return (
    <>
      <Link to={picksHref} className="rec-hero">
        <Ring percent={pct} />
        <div>
          <p className="rec-kicker">{label}</p>
          <strong className="rec-hero-title">
            {summary.graded > 0 ? `${summary.graded} ${summary.graded === 1 ? 'pick' : 'picks'} graded at full time` : 'No picks graded at full time yet'}
          </strong>
          {summary.graded > 0 ? (
            <p className="rec-pills">
              <span className="rec-won">{summary.won} won</span>
              <span className="rec-lost">{summary.lost} lost</span>
            </p>
          ) : (
            <p className="rec-open-count">
              {summary.picks === 0 ? 'Nothing published on this day yet' : `${summary.picks} ${summary.picks === 1 ? 'pick' : 'picks'} on the record`}
              {summary.open > 0 ? ` · ${summary.open} still open` : ''}
            </p>
          )}
          <p className="rec-since">{recordingSince(view.since)}</p>
        </div>
      </Link>
      <p className="rec-note">Losses stay on the record. Nothing is removed after kick-off.</p>
      <section className="rec-block" aria-label="Hit rate by market">
        <div className="tip-head">
          <h2>Hit rate by market</h2>
          <span>{label}</span>
        </div>
        {view.markets.length === 0 ? (
          <p className="lede">Bars appear after the first full-time score. Open picks are not counted yet.</p>
        ) : (
          <ul className="rec-markets">
            {view.markets.map((market) => {
              const pctMarket = hitPercent(market.won, market.graded) || 0;
              return (
                <li key={market.market}>
                  <div className="rec-market-top">
                    <span>{recordMarket(market.market)}</span>
                    <b>
                      {market.won}/{market.graded}
                    </b>
                    <em className={pctMarket >= 70 ? 'is-good' : 'is-bad'}>{pctMarket}%</em>
                  </div>
                  <div className="rec-bar" aria-hidden="true">
                    <i className={cx('rec-bar-fill', `is-${BAR[market.market] || 'red'}`)} style={{ width: `${pctMarket}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <Link to={codesHref} className="rec-codes-link">
          Codes and odds bands
        </Link>
      </section>
    </>
  );
}

function Ring({ percent }: { percent: number | null }) {
  const radius = 42;
  const turn = 2 * Math.PI * radius;
  const dash = percent == null ? 0 : (percent / 100) * turn;
  return (
    <div className="rec-ring" aria-hidden="true">
      <svg viewBox="0 0 108 108">
        <circle cx="54" cy="54" r={radius} />
        {percent != null && percent > 0 && <circle cx="54" cy="54" r={radius} strokeDasharray={`${dash} ${turn}`} />}
      </svg>
      <div>
        <strong>{percent == null ? '–' : `${percent}%`}</strong>
        <span>Hit rate</span>
      </div>
    </div>
  );
}

function GradedList({
  view,
  filter,
  shown,
  graded,
  onFilter,
}: {
  view: ResultsView;
  filter: 'all' | 'won' | 'lost' | 'league';
  shown: RecordPick[];
  graded: RecordPick[];
  onFilter: (filter: 'all' | 'won' | 'lost' | 'league') => void;
}) {
  const won = graded.filter((pick) => pick.status === 'won').length;
  const lost = graded.filter((pick) => pick.status === 'lost').length;
  const open = view.picks.filter((pick) => pick.status === 'open');
  const groups = filter === 'league' ? groupByLeague(shown) : [{ name: '', picks: shown }];
  return (
    <>
      <div className="rec-filters" role="tablist" aria-label="Graded picks">
        <Filter on={filter === 'all'} onClick={() => onFilter('all')}>{`All ${graded.length}`}</Filter>
        <Filter on={filter === 'won'} onClick={() => onFilter('won')}>{`Won ${won}`}</Filter>
        <Filter on={filter === 'lost'} onClick={() => onFilter('lost')}>{`Lost ${lost}`}</Filter>
        <Filter on={filter === 'league'} onClick={() => onFilter('league')}>By league</Filter>
      </div>
      {shown.length === 0 && (
        <p className="lede">
          {open.length > 0
            ? `${open.length} ${open.length === 1 ? 'pick is' : 'picks are'} still open. A grade appears when the full-time score is in.`
            : 'No graded picks on this day.'}
        </p>
      )}
      {shown.length > 0 && groups.map((group) => (
        <section key={group.name || 'all'} className="rec-block" aria-label={group.name || 'Graded picks'}>
          {group.name && <h2 className="rec-league">{group.name}</h2>}
          {group.picks.map((pick) => (
            <PickRow key={pick.key} pick={pick} />
          ))}
        </section>
      ))}
      {shown.length === 0 && open.length > 0 && (
        <section className="rec-block" aria-label="Open picks">
          <h2 className="rec-league">Still open</h2>
          {open.map((pick) => (
            <PickRow key={pick.key} pick={pick} />
          ))}
        </section>
      )}
    </>
  );
}

function Filter({ on, onClick, children }: { on: boolean; onClick: () => void; children: string }) {
  return (
    <button type="button" role="tab" aria-selected={on} className={cx('rec-filter', on && 'is-on')} onClick={onClick}>
      {children}
    </button>
  );
}

function groupByLeague(picks: RecordPick[]) {
  const groups = new Map<string, RecordPick[]>();
  for (const pick of picks) {
    const name = pick.tournament || pick.country || 'Other';
    groups.set(name, [...(groups.get(name) || []), pick]);
  }
  return [...groups.entries()].map(([name, rows]) => ({ name, picks: rows }));
}

function PickRow({ pick }: { pick: RecordPick }) {
  const open = pick.status === 'open' || pick.status === 'void';
  return (
    <article className="rec-pick">
      <div className="rec-sides">
        <Crest team={teamOf(pick.home, pick.homeCrest)} size={22} />
        <Crest team={teamOf(pick.away, pick.awayCrest)} size={22} />
      </div>
      <div className="rec-pick-main">
        <strong>{pick.home}</strong>
        <strong>{pick.away}</strong>
        <p>
          {recordMarket(pick.market)}
          {Number.isFinite(pick.odds) ? ` · ${pick.odds.toFixed(2)}` : ''}
          {pick.sample ? ` · was ${pick.sample}` : ''}
        </p>
      </div>
      <div className={cx('rec-result', pick.status === 'won' && 'is-won', pick.status === 'lost' && 'is-lost')}>
        {open ? (
          <b className="rec-wait">{pick.status === 'void' ? pick.note || 'Void' : kickClock(pick.kickoff)}</b>
        ) : (
          <>
            <b>{scoreText(pick.ft)}</b>
            {pick.ht && <small>{halfText(pick.ht)}</small>}
          </>
        )}
        <i className={cx('rec-mark', `is-${pick.status}`)} aria-label={pick.status} />
      </div>
    </article>
  );
}

function CodesRecord({ view, copied, onCopy }: { view: ResultsView; copied: string | null; onCopy: (id: string, value: string) => void }) {
  const master = view.codes.filter((code) => code.slipId === 'master');
  const codes = master.length ? master : view.codes;
  const legs = codes.reduce((sum, code) => sum + code.legCount, 0);
  const first = codes.map((code) => code.firstKickoff).sort()[0];
  const slipName = codes[0]?.slip || '80%+ Master Slip';
  return (
    <>
      <section className="rec-slip-head">
        <div>
          <p>{dayWord(view.day)} · {slipName}</p>
          {codes.length > 0 && <strong>{legs === 1 ? '1 leg' : `${legs} legs`}{first ? ` · first KO ${kickClock(first)}` : ''}</strong>}
        </div>
      </section>
      {codes.length === 0 ? (
        <p className="lede">No booked code for this day. A code is stored when the master slip is published, in the same parts the desk returned.</p>
      ) : (
        <ul className="rec-codes">
          {codeRows(codes).map((row) => (
            <CodeRow key={row.code.id} code={row.code} part={row.part} parts={row.parts} copied={copied === row.code.id} onCopy={() => onCopy(row.code.id, row.code.code)} />
          ))}
        </ul>
      )}
      <p className="rec-note">A code is graded the moment its last leg ends. One lost leg marks the code lost.</p>
      <section className="rec-block" aria-label="Market by odds band">
        <div className="tip-head">
          <h2>Market × odds band</h2>
          <span>{longDay(view.day)}</span>
        </div>
        <div className="rec-table">
          <div className="rec-table-head">
            <span>Market</span>
            <span>1.18–1.25</span>
            <span>1.26+</span>
          </div>
          {view.markets.length === 0 && <p className="lede">No graded picks in these bands yet.</p>}
          {view.markets.map((market) => (
            <div key={market.market} className="rec-table-row">
              <span>{recordMarket(market.market)}</span>
              <Band won={market.low.won} graded={market.low.graded} />
              <Band won={market.high.won} graded={market.high.graded} />
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function codeRows(codes: RecordCode[]) {
  return DESKS.flatMap((desk) => {
    const rows = codes.filter((code) => code.desk === desk);
    return rows.map((code, index) => ({ code, part: rows.length > 1 ? index + 1 : 0, parts: rows.length }));
  });
}

function dayWord(day: string): string {
  const today = accraToday();
  if (day === today) {
    const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Africa/Accra' }).format(new Date()));
    return hour >= 17 ? 'Tonight' : 'Today';
  }
  return longDay(day);
}

function Band({ won, graded }: { won: number; graded: number }) {
  const pct = hitPercent(won, graded);
  return (
    <span className="rec-band">
      <b className={pct == null ? '' : pct >= 70 ? 'is-good' : 'is-bad'}>{bandLine({ won, graded })}</b>
      {graded > 0 && <small>{won}/{graded}</small>}
    </span>
  );
}

function CodeRow({ code, part, parts, copied, onCopy }: { code: RecordCode; part: number; parts: number; copied: boolean; onCopy: () => void }) {
  const desk = code.desk as DeskId;
  const name = DESK_NAMES[desk] || code.desk;
  const state = code.status === 'open' ? `${code.settled}/${code.legCount} settled` : code.status === 'won' ? 'Won' : code.status === 'lost' ? 'Lost' : 'Void';
  return (
    <li className="rec-code">
      <BookMark id={code.desk} />
      <div>
        <strong>{name}{part ? ` · part ${part}/${parts}` : ''}</strong>
        <span className={cx('rec-code-state', `is-${code.status}`)}>{state}</span>
      </div>
      <b>{code.code}</b>
      <button type="button" className="rec-copy" onClick={onCopy}>{copied ? 'Copied' : 'Copy'}</button>
    </li>
  );
}
