import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookMark } from '../components/BookMark';
import { CodeActions } from '../components/CodeActions';
import { Crest } from '../components/Crest';
import { coverageLine, partSummary, type BookedDeskView, type BookedPartView } from '../lib/bookedSlip';
import { copyText } from '../lib/bookmakerLink';
import { readBuilder } from '../lib/builderStore';
import { DESKS, marketLabel, type DeskId } from '../lib/engineSlips';
import { kickoffClock } from '../lib/format';
import type { BuilderLeg } from '../lib/slipPacks';
import { useFreshCodes } from '../lib/useFreshCodes';
import type { Team } from '../types';

const SHOW_PARTS = 2;

function teamOf(name: string, crest: string | null): Team {
  return { id: name || 'side', name, shortName: name, abbr: '', color: '#2a303c', crest };
}

export function BookedPage() {
  const tracked = useMemo(() => readBuilder().tracked, []);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<string | null>(null);
  useFreshCodes(tracked);
  const desks = tracked?.desks || [];
  const total = tracked?.legs.length || 0;
  const codes = desks.reduce((sum, desk) => sum + desk.parts.length, 0);
  const settled = 0;
  const first = [...(tracked?.legs || [])].sort((a, b) => a.kickoff.localeCompare(b.kickoff))[0];
  const when = tracked?.bookedAt ? kickoffClock(tracked.bookedAt) : '';

  const copyAll = () => {
    const lines = desks.flatMap((desk) => desk.parts.map((part) => `${desk.name} ${part.code}`));
    if (!lines.length) return;
    void copyText(lines.join('\n'));
    setToast(`Copied all ${codes} codes`);
    window.setTimeout(() => setToast(null), 2200);
  };

  const share = () => {
    const lines = desks.flatMap((desk) => desk.parts.map((part) => `${desk.name} ${part.code}`));
    if (!lines.length) return;
    const text = `Betspapa slip\n${lines.join('\n')}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  if (!tracked || !desks.length) {
    return (
      <div className="stack booked-page">
        <p className="lede">No codes yet. Book a slip from Trends. Nothing is invented.</p>
        <Link to="/trends" className="btn">Back to Trends</Link>
      </div>
    );
  }

  return (
    <div className="stack booked-page">
      <section className="booked-status">
        <header>
          <strong>Tracking on</strong>
          <span>{settled} of {total} settled</span>
        </header>
        <p>
          {first ? `First kick-off ${kickoffClock(first.kickoff)} GMT (${first.home} v ${first.away}). ` : ''}
          One alert when the slip settles.{when ? ` Codes booked ${when} GMT.` : ''}
        </p>
      </section>
      <div className="booked-actions">
        <button type="button" className="btn booked-copyall" onClick={copyAll}>Copy all {codes} codes</button>
        <button type="button" className="btn btn-quiet" onClick={share} aria-label="Share on WhatsApp">WhatsApp</button>
      </div>
      {DESKS.map((id) => desks.find((desk) => desk.desk === id)).filter((desk): desk is BookedDeskView => Boolean(desk)).map((desk) => (
        <DeskCard
          key={desk.desk}
          desk={desk}
          total={total}
          expanded={Boolean(open[desk.desk])}
          onToggle={() => setOpen((current) => ({ ...current, [desk.desk]: !current[desk.desk] }))}
          onCopy={(code) => {
            void copyText(code);
            setToast(`Copied ${code}`);
            window.setTimeout(() => setToast(null), 1800);
          }}
        />
      ))}
      <section className="booked-legs">
        <header>
          <h2>Legs <b>{total}</b></h2>
          <span>By kick-off</span>
        </header>
        <ul>
          {[...tracked.legs].sort((a, b) => a.kickoff.localeCompare(b.kickoff)).map((leg) => (
            <LegRow key={leg.key} leg={leg} />
          ))}
        </ul>
      </section>
      <div className="booked-foot">
        <Link to="/trends" className="btn btn-quiet">Back to Trends</Link>
        <Link to="/slips" className="btn">Open tracked slip</Link>
      </div>
      {toast && <p className="booked-toast" role="status">{toast}</p>}
    </div>
  );
}

function DeskCard({
  desk,
  total,
  expanded,
  onToggle,
  onCopy,
}: {
  desk: BookedDeskView;
  total: number;
  expanded: boolean;
  onToggle: () => void;
  onCopy: (code: string) => void;
}) {
  const visible = expanded ? desk.parts : desk.parts.slice(0, SHOW_PARTS);
  const hidden = desk.parts.length - visible.length;
  return (
    <article className="booked-desk">
      <header>
        <BookMark id={desk.desk} />
        <div>
          <strong>{desk.name}</strong>
          <small>{coverageLine(desk.bookedLegs, total, desk.codes)}</small>
        </div>
        {desk.codes > 1 && (
          <button type="button" className="btn btn-quiet btn-tiny" onClick={() => onCopy(desk.parts.map((part) => part.code).join('\n'))}>
            Copy {desk.codes}
          </button>
        )}
      </header>
      {desk.error && !desk.parts.length && <p className="lede">{desk.error}</p>}
      <ul>
        {visible.map((part, index) => (
          <PartRow key={`${part.code}-${index}`} desk={desk.desk} part={part} index={index} />
        ))}
      </ul>
      {hidden > 0 && (
        <button type="button" className="booked-more" onClick={onToggle}>
          + {hidden} more {hidden === 1 ? 'part' : 'parts'}
        </button>
      )}
    </article>
  );
}

function PartRow({ desk, part, index }: { desk: DeskId; part: BookedPartView; index: number }) {
  return (
    <li>
      <div>
        <span>Part {index + 1}</span>
        <small>{partSummary(part)}</small>
      </div>
      <CodeActions code={part.code} desk={desk} link={part.link} codeClassName="booked-code" />
    </li>
  );
}

function LegRow({ leg }: { leg: BuilderLeg }) {
  return (
    <li>
      <time>{kickoffClock(leg.kickoff)}</time>
      <div>
        <span><Crest team={teamOf(leg.home, leg.homeCrest)} size={16} />{leg.home}</span>
        <span><Crest team={teamOf(leg.away, leg.awayCrest)} size={16} />{leg.away}</span>
      </div>
      <em>{marketLabel(leg.market)}</em>
      <b>{leg.odds.toFixed(2)}</b>
    </li>
  );
}
