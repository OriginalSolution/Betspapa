import { useEffect, useRef, useState } from 'react';
import { cx } from '../lib/format';

/** The slip bell. On: every match in the slip alerts, and each leg says won or lost. */
export function SlipBell({
  on,
  count,
  onToggle,
  className,
}: {
  on: boolean;
  count: number;
  onToggle: () => void;
  className?: string;
}) {
  const [ring, setRing] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!on) return;
    setRing(true);
    const timer = window.setTimeout(() => setRing(false), 1200);
    return () => window.clearTimeout(timer);
  }, [on]);
  const label = on ? `Alerts on for ${count} ${count === 1 ? 'match' : 'matches'}. Tap to turn off.` : `Alert me on every match in this slip`;
  return (
    <button
      type="button"
      className={cx('slip-bell', on && 'is-on', ring && 'is-ringing', className)}
      aria-pressed={on}
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          className="slip-bell-body"
          d="M6 16.5h12l-1.2-2V10a4.8 4.8 0 0 0-9.6 0v4.5L6 16.5Z"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path className="slip-bell-clapper" d="M10 17.6a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        {!on && <path d="M4.5 4.5l15 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="slip-bell-slash" />}
      </svg>
      <span className="slip-bell-text">{on ? 'On' : 'Alerts'}</span>
    </button>
  );
}

const PIECES = Array.from({ length: 34 }, (_, index) => index);
const COLORS = ['#e11d2e', '#f0c94a', '#3ddc97', '#ffffff', '#ff4d5a', '#7cc4ff'];

/** A one-off burst when a whole slip wins. Hidden for reduced motion by CSS. */
export function SlipConfetti() {
  return (
    <div className="slip-confetti" aria-hidden="true">
      {PIECES.map((index) => (
        <i
          key={index}
          style={{
            left: `${(index * 37) % 100}%`,
            background: COLORS[index % COLORS.length],
            animationDelay: `${(index % 7) * 70}ms`,
            animationDuration: `${1400 + ((index * 53) % 900)}ms`,
            transform: `rotate(${(index * 47) % 360}deg)`,
          }}
        />
      ))}
    </div>
  );
}
