import { useEffect, useState } from 'react';
import type { Team } from '../types';
import { resolveMissingCrest } from '../lib/crestLive';
import { cx } from '../lib/format';

/** A plain shield. Missing badges are never drawn as initials. */
function EmptyCrest({ size, followed }: { size: number; followed: boolean }) {
  return (
    <span className={cx('crest', 'crest-empty', followed && 'team-on')} style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 32 32">
        <path d="M16 5.2 25.2 8.4v7.2c0 5.2-6.2 9.6-9.2 11.2-3-1.6-9.2-6-9.2-11.2V8.4L16 5.2z" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    </span>
  );
}

export function Crest({ team, size = 22, followed = false }: { team: Team; size?: number; followed?: boolean }) {
  const [url, setUrl] = useState(team.crest || '');
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
    if (team.crest) {
      setUrl(team.crest);
      return;
    }
    setUrl('');
    let stop = false;
    void resolveMissingCrest(team.name).then((found) => {
      if (!stop && found) setUrl(found);
    });
    return () => {
      stop = true;
    };
  }, [team.crest, team.name]);
  if (url && !broken) {
    return (
      <img
        className={cx('crest', followed && 'team-on')}
        src={url}
        alt=""
        width={size}
        height={size}
        onError={() => setBroken(true)}
      />
    );
  }
  return <EmptyCrest size={size} followed={followed} />;
}
