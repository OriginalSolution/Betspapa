import { Link } from 'react-router-dom';
import type { MarketId, TrendView } from '../data/board';
import { FormPips } from '../components/PickCard';
import { squadLabel } from '../data/board';
import { cx } from '../lib/format';
import { FollowedTrends } from './FollowingPage';
import { useProduct } from '../state/product';

const EXTRA = new Set<MarketId>([
  'dc-1x',
  'dc-12',
  'dc-x2',
  'dnb-home',
  'dnb-away',
  'over05',
  'under15',
  'under35',
  'fh-home',
  'fh-draw',
  'fh-away',
  'fh-over05',
  'fh-over15',
]);

export function TrendsPage() {
  const { trends } = useProduct();
  const hit = trends.filter((trend) => trend.status === 'won');
  const tipped = trends.filter((trend) => trend.bookmarked && trend.status !== 'won');
  const developing = trends.filter((trend) => trend.developing && trend.status !== 'won');
  const major = trends.filter((trend) => EXTRA.has(trend.market) && !trend.bookmarked && trend.status !== 'won');
  const rest = trends.filter((trend) => !trend.bookmarked && !trend.developing && !EXTRA.has(trend.market) && trend.status !== 'won');
  return (
    <div className="stack">
      <p className="page-lead">
        Follow a trend and the Alerts page records it when that market hits. Rates above 80% on the main lines are still tipped and booked. Settled follows can be cleared here or on Following.
      </p>
      <FollowedTrends />
      {trends.length === 0 && (
        <div className="empty">
          <h2>No trends yet</h2>
          <p>Trends appear when today’s fixtures and prices load.</p>
        </div>
      )}
      <TrendBlock title="Popped off" detail="These markets have already hit. Follow one and it stays on Alerts." rows={hit} />
      <TrendBlock title="Bookmarked · above 80%" rows={tipped} />
      <TrendBlock title="Developing" detail="Recent form is turning before the rate clears 80%." rows={developing} />
      <TrendBlock
        title="Major markets"
        detail="Full-time and first-half results, double chance, draw no bet, both teams to score, and goal lines."
        rows={major}
      />
      <TrendBlock title="Watching" detail="Tracked, and not tipped yet." rows={rest} />
    </div>
  );
}

function TrendBlock({ title, detail, rows }: { title: string; detail?: string; rows: TrendView[] }) {
  const { trendFollows, toggleTrend } = useProduct();
  if (!rows.length) return null;
  return (
    <section className="stack-block">
      <h2>{title}</h2>
      {detail && <p className="lede">{detail}</p>}
      {rows.map((trend) => {
        const on = trendFollows.includes(trend.id);
        return (
          <article key={trend.id} className={cx('trend', trend.bookmarked && 'trend-hot', trend.status === 'won' && 'trend-hit')}>
            <div>
              <strong>{trend.label || `${trend.teamName} · ${trend.marketLabel}`}</strong>
              <p>{trend.note}</p>
              <div className="trend-actions">
                <button type="button" className={cx('btn', 'btn-tiny', on && 'btn-quiet')} onClick={() => toggleTrend(trend.id)}>
                  {on ? 'Following trend' : 'Follow trend'}
                </button>
                {trend.matchId && (
                  <Link to={`/match/${trend.matchId}`} className="btn btn-quiet btn-tiny">
                    Match
                  </Link>
                )}
              </div>
            </div>
            <div className="trend-side">
              <b>{Math.round(trend.rate * 100)}%</b>
              <span>{trend.status === 'won' ? 'Hit' : trend.sample > 0 ? `${trend.hits}/${trend.sample}` : 'Price'}</span>
              {trend.form.length > 0 && <FormPips form={trend.form} />}
              {trend.form.length > 0 && <em className={trend.squad === 'full' ? '' : 'squad-alert'}>{squadLabel(trend.squad)}</em>}
            </div>
          </article>
        );
      })}
    </section>
  );
}
