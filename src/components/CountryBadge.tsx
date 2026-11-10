import { countryMark } from '../lib/country';

export function CountryBadge({ area }: { area: string }) {
  const mark = countryMark(area);
  return (
    <span className="code">
      {mark.flag ? <img className="flag" src={mark.flag} alt="" /> : null}
      <span>{mark.code}</span>
    </span>
  );
}
