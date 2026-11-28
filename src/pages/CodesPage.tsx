import { useCallback, useEffect, useRef, useState } from 'react';
import { friendlyError } from '../lib/apiJson';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CodeActions } from '../components/CodeActions';
import { Crest } from '../components/Crest';
import {
  bookingLine,
  codesIn,
  dailyCards,
  dayChip,
  fetchCodes,
  gmtClock,
  gmtDay,
  hasCode,
  ladderDays,
  mixText,
  oddsText,
  readbackLine,
  refreshCodes,
  type CodeNotice,
  type CodePart,
  type CodeSlot,
  type CodesView,
  weekCards,
} from '../lib/codes';
import { playCodeLabel, playShotTier } from '../lib/pickCodes';
import { isPlayStoreBuild } from '../lib/storeBuild';
import { recordingSince } from '../lib/results';
import { cx } from '../lib/format';
import { canSeeCode } from '../lib/proAccess';
import { useStore } from '../state/store';
import { useProduct } from '../state/product';
import { codeLegHidden, teamKey } from '../lib/teamMarks';
import { TeamTap } from '../components/TeamMark';
import { markFresh, newCodes } from '../lib/freshCode';
import { goToBookedCodes, useFreshCodes } from '../lib/useFreshCodes';

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
    <div className="code-alert">
      <button type="button" className="code-alert-open" onClick={onOpen}>
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
      {notice.code && <CodeCopy code={notice.code} />}
    </div>
  );
}

