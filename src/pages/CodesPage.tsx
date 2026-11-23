import { useCallback, useEffect, useRef, useState } from 'react';
import { friendlyError } from '../lib/apiJson';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Crest } from '../components/Crest';
import {
  dayChip,
  fetchCodes,
  gmtClock,
  gmtDay,
  mixText,
  oddsText,
  readbackLine,
  refreshCodes,
  type CodeNotice,
  type CodePart,
  type CodeSlot,
  type CodesView,
} from '../lib/codes';
import { recordingSince } from '../lib/results';
import { cx } from '../lib/format';
import { useStore } from '../state/store';

const SEEN = 'betspapa.codeNotices';

function seenIds(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(SEEN) || '[]');
    return new Set(Array.isArray(raw) ? raw.filter((id) => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

function remember(id: string) {
  const next = seenIds();
  next.add(id);
  localStorage.setItem(SEEN, JSON.stringify([...next].slice(-40)));
}

export function CodeAlertCard({ notice, onOpen }: { notice: CodeNotice; onOpen: () => void }) {
  return (
    <button type="button" className="code-alert" onClick={onOpen}>
      <span className="code-alert-kicker">Betspapa · Codes</span>
      <strong>{notice.title}</strong>
      <span className="code-alert-body">{notice.body}</span>
      {(notice.home || notice.away) && (
        <span className="code-alert-teams">
          <Crest team={{ id: notice.home, name: notice.home, shortName: notice.home, abbr: '', color: '', crest: notice.homeCrest }} size={28} />
          <Crest team={{ id: notice.away, name: notice.away, shortName: notice.away, abbr: '', color: '', crest: notice.awayCrest }} size={28} />
        </span>
      )}
      <em>Tap to open the code</em>
    </button>
  );
}

function CopyButton({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn code-copy"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setDone(true);
          window.setTimeout(() => setDone(false), 1200);
        });
      }}
    >
      {done ? 'Copied' : 'Copy'}
    </button>
  );
}

/** The share code stays beside Copy. A banner or a refresh must not drop it. */
function CodeCopy({ code }: { code: string }) {
  return (
    <div className="code-actions">
      <b className="code-booking-code" data-code={code}>{code}</b>
      <CopyButton value={code} />
    </div>
  );
}

function Risk({ part, warning }: { part: CodePart; warning: string }) {
  if (!part.highRisk) return null;
  return (
    <p className="code-risk">
      <b>HIGH RISK</b>
      <span>{part.highRiskWhy}. {warning}</span>
    </p>
  );
}

function Logos({ part }: { part: CodePart }) {
  return (
    <span className="code-logos">
      <img src="/bookies/sportybet.png" alt="SportyBet" />
      {part.football && <img src="/bookies/football.png" alt="Football.com" />}
    </span>
  );
}

function PartBlock({ part, warning, index, total }: { part: CodePart; warning: string; index: number; total: number }) {
  return (
    <article className="code-part">
      <header>
        <div>
          <p>Part {index + 1} of {total}{part.cap ? ` · cap ${part.cap.toFixed(2)}` : ''}</p>
          <strong>{part.code}</strong>
        </div>
        <CodeCopy code={part.code} />
      </header>
      <Logos part={part} />
      <p className="code-odds">{part.legCount} legs · {oddsText(part.totalOdds)} odds{part.firstKick ? ` · ${gmtDay(part.firstKick.slice(0, 10))} ${gmtClock(part.firstKick)} – ${gmtClock(part.lastKick)} GMT` : ''}</p>
      {part.football && part.footballCode && part.footballCode !== part.code && (
        <p className="code-foot">Football.com {part.footballCode} <CopyButton value={part.footballCode} /></p>
      )}
      <Risk part={part} warning={warning} />
      <p className="code-read">{readbackLine(part)}{part.readAt ? ` · price at ${gmtClock(part.readAt)} GMT` : ''}</p>
      {mixText(part.mix) && <p className="code-mix">{mixText(part.mix)}</p>}
    </article>
  );
}

function SlotLine({ slot }: { slot: CodeSlot }) {
  const part = slot.parts[0];
  if (!part) return <p className="code-empty">{slot.empty}</p>;
  return (
    <div className="code-slotline">
      <div>
        <span>{part.legCount} legs · {oddsText(part.totalOdds)}{part.status === 'lost' ? ` · Lost · ${part.settled} of ${part.legCount} settled` : ''}</span>
      </div>
      <CodeCopy code={part.code} />
    </div>
  );
}

