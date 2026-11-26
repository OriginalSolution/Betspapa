import { useState } from 'react';
import { copyText, deskName, deskOrSporty, openBookmaker, showCopiedToast } from '../lib/bookmakerLink';
import { isPlayStoreBuild } from '../lib/storeBuild';
import type { DeskId } from '../lib/engineSlips';
import { cx } from '../lib/format';

type CodeActionsProps = {
  code: string;
  desk?: DeskId | string | null;
  link?: string | null;
  showCode?: boolean;
  className?: string;
  codeClassName?: string;
  compact?: boolean;
};

/**
 * The shared booking-code control: the code chip, Copy, and a primary Load button.
 * Load copies the code and opens that bookmaker's share URL. Unknown desks open SportyBet.
 * A tap on the code chip does the same as Load.
 */
export function CodeActions({
  code,
  desk,
  link,
  showCode = true,
  className,
  codeClassName,
  compact = true,
}: CodeActionsProps) {
  const [copied, setCopied] = useState(false);
  const resolved = deskOrSporty(desk);
  const play = isPlayStoreBuild();
  if (!code) return null;

  const stop = (event?: { stopPropagation(): void }) => {
    event?.stopPropagation();
  };

  const copy = (event?: { stopPropagation(): void }) => {
    stop(event);
    void copyText(code).then(() => {
      setCopied(true);
      if (play) showCopiedToast();
      window.setTimeout(() => setCopied(false), 1400);
    });
  };

  const load = (event?: { stopPropagation(): void }) => {
    stop(event);
    void openBookmaker(resolved, code, link);
  };

  const btn = compact ? 'btn btn-tiny' : 'btn';
  const name = deskName(resolved);

  return (
    <span className={cx('code-pair', className)}>
      {showCode && (
        <button
          type="button"
          className={cx('code-pair-code', codeClassName)}
          data-booking-code={code}
          data-code={code}
          onClick={play ? copy : load}
          aria-label={play ? `Copy ${code}` : `Load ${code} in ${name}`}
        >
          {code}
        </button>
      )}
      <button type="button" className={cx(btn, 'btn-quiet')} onClick={copy}>
        {copied ? 'Copied' : 'Copy'}
      </button>
      {!play && (
        <button type="button" className={btn} onClick={load} aria-label={`Load ${code} in ${name}`}>
          Load
        </button>
      )}
    </span>
  );
}
