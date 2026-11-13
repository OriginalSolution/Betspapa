import { useState } from 'react';
import { BookMark } from './BookMark';
import { DESKS, DESK_NAMES, type DeskId } from '../lib/engineSlips';
import { kickoffClock, cx } from '../lib/format';
import { CODE_TIERS, TIER_LABEL, type CodePartView, type CodeTier } from '../lib/pickCodes';

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

export function CodeStrip({
  desk,
  tier,
  title,
  parts,
  bookedAt,
  note,
  onDesk,
  onTier,
}: {
  desk: DeskId;
  tier: CodeTier;
  title: string;
  parts: CodePartView[];
  bookedAt: string | null;
  note?: string;
  onDesk: (desk: DeskId) => void;
  onTier: (tier: CodeTier) => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
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
            {TIER_LABEL[id]}
          </button>
        ))}
      </div>
      <div className="code-card">
        <p className="code-card-title">{title}</p>
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
              <p className="code-value" data-booking-code={part.code}>
                {part.code}
              </p>
              <div className="code-part-row">
                <span>{bits.join(' · ')}</span>
                <button
                  type="button"
                  className={cx('btn', 'btn-tiny', copied === part.code && 'is-on')}
                  onClick={() => {
                    void copyText(part.code);
                    setCopied(part.code);
                  }}
                >
                  {copied === part.code ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
