import { BookMark } from './BookMark';
import { CodeActions } from './CodeActions';
import { DESKS, DESK_NAMES, type DeskId } from '../lib/engineSlips';
import { kickoffClock, cx } from '../lib/format';
import { CODE_TIERS, tierLabel, type CodePartView, type CodeTier } from '../lib/pickCodes';

export function CodeStrip({
  desk,
  tier,
  title,
  parts,
  bookedAt,
  note,
  line,
  onDesk,
  onTier,
}: {
  desk: DeskId;
  tier: CodeTier;
  title: string;
  parts: CodePartView[];
  bookedAt: string | null;
  note?: string;
  line?: string;
  onDesk: (desk: DeskId) => void;
  onTier: (tier: CodeTier) => void;
}) {
  const when = kickoffClock(bookedAt || '');
  return (
    <section className="code-strip" aria-label={title}>
      <div className="trend-seg code-desks" role="tablist" aria-label="Bookmaker">
        {DESKS.map((id) => (
          <button key={id} type="button" role="tab" aria-selected={desk === id} className={cx('trend-seg-btn', `desk-${id}`, desk === id && 'is-on')} onClick={() => onDesk(id)}>
            <BookMark id={id} />
            <span>{id === 'footballcom' ? 'Football' : DESK_NAMES[id]}</span>
          </button>
        ))}
      </div>
      <div className="code-tiers" role="tablist" aria-label="Confidence">
        {CODE_TIERS.map((id) => (
          <button key={id} type="button" role="tab" aria-selected={tier === id} className={cx('code-tier', tier === id && 'is-on')} onClick={() => onTier(id)}>
            {tierLabel(id)}
          </button>
        ))}
      </div>
      <div className="code-card">
        <p className="code-card-title">{title}</p>
        {line && <p className="code-line">{line}</p>}
        {parts.length === 0 && <p className="trend-nocode">{note || 'No code yet'}</p>}
        {parts.map((part) => {
          const bits = [`${part.legs} ${part.legs === 1 ? 'leg' : 'legs'}`, part.odds, when ? `booked ${when}` : ''].filter(Boolean);
          return (
            <div className="code-part" key={part.code}>
              {part.total > 1 && (
                <p className="trend-part-label">
                  Part {part.index}/{part.total}
                </p>
              )}
              <CodeActions code={part.code} desk={desk} link={part.link} codeClassName="code-value" />
              <div className="code-part-row">
                <span>{bits.join(' · ')}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