export function CodesPage() {
  const { strategy: strategyId = '' } = useParams();
  const navigate = useNavigate();
  const { settings } = useStore();
  const [data, setData] = useState<CodesView | null>(null);
  const [error, setError] = useState('');
  const [segment, setSegment] = useState<'week' | 'daily' | 'record'>('week');
  const [day, setDay] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<CodeNotice | null>(null);
  const posted = useRef(new Set<string>());

  const load = useCallback(async (fresh = false) => {
    const view = fresh ? await refreshCodes() : await fetchCodes();
    setData(view);
    setDay((current) => current || view.today);
    setError('');
    return view;
  }, []);

  useEffect(() => {
    let stop = false;
    const run = () => {
      load(false).catch((reason) => {
        if (!stop) setError(friendlyError(reason, 'Codes could not load. Check your connection and try again.'));
      });
    };
    run();
    const timer = window.setInterval(run, 60_000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [load]);

  useEffect(() => {
    if (!data) return;
    const seen = seenIds();
    const next = data.notices.find((item) => settings.bankerCodes.includes(item.strategy) && !seen.has(item.id));
    setNotice(next || null);
    if (!next || typeof Notification === 'undefined' || Notification.permission !== 'granted' || posted.current.has(next.id)) return;
    posted.current.add(next.id);
    const card = new Notification(next.title, { body: next.body, icon: next.homeCrest || '/icon-192.png' });
    card.onclick = () => navigate(`/codes/${next.strategy}`);
  }, [data, settings.bankerCodes, navigate]);

  const strategy = data?.strategies.find((item) => item.id === strategyId) || null;
  const recordRow = data?.record.strategies.find((item) => item.id === strategyId);

  async function readBack() {
    setBusy(true);
    try {
      await load(true);
    } catch (reason) {
      setError(friendlyError(reason, 'Read back did not finish. Try again in a moment.'));
    } finally {
      setBusy(false);
    }
  }

  if (strategy && data) {
    const week = strategy.id === 'ladder'
      ? {
          parts: data.days.flatMap((iso) => data.dailies[iso]?.ladder?.parts || []),
          empty: strategy.week.empty,
        }
      : strategy.week;
    return (
      <div className="codes">
        <p className="code-family">{strategy.code} · {data.week.label}</p>
        <section className="code-rules">
          <h2>Rules</h2>
          <ul>
            {strategy.rules.map((rule) => <li key={rule}>{rule}</li>)}
          </ul>
          <p className="code-label">{data.oddsLabel}</p>
        </section>
        {week.parts.length === 0 && <p className="code-empty">{week.empty}</p>}
        {week.parts.map((part, index) => (
          <PartBlock key={part.code} part={part} warning={data.warning} index={index} total={week.parts.length} />
        ))}
        {week.parts[0] && (
          <section className="code-legs">
            <h2>Legs {week.parts.reduce((sum, part) => sum + part.legCount, 0)}</h2>
            {week.parts.flatMap((part) => part.legs).map((leg) => (
              <div className="code-leg" key={`${leg.eventId}-${leg.label}`}>
                <time>{gmtClock(leg.kickoff)}</time>
                <div>
                  <p>
                    <Crest team={{ id: leg.home, name: leg.home, shortName: leg.home, abbr: '', color: '', crest: leg.homeCrest }} size={22} />
                    <span>{leg.home}</span>
                  </p>
                  <p>
                    <Crest team={{ id: leg.away, name: leg.away, shortName: leg.away, abbr: '', color: '', crest: leg.awayCrest }} size={22} />
                    <span>{leg.away}</span>
                  </p>
                </div>
                <div className="code-leg-pick">
                  <b>{leg.label}</b>
                  <span>{oddsText(leg.odds)}</span>
                  {leg.status !== 'open' && <em className={leg.status === 'lost' ? 'is-lost' : ''}>{leg.status}{leg.score ? ` ${leg.score}` : ''}</em>}
                  {leg.mismatch && <em className="is-lost">Mismatch</em>}
                </div>
              </div>
            ))}
          </section>
        )}
        {recordRow && (
          <p className="code-record-line">Record {recordRow.won} won · {recordRow.lost} lost · {recordRow.void} void · {recordRow.open} open{recordRow.mismatch ? ` · ${recordRow.mismatch} mismatch` : ''}. Graded from Sportradar.</p>
        )}
      </div>
    );
  }

  const selected = day || data?.today || '';
  const ladder = data?.dailies && selected ? data.days.map((iso) => ({ iso, slot: data.dailies[iso]?.ladder })) : [];

  return (
    <div className="codes">
      {notice && (
        <CodeAlertCard
          notice={notice}
          onOpen={() => {
            remember(notice.id);
            setNotice(null);
            navigate(`/codes/${notice.strategy}`);
          }}
        />
      )}
      <div className="code-seg" role="tablist">
        {(['week', 'daily', 'record'] as const).map((item) => (
          <button key={item} type="button" role="tab" aria-selected={segment === item} className={cx(segment === item && 'is-on')} onClick={() => setSegment(item)}>
            {item === 'week' ? (data ? data.week.label.replace('Week ', '') : 'Week') : item === 'daily' ? 'Daily' : 'Record'}
          </button>
        ))}
      </div>
      <p className="code-label">{data?.oddsLabel || 'Banker rules - own odds limits'}</p>
      {data?.readAt && <p className="code-when">Read back {gmtClock(data.readAt)} GMT · next {gmtClock(data.nextReadAt)} GMT · dailies book 21:00 GMT the day before. Refresh only reads back.</p>}
      <button type="button" className="btn btn-quiet code-refresh" onClick={readBack} disabled={busy}>{busy ? 'Reading back' : 'Read back'}</button>
      {error && <p className="code-empty">{error}</p>}
      {data?.reading && <p className="code-empty">Reading the share codes back. Nothing is shown until a code comes back live.</p>}

      {segment === 'week' && data && (
        <div className="code-list">
          {data.strategies.map((item) => {
            const part = item.week.parts[0];
            return (
              <article className="code-card" key={item.id}>
                <Link to={`/codes/${item.id}`} className="code-card-main">
                  <i>{item.code}</i>
                  <div>
                    <strong>{item.name}</strong>
                    {part ? (
                      <span>{part.code} · {part.legCount} legs · {oddsText(part.totalOdds)}{item.week.parts.length > 1 ? ` · +${item.week.parts.length - 1} more code` : ''}</span>
                    ) : (
                      <span>{item.week.empty}</span>
                    )}
                    {part?.highRisk && <em>HIGH RISK</em>}
                  </div>
                </Link>
                {part && <CodeCopy code={part.code} />}
                {part?.highRisk && <p className="code-risk code-risk-tight"><span>{data.warning}</span></p>}
                <div className="code-today">
                  <span>Today</span>
                  <SlotLine slot={item.today} />
                </div>
              </article>
            );
          })}
        </div>
      )}

      {segment === 'daily' && data && (
        <div className="code-daily">
          <div className="code-days">
            {data.days.map((iso) => {
              const chip = dayChip(iso);
              return (
                <button key={iso} type="button" className={cx('code-day', iso === selected && 'is-on')} onClick={() => setDay(iso)}>
                  <span>{chip.weekday}</span>
                  <strong>{chip.day}</strong>
                </button>
              );
            })}
          </div>
          <p className="code-when">{gmtDay(selected).toUpperCase()} · one code per strategy · up to 25 legs · target {data.target}+</p>
          {data.strategies.map((item) => {
            const slot = data.dailies[selected]?.[item.id] || { parts: [], empty: '' };
            const part = slot.parts[0];
            return (
              <article className="code-card" key={item.id}>
                <div className="code-card-main">
                  <i>{item.code}</i>
                  <div>
                    <strong>{item.name}</strong>
                    {part ? <span>{part.code} · {part.legCount} legs · {oddsText(part.totalOdds)}{part.status === 'lost' ? ` · lost (${part.settled} of ${part.legCount} settled)` : ''}</span> : <span>{slot.empty}</span>}
                    {part?.highRisk && <em>HIGH RISK</em>}
                  </div>
                </div>
                {part && <CodeCopy code={part.code} />}
                {part?.highRisk && <p className="code-risk code-risk-tight"><span>{part.highRiskWhy}. {data.warning}</span></p>}
              </article>
            );
          })}
          <h2 className="code-sub">Ladder dailies this week</h2>
          {ladder.map((row) => {
            const part = row.slot?.parts[0];
            return (
              <article className="code-card code-card-slim" key={row.iso}>
                <div>
                  <strong>{dayChip(row.iso).weekday}</strong>
                  {part ? <span>{part.code} · {part.legCount} legs · {oddsText(part.totalOdds)}</span> : <span>{row.slot?.empty}</span>}
                  {part?.highRisk && <em>HIGH RISK</em>}
                </div>
                {part && <CodeCopy code={part.code} />}
              </article>
            );
          })}
        </div>
      )}

      {segment === 'record' && data && (
        <div className="code-list">
          <p className="code-when">{recordingSince(data.record.since)}. Graded from Sportradar, cross-checked with the share readback. A mismatch is flagged and does not change the result.</p>
          {data.record.strategies.map((row) => {
            const name = data.strategies.find((item) => item.id === row.id);
            const graded = row.won + row.lost;
            return (
              <article className="code-card" key={row.id}>
                <div>
                  <strong>{name?.name}</strong>
                  <span>{graded ? `${row.won} of ${graded} won` : 'No graded legs yet'} · {row.void} void · {row.open} open{row.mismatch ? ` · ${row.mismatch} mismatch` : ''}</span>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