/** The share code stays beside Copy and Load. A banner or a refresh must not drop it. */
function CodeCopy({ code, desk, link }: { code: string; desk?: string; link?: string }) {
  return <CodeActions code={code} desk={desk} link={link} className="code-actions" codeClassName="code-booking-code" />;
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

function codeText(part: CodePart, extra = ''): string {
  if (!canSeeCode(part.code, part.firstKick)) return 'Early code · Pro';
  return `${part.code} · ${part.legCount} legs · ${oddsText(part.totalOdds)}${extra}`;
}

function EarlyCode({ code, firstKick }: { code: string; firstKick?: string }) {
  if (canSeeCode(code, firstKick)) return <CodeCopy code={code} />;
  return (
    <Link to="/pro" className="pro-lock">
      Early code · Pro
    </Link>
  );
}

function PartBlock({ part, warning, index, total }: { part: CodePart; warning: string; index: number; total: number }) {
  const open = canSeeCode(part.code, part.firstKick);
  return (
    <article className="code-part">
      <header>
        <div>
          <p>Part {index + 1} of {total}{part.tier ? ` · ${playShotTier(part.tier)}` : ''}{part.cap ? ` · cap ${part.cap.toFixed(2)}` : ''}</p>
        </div>
        {open ? <CodeCopy code={part.code} link={part.link} /> : <EarlyCode code={part.code} firstKick={part.firstKick} />}
      </header>
      {!isPlayStoreBuild() && <Logos part={part} />}
      <p className="code-odds">{part.legCount} legs · {oddsText(part.totalOdds)} odds{part.firstKick ? ` · ${gmtDay(part.firstKick.slice(0, 10))} ${gmtClock(part.firstKick)} – ${gmtClock(part.lastKick)} GMT` : ''}</p>
      {!isPlayStoreBuild() && open && part.football && part.footballCode && part.footballCode !== part.code && (
        <p className="code-foot">Football.com <CodeCopy code={part.footballCode} desk="footballcom" link={part.footballLink} /></p>
      )}
      <Risk part={part} warning={warning} />
      <p className="code-read">{readbackLine(part)}{part.readAt ? ` · price at ${gmtClock(part.readAt)} GMT` : ''}</p>
      {mixText(part.mix) && <p className="code-mix">{mixText(part.mix)}</p>}
    </article>
  );
}

/** Empty strategies are hidden; this one quiet line says when the next codes come. */
function NextBooking({ line, none, title }: { line: string; none: boolean; title: string }) {
  if (none) {
    return (
      <div className="code-none">
        <strong>{title}</strong>
        <p className="code-when">{line}</p>
      </div>
    );
  }
  return <p className="code-when code-next">{line}</p>;
}

function SlotLine({ slot }: { slot: CodeSlot }) {
  const part = slot.parts[0];
  if (!part) return <p className="code-empty">{slot.empty}</p>;
  const open = canSeeCode(part.code, part.firstKick);
  return (
    <div className="code-slotline">
      <div>
        <span>{part.legCount} legs · {oddsText(part.totalOdds)}{part.status === 'lost' ? ` · Lost · ${part.settled} of ${part.legCount} settled` : ''}</span>
      </div>
      {open ? <CodeCopy code={part.code} link={part.link} /> : <EarlyCode code={part.code} firstKick={part.firstKick} />}
    </div>
  );
}

export function CodesPage() {
  const { strategy: strategyId = '' } = useParams();
  const navigate = useNavigate();
  const { settings } = useStore();
  const { lists } = useProduct();
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
    card.onclick = () => goToBookedCodes(navigate, `/codes/${next.strategy}`, next.code ? [{ code: next.code, desk: 'sportybet' }] : []);
  }, [data, settings.bankerCodes, navigate]);

  // Just-booked or newly read-back codes glow and open SportyBet on tap.
  useFreshCodes(data ? `${strategyId}|${segment}|${day}|${data.readAt}|${codesIn(data).length}` : null);

  const strategy = data?.strategies.find((item) => item.id === strategyId) || null;
  const recordRow = data?.record.strategies.find((item) => item.id === strategyId);

  async function readBack() {
    setBusy(true);
    try {
      const before = codesIn(data).map((item) => item.code);
      const view = await refreshCodes();
      markFresh(newCodes(before, codesIn(view)));
      setData(view);
      setDay((current) => current || view.today);
      setError('');
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
          <p className="code-label">{playCodeLabel(data.oddsLabel)}</p>
        </section>
        {week.parts.length === 0 && <p className="code-empty">{week.empty}</p>}
        {week.parts.map((part, index) => (
          <PartBlock key={part.code} part={part} warning={data.warning} index={index} total={week.parts.length} />
        ))}
        {week.parts[0] && (
          <section className="code-legs">
            <h2>Legs {week.parts.reduce((sum, part) => sum + part.legCount, 0)}</h2>
            {week.parts.flatMap((part) => part.legs).filter((leg) => !codeLegHidden(lists, leg)).map((leg) => (
              <div className="code-leg" key={`${leg.eventId}-${leg.label}`}>
                <time>{gmtClock(leg.kickoff)}</time>
                <div>
                  <p>
                    <TeamTap team={{ id: teamKey(leg.home), name: leg.home, crest: leg.homeCrest }}>
                      <Crest team={{ id: leg.home, name: leg.home, shortName: leg.home, abbr: '', color: '', crest: leg.homeCrest }} size={22} />
                      <span>{leg.home}</span>
                    </TeamTap>
                  </p>
                  <p>
                    <TeamTap team={{ id: teamKey(leg.away), name: leg.away, crest: leg.awayCrest }}>
                      <Crest team={{ id: leg.away, name: leg.away, shortName: leg.away, abbr: '', color: '', crest: leg.awayCrest }} size={22} />
                      <span>{leg.away}</span>
                    </TeamTap>
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
  const ladder = data?.dailies && selected ? ladderDays(data) : [];
  const now = Date.now();
  const weekShown = data ? weekCards(data) : [];
  const dailyShown = data && selected ? dailyCards(data, selected) : [];
  const quiet = !!data?.reading;

  return (
    <div className="codes">
      {notice && (
        <CodeAlertCard
          notice={notice}
          onOpen={() => {
            remember(notice.id);
            setNotice(null);
            goToBookedCodes(navigate, `/codes/${notice.strategy}`, notice.code ? [{ code: notice.code, desk: 'sportybet' }] : []);
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
      <p className="code-label">{playCodeLabel(data?.oddsLabel || 'Banker rules - own odds limits')}</p>
      {data?.readAt && <p className="code-when">Read back {gmtClock(data.readAt)} GMT · next {gmtClock(data.nextReadAt)} GMT · dailies book 21:00 GMT the day before. Refresh only reads back.</p>}
      <button type="button" className="btn btn-quiet code-refresh" onClick={readBack} disabled={busy}>{busy ? 'Reading back' : 'Read back'}</button>
      {error && <p className="code-empty">{error}</p>}
      {data?.reading && <p className="code-empty">Reading the share codes back. Nothing is shown until a code comes back live.</p>}

      {segment === 'week' && data && (
        <div className="code-list">
          {!quiet && weekShown.length < data.strategies.length && (
            <NextBooking line={bookingLine(now)} none={weekShown.length === 0} title="No codes right now" />
          )}
          {weekShown.map((item) => {
            const part = hasCode(item.week) ? item.week.parts[0] : undefined;
            return (
              <article className="code-card" key={item.id}>
                <Link to={`/codes/${item.id}`} className="code-card-main">
                  <i>{item.code}</i>
                  <div>
                    <strong>{playCodeLabel(item.name)}</strong>
                    {part && (
                      <span>{codeText(part, item.week.parts.length > 1 ? ` · +${item.week.parts.length - 1} more code` : '')}</span>
                    )}
                    {part?.highRisk && <em>HIGH RISK</em>}
                  </div>
                </Link>
                {part && (canSeeCode(part.code, part.firstKick) ? <CodeCopy code={part.code} link={part.link} /> : <EarlyCode code={part.code} firstKick={part.firstKick} />)}
                {item.week.parts.slice(1).map((extra, index) => (
                  <div className="code-today" key={extra.code}>
                    <span>Part {index + 2}{extra.tier ? ` · ${playShotTier(extra.tier)}` : ''} · {extra.legCount} legs</span>
                    {canSeeCode(extra.code, extra.firstKick) ? <CodeCopy code={extra.code} link={extra.link} /> : <EarlyCode code={extra.code} firstKick={extra.firstKick} />}
                  </div>
                ))}
                {part?.highRisk && <p className="code-risk code-risk-tight"><span>{data.warning}</span></p>}
                {hasCode(item.today) && (
                  <div className="code-today">
                    <span>Today</span>
                    <SlotLine slot={item.today} />
                  </div>
                )}
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
          {!quiet && dailyShown.length < data.strategies.length && (
            <NextBooking line={bookingLine(now, selected)} none={dailyShown.length === 0} title={`No codes for ${gmtDay(selected)} yet`} />
          )}
          {dailyShown.map(({ strategy: item, slot }) => {
            const part = slot.parts[0];
            return (
              <article className="code-card" key={item.id}>
                <div className="code-card-main">
                  <i>{item.code}</i>
                  <div>
                    <strong>{playCodeLabel(item.name)}</strong>
                    {part && <span>{codeText(part, part.status === 'lost' ? ` · lost (${part.settled} of ${part.legCount} settled)` : part.status === 'won' ? ' · won' : '')}</span>}
                    {part?.highRisk && <em>HIGH RISK</em>}
                  </div>
                </div>
                {part && (canSeeCode(part.code, part.firstKick) ? <CodeCopy code={part.code} link={part.link} /> : <EarlyCode code={part.code} firstKick={part.firstKick} />)}
                {slot.parts.slice(1).map((extra, index) => (
                  <div className="code-today" key={extra.code}>
                    <span>Part {index + 2}{extra.tier ? ` · ${playShotTier(extra.tier)}` : ''} · {extra.legCount} legs</span>
                    {canSeeCode(extra.code, extra.firstKick) ? <CodeCopy code={extra.code} link={extra.link} /> : <EarlyCode code={extra.code} firstKick={extra.firstKick} />}
                  </div>
                ))}
                {part?.highRisk && <p className="code-risk code-risk-tight"><span>{part.highRiskWhy}. {data.warning}</span></p>}
              </article>
            );
          })}
          {ladder.length > 0 && <h2 className="code-sub">Ladder dailies this week</h2>}
          {ladder.map((row) => {
            const part = row.slot.parts[0];
            return (
              <article className="code-card code-card-slim" key={row.iso}>
                <div>
                  <strong>{dayChip(row.iso).weekday}</strong>
                  {part && <span>{codeText(part)}</span>}
                  {part?.highRisk && <em>HIGH RISK</em>}
                </div>
                {part && (canSeeCode(part.code, part.firstKick) ? <CodeCopy code={part.code} link={part.link} /> : <EarlyCode code={part.code} firstKick={part.firstKick} />)}
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
                  <strong>{playCodeLabel(name?.name || '')}</strong>
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
