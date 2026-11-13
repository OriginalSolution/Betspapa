import { useEffect, useState } from 'react';
import type { Team } from '../types';
import { crestFontSize, crestLetters } from '../lib/crestMark';
import { cx, inkFor } from '../lib/format';

export function Crest({ team, size = 22, followed = false }: { team: Team; size?: number; followed?: boolean }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
  }, [team.crest]);
  const letters = crestLetters(team.abbr, team.shortName || team.name);
  if (team.crest && !broken) {
    return (
      <img
        className={cx('crest', followed && 'team-on')}
        src={team.crest}
        alt=""
        width={size}
        height={size}
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <span
      className={cx('crest', 'disc', followed && 'team-on')}
      style={{ background: team.color, color: inkFor(team.color), width: size, height: size }}
    >
      <span className="crest-letters" style={{ fontSize: crestFontSize(size, letters) }}>
        {letters}
      </span>
    </span>
  );
}
