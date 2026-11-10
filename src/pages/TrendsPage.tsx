import { FormPips } from '../components/PickCard';
import { squadLabel } from '../data/board';
import { cx } from '../lib/format';
import { useProduct } from '../state/product';

export function TrendsPage() {
  const { trends } = useProduct();
  const tipped = trends.filter((trend) => trend.bookmarked);
  const developing = trends.filter((trend) => trend.developing);
  const rest = trends.filter((trend) => !trend.bookmarked && !trend.developing);
  return (
    <div className="stack">
      <p className="page-lead">
        {trends.some((trend) => trend.sample === 0)
          ? 'Rates on this board are implied by the SportyBet price. Anything above 80% is bookmarked and tipped.'
          : 'Occurrence rate is hits divided by the sample. Anything above 80% is bookmarked and tipped automatically.'}
      </p>
      <TrendBlock title="Bookmarked · above 80%" rows={tipped} />
      <TrendBlock title="Developing" detail="Recent form is turning before the rate clears 80%." rows={developing} />
      <TrendBlock title="Watching" detail="Tracked, and not tipped yet." rows={rest} />
    </div>
  );
}

function TrendBlock({
  title,
  detail,
  rows,
}: {
  title: string;
  detail?: string;
  rows: ReturnType<typeof useProduct>['trends'];
}) {
  if (!rows.length) return null;
  return (
    <section className="stack-block">
      <h2>{title}</h2>
      {detail && <p className="lede">{detail}</p>}
      {rows.map((trend) => (
        <article key={trend.id} className={cx('trend', trend.bookmarked && 'trend-hot')}>
          <div>
            <strong>
              {trend.teamName} · {trend.marketLabel}
            </strong>
            <p>{trend.note}</p>
          </div>
          <div className="trend-side">
            <b>{Math.round(trend.rate * 100)}%</b>
            <span>{trend.sample > 0 ? `${trend.hits}/${trend.sample}` : 'Price'}</span>
            {trend.form.length > 0 && <FormPips form={trend.form} />}
            {trend.form.length > 0 && <em className={trend.squad === 'full' ? '' : 'squad-alert'}>{squadLabel(trend.squad)}</em>}
          </div>
        </article>
      ))}
    </section>
  );
}
