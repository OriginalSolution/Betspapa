/** Country label for a fixture group: ISO alpha-3, or the football code fans expect, plus a flag file when we have one. */

export type CountryMark = { code: string; flag: string | null };

type Row = { code: string; flag: string | null };

function row(code: string, id: string | null): Row {
  return id ? { code, flag: `/flags/${id}.svg` } : { code, flag: null };
}

/** Keys are normalized country names from the fixture feed. */
const COUNTRIES: Record<string, Row> = {
  spain: row('ESP', 'es'),
  england: row('ENG', 'gb-eng'),
  scotland: row('SCO', 'gb-sct'),
  wales: row('WAL', 'gb-wls'),
  'northern ireland': row('NIR', 'gb-nir'),
  italy: row('ITA', 'it'),
  germany: row('DEU', 'de'),
  france: row('FRA', 'fr'),
  argentina: row('ARG', 'ar'),
  russia: row('RUS', 'ru'),
  brazil: row('BRA', 'br'),
  greece: row('GRC', 'gr'),
  netherlands: row('NLD', 'nl'),
  holland: row('NLD', 'nl'),
  poland: row('POL', 'pl'),
  austria: row('AUT', 'at'),
  romania: row('ROU', 'ro'),
  australia: row('AUS', 'au'),
  mexico: row('MEX', 'mx'),
  egypt: row('EGY', 'eg'),
  slovakia: row('SVK', 'sk'),
  portugal: row('PRT', 'pt'),
  bulgaria: row('BGR', 'bg'),
  japan: row('JPN', 'jp'),
  usa: row('USA', 'us'),
  'united states': row('USA', 'us'),
  'united states of america': row('USA', 'us'),
  denmark: row('DNK', 'dk'),
  sweden: row('SWE', 'se'),
  uruguay: row('URY', 'uy'),
  belgium: row('BEL', 'be'),
  peru: row('PER', 'pe'),
  turkiye: row('TUR', 'tr'),
  turkey: row('TUR', 'tr'),
  chile: row('CHL', 'cl'),
  serbia: row('SRB', 'rs'),
  norway: row('NOR', 'no'),
  'el salvador': row('SLV', 'sv'),
  colombia: row('COL', 'co'),
  cyprus: row('CYP', 'cy'),
  bolivia: row('BOL', 'bo'),
  switzerland: row('CHE', 'ch'),
  croatia: row('HRV', 'hr'),
  ecuador: row('ECU', 'ec'),
  kenya: row('KEN', 'ke'),
  'bosnia and herzegovina': row('BIH', 'ba'),
  india: row('IND', 'in'),
  czechia: row('CZE', 'cz'),
  'czech republic': row('CZE', 'cz'),
  ukraine: row('UKR', 'ua'),
  georgia: row('GEO', 'ge'),
  panama: row('PAN', 'pa'),
  belarus: row('BLR', 'by'),
  guatemala: row('GTM', 'gt'),
  lithuania: row('LTU', 'lt'),
  paraguay: row('PRY', 'py'),
  cameroon: row('CMR', 'cm'),
  'saint kitts and nevis': row('KNA', 'kn'),
  slovenia: row('SVN', 'si'),
  mali: row('MLI', 'ml'),
  ghana: row('GHA', 'gh'),
  international: row('INT', null),
  'international clubs': row('INT', null),
  'international youth': row('INT', null),
  world: row('INT', null),
  europe: row('EUR', null),
  'simulated reality league': row('SRL', null),
};

function normalize(area: string): string {
  return area
    .toLowerCase()
    .replace(/\bamateur\b/g, '')
    .replace(/[^a-z ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function countryMark(area: string): CountryMark {
  const found = COUNTRIES[normalize(area)];
  if (found) return found;
  const letters = area.replace(/[^A-Za-z]/g, '');
  return { code: (letters.slice(0, 3) || 'INT').toUpperCase(), flag: null };
}
