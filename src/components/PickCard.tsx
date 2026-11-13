import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { PickView } from '../data/board';
import { squadLabel } from '../data/board';
import { Crest } from './Crest';
import { cx } from '../lib/format';
import type { Team } from '../types';
import { useProduct } from '../state/product';
import { useStore } from '../state/store';

export function FormPips({ form }: { form: PickView['form'] }) {
  return (
    <span className="form" aria-label={`Form ${form.join(' ')}`}>
      {form.map((mark, index) => (
        <i key={`${mark}-${index}`} className={`fm-${mark}`}>
          {mark}
        </i>
      ))}
    </span>
  );
}

function teamFromBoard(matches: ReturnType<typeof useStore>['matches'], name: string): Team {
  for (const match of matches) {
    if (match.home.name === name || match.home.shortName === name) return match.home;
    if (match.away.name === name || match.away.shortName === name) return match.away;
  }
  return { id: name, name, shortName: name, abbr: name.slice(0, 3).toUpperCase(), color: '#2a303c' };
}

export function PickCard({ pick }: { pick: PickView }) {
  const { slip, addLeg, removeLeg, toggleList, pickListed, trendFollows, toggleTrend } = useProduct();
  const { matches } = useStore();
  const side = useMemo(() => teamFromBoard(matches, pick.teamName), [matches, pick.teamName]);
  const opponent = useMemo(() => teamFromBoard(matches, pick.opponentName), [matches, pick.opponentName]);
  const saved = slip.includes(pick.id);
  const black = pickListed(pick, 'black');
  const green = pickListed(pick, 'green');
  return (
    <article className={cx('pick', pick.status !== 'open' && `pick-${pick.status}`, green && 'pick-green')}>
      <div className="pick-top">
        <span className={cx('grade', pick.grade && `grade-${pick.grade}`)}>{pick.grade ?? '–'}</span>
        <div className="pick-title">
          <strong>{pick.label}</strong>
          <p className="pick-sides">
            <Crest team={side} size={18} />
            <Link to={`/match/${pick.matchId}`}>{pick.teamName}</Link>
            <span>vs</span>
            <Crest team={opponent} size={18} />
            <Link to={`/match/${pick.matchId}`}>{pick.opponentName}</Link>
            <span> · {pick.competitionName}</span>
          </p>
        </div>
        <b className="odds">{pick.odds >= 1 ? pick.odds.toFixed(2) : '—'}</b>
      </div>
      <p className="pick-support">{pick.supportText}</p>
      <div className="pick-meta">
        {pick.form.length > 0 && <FormPips form={pick.form} />}
        {pick.form.length > 0 && <span className={cx('squad', pick.squad !== 'full' && 'squad-alert')}>{squadLabel(pick.squad)}</span>}
        <span className={cx('leg', `leg-${pick.status}`)}>{pick.status === 'open' ? `${Math.round(pick.confidence * 100)}%` : pick.status}</span>
      </div>
      <div className="pick-actions">
        <button type="button" className={cx('btn', 'btn-tiny', saved && 'btn-quiet')} onClick={() => (saved ? removeLeg(pick.id) : addLeg(pick.id))}>
          {saved ? 'On slip' : 'Add to slip'}
        </button>
        {pick.trendId.startsWith('price:') && (
          <Link to={`/slips?trend=${encodeURIComponent(pick.trendId)}`} className="btn btn-quiet btn-tiny">
            Code
          </Link>
        )}
        <button type="button" className={cx('btn', 'btn-tiny', trendFollows.includes(pick.id) && 'btn-quiet')} onClick={() => toggleTrend(pick.id)}>
          {trendFollows.includes(pick.id) ? 'Following trend' : 'Follow trend'}
        </button>
        <button
          type="button"
          className={cx('btn', 'btn-quiet', 'btn-tiny', green && 'is-on')}
          onClick={() => toggleList({ scope: 'team', id: pick.teamId, name: pick.teamName }, 'green')}
        >
          {green ? 'Greenlisted' : 'Greenlist'}
        </button>
        <button
          type="button"
          className={cx('btn', 'btn-quiet', 'btn-tiny', black && 'is-on')}
          onClick={() => toggleList({ scope: 'team', id: pick.teamId, name: pick.teamName }, 'black')}
        >
          {black ? 'Blacklisted' : 'Blacklist'}
        </button>
      </div>
    </article>
  );
}
