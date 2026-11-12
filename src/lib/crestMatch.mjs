/**
 * Team-name matching for crests. A score under the threshold never becomes a badge.
 * Youth, reserve, and women's suffixes map onto the parent club. Country and league
 * hints separate clubs that share a name.
 */

export const CONFIDENCE = 0.86;
export const AMBIGUITY = 0.05;

const CLUB_TOKENS = new Set([
  'fc', 'sc', 'cf', 'afc', 'ac', 'cd', 'sd', 'ad', 'ud', 'ue', 'cp', 'cde', 'rcd', 'ca', 'ec', 'fk', 'bk', 'sk', 'if', 'ff',
  'club', 'de', 'the', 'ifk', 'aa', 'sl', 'us', 'as', 'acd', 'cs', 'ca', 'nk', 'gfk', 'mks', 'ks', 'lks', 'vv', 'sv', 'tsv',
  'vfl', 'vfb', 'fsv',
]);

const STATE_SUFFIX = new Set(['se', 'pe', 'rj', 'sp', 'mg', 'ba', 'rs', 'go', 'pr', 'sc', 'al', 'ce', 'ma', 'pa', 'am', 'es', 'rn', 'pb', 'pi', 'to', 'ro', 'ac', 'ap', 'rr', 'df']);

/** Short feed labels and national-team spellings. Values are the name we search. */
const ALIASES = {
  'man city': 'manchester city',
  'man utd': 'manchester united',
  'man united': 'manchester united',
  spurs: 'tottenham hotspur',
  wolves: 'wolverhampton wanderers',
  'nottm forest': 'nottingham forest',
  'nott m forest': 'nottingham forest',
  'sheff utd': 'sheffield united',
  'sheff wed': 'sheffield wednesday',
  'west ham': 'west ham united',
  newcastle: 'newcastle united',
  brighton: 'brighton and hove albion',
  leicester: 'leicester city',
  psg: 'paris saint germain',
  inter: 'inter milan',
  'atletico madrid': 'atletico madrid',
  'atl madrid': 'atletico madrid',
  barca: 'barcelona',
  czechia: 'czech republic',
  'czech republic': 'czech republic',
  turkiye: 'turkey',
  turkey: 'turkey',
  'korea republic': 'south korea',
  'republic of korea': 'south korea',
  'south korea': 'south korea',
  'ivory coast': 'ivory coast',
  'cote d ivoire': 'ivory coast',
  'cape verde': 'cape verde',
  'cabo verde': 'cape verde',
  eswatini: 'eswatini',
  swaziland: 'eswatini',
  'bosnia and herzegovina': 'bosnia and herzegovina',
  'bosnia herzegovina': 'bosnia and herzegovina',
  'north macedonia': 'north macedonia',
  macedonia: 'north macedonia',
  holland: 'netherlands',
  usa: 'united states',
  'united states': 'united states',
  uae: 'united arab emirates',
  'united arab emirates': 'united arab emirates',
  ireland: 'republic of ireland',
  'republic of ireland': 'republic of ireland',
  'northern ireland': 'northern ireland',
  'dr congo': 'dr congo',
  'congo dr': 'dr congo',
  'the gambia': 'gambia',
  gambia: 'gambia',
  'ir iran': 'iran',
  iran: 'iran',
  'saint martin': 'saint martin',
  huddersfield: 'huddersfield town',
  valladolid: 'real valladolid',
  betis: 'real betis',
  'cd junior fc': 'atletico junior',
  'cd tolima': 'deportes tolima',
  'america fc mg': 'america mineiro',
  'sc recife pe': 'sport club recife',
  'leyton orient london': 'leyton orient',
  'queens park fc': 'queens park',
  'thespa gunma': 'thespakusatsu gunma',
  'giravanz kitakyushu': 'giravanz kitakyushu',
  'b93 copenhagen': 'b93',
  'nykoebing fc': 'nykobing',
  'lucchese calcio': 'lucchese',
  'larne fc': 'larne',
  'newport county': 'newport county',
  'mansfield town': 'mansfield town',
};

/** Bundled flag file (flag-icons) and a flagcdn code when the svg is not in the app. */
const FLAGS = {
  spain: ['es', '/flags/es.svg'],
  england: ['gb-eng', '/flags/gb-eng.svg'],
  scotland: ['gb-sct', '/flags/gb-sct.svg'],
  wales: ['gb-wls', '/flags/gb-wls.svg'],
  'northern ireland': ['gb-nir', '/flags/gb-nir.svg'],
  italy: ['it', '/flags/it.svg'],
  germany: ['de', '/flags/de.svg'],
  france: ['fr', '/flags/fr.svg'],
  argentina: ['ar', '/flags/ar.svg'],
  russia: ['ru', '/flags/ru.svg'],
  brazil: ['br', '/flags/br.svg'],
  greece: ['gr', '/flags/gr.svg'],
  netherlands: ['nl', '/flags/nl.svg'],
  poland: ['pl', '/flags/pl.svg'],
  austria: ['at', '/flags/at.svg'],
  romania: ['ro', '/flags/ro.svg'],
  australia: ['au', '/flags/au.svg'],
  mexico: ['mx', '/flags/mx.svg'],
  egypt: ['eg', '/flags/eg.svg'],
  slovakia: ['sk', '/flags/sk.svg'],
  portugal: ['pt', '/flags/pt.svg'],
  bulgaria: ['bg', '/flags/bg.svg'],
  japan: ['jp', '/flags/jp.svg'],
  'united states': ['us', '/flags/us.svg'],
  denmark: ['dk', '/flags/dk.svg'],
  sweden: ['se', '/flags/se.svg'],
  uruguay: ['uy', '/flags/uy.svg'],
  belgium: ['be', '/flags/be.svg'],
  peru: ['pe', '/flags/pe.svg'],
  turkey: ['tr', '/flags/tr.svg'],
  chile: ['cl', '/flags/cl.svg'],
  serbia: ['rs', '/flags/rs.svg'],
  norway: ['no', '/flags/no.svg'],
  'el salvador': ['sv', '/flags/sv.svg'],
  colombia: ['co', '/flags/co.svg'],
  cyprus: ['cy', '/flags/cy.svg'],
  bolivia: ['bo', '/flags/bo.svg'],
  switzerland: ['ch', '/flags/ch.svg'],
  croatia: ['hr', '/flags/hr.svg'],
  ecuador: ['ec', '/flags/ec.svg'],
  kenya: ['ke', '/flags/ke.svg'],
  'bosnia and herzegovina': ['ba', '/flags/ba.svg'],
  india: ['in', '/flags/in.svg'],
  czechia: ['cz', '/flags/cz.svg'],
  'czech republic': ['cz', '/flags/cz.svg'],
  ukraine: ['ua', '/flags/ua.svg'],
  georgia: ['ge', '/flags/ge.svg'],
  panama: ['pa', '/flags/pa.svg'],
  belarus: ['by', '/flags/by.svg'],
  guatemala: ['gt', '/flags/gt.svg'],
  lithuania: ['lt', '/flags/lt.svg'],
  paraguay: ['py', '/flags/py.svg'],
  cameroon: ['cm', '/flags/cm.svg'],
  'saint kitts and nevis': ['kn', '/flags/kn.svg'],
  slovenia: ['si', '/flags/si.svg'],
  mali: ['ml', '/flags/ml.svg'],
  ghana: ['gh', '/flags/gh.svg'],
  albania: ['al', null],
  finland: ['fi', null],
  montenegro: ['me', null],
  latvia: ['lv', null],
  'san marino': ['sm', null],
  benin: ['bj', null],
  'central african republic': ['cf', null],
  namibia: ['na', null],
  'ivory coast': ['ci', null],
  gambia: ['gm', null],
  senegal: ['sn', null],
  sudan: ['sd', null],
  malta: ['mt', null],
  eswatini: ['sz', null],
  barbados: ['bb', null],
  guadeloupe: ['gp', null],
  'cayman islands': ['ky', null],
  guyana: ['gy', null],
  bonaire: ['bq', null],
  cuba: ['cu', null],
  aruba: ['aw', null],
  martinique: ['mq', null],
  'antigua and barbuda': ['ag', null],
  'trinidad and tobago': ['tt', null],
  moldova: ['md', null],
  kazakhstan: ['kz', null],
  andorra: ['ad', null],
  gibraltar: ['gi', null],
  iceland: ['is', null],
  liechtenstein: ['li', null],
  azerbaijan: ['az', null],
  luxembourg: ['lu', null],
  estonia: ['ee', null],
  'north macedonia': ['mk', null],
  'faroe islands': ['fo', null],
  kosovo: ['xk', null],
  israel: ['il', null],
  hungary: ['hu', null],
  'republic of ireland': ['ie', null],
  ireland: ['ie', null],
  'south korea': ['kr', null],
  'korea republic': ['kr', null],
  nigeria: ['ng', null],
  morocco: ['ma', null],
  tunisia: ['tn', null],
  algeria: ['dz', null],
  'south africa': ['za', null],
  qatar: ['qa', null],
  'saudi arabia': ['sa', null],
  'united arab emirates': ['ae', null],
  honduras: ['hn', null],
  singapore: ['sg', null],
  syria: ['sy', null],
  kuwait: ['kw', null],
  curacao: ['cw', null],
  bermuda: ['bm', null],
  'puerto rico': ['pr', null],
  grenada: ['gd', null],
  'saint lucia': ['lc', null],
  dominica: ['dm', null],
  comoros: ['km', null],
  congo: ['cg', null],
  'dr congo': ['cd', null],
  mozambique: ['mz', null],
  ethiopia: ['et', null],
  zambia: ['zm', null],
  burundi: ['bi', null],
  'burkina faso': ['bf', null],
  mauritania: ['mr', null],
  'cape verde': ['cv', null],
  liberia: ['lr', null],
  gabon: ['ga', null],
  lesotho: ['ls', null],
  tanzania: ['tz', null],
  libya: ['ly', null],
  malawi: ['mw', null],
  rwanda: ['rw', null],
  niger: ['ne', null],
  iran: ['ir', null],
  'saint martin': ['mf', null],
  venezuela: ['ve', null],
  'costa rica': ['cr', null],
  jamaica: ['jm', null],
  haiti: ['ht', null],
  canada: ['ca', null],
  china: ['cn', null],
  iran: ['ir', null],
  iraq: ['iq', null],
  jordan: ['jo', null],
  lebanon: ['lb', null],
  oman: ['om', null],
  bahrain: ['bh', null],
  thailand: ['th', null],
  vietnam: ['vn', null],
  indonesia: ['id', null],
  malaysia: ['my', null],
  'new zealand': ['nz', null],
  'saudi': ['sa', null],
};

const SOURCE_ORDER = ['override', 'fixture', 'thesportsdb', 'wikidata', 'wikipedia', 'flag'];

const NATIONAL_COMPETITION = /nations league|friendly games|world cup|european championship|copa america|africa cup|asian cup|gold cup|concacaf|afcon|olympic|qualification|qualif/;

export function fold(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Same loose key the board already uses for crest maps. Accents become spaces, matching `crestKey`. */
export function looseKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Same id the fixture mapper stores on a team. */
export function teamSlug(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'team';
}

export function expandAlias(name) {
  const folded = fold(name);
  return ALIASES[folded] || name;
}

export function stripQualifiers(name) {
  return fold(name)
    .replace(/\bu\d{2}\b/g, ' ')
    .replace(/\b(women|ladies|femenino|feminino|feminine|femeni|wfc|dames|kvinde|female|girls)\b/g, ' ')
    .replace(/\b(reserves|reserve|youth|juvenil|academy|castilla|promesas|atletic)\b/g, ' ')
    .replace(/\bjong\b/g, ' ')
    .replace(/\s+(w|q|ii|iii|b|c)$/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function coreName(name) {
  const aliased = ALIASES[fold(name)] || ALIASES[stripQualifiers(name)] || stripQualifiers(name);
  const folded = stripQualifiers(aliased);
  const parts = folded.split(' ').filter((part) => part && part.length > 1 && !CLUB_TOKENS.has(part));
  if (parts.length > 1 && STATE_SUFFIX.has(parts[parts.length - 1])) parts.pop();
  return parts.join(' ') || folded;
}

export function indexKeys(name) {
  const keys = new Set([looseKey(name), fold(name), coreName(name), teamSlug(name), fold(expandAlias(name))]);
  return [...keys].filter((key) => key && key.length > 1);
}

export function realCountry(area) {
  const folded = fold(area || '').replace(/\b(amateur|clubs|youth|women)\b/g, ' ').replace(/\s+/g, ' ').trim();
  if (!folded || /^(international|europe|world|africa|asia|south america|north america)$/.test(folded)) return '';
  return folded;
}

export function isNationalContext(context = {}) {
  const area = fold(context.area || '');
  const competition = fold(context.competition || '');
  const blob = `${area} ${competition}`;
  if (/club/.test(area) && !NATIONAL_COMPETITION.test(competition)) return false;
  if (area === 'international' || area === 'international youth' || area === 'world' || area === 'europe') {
    return NATIONAL_COMPETITION.test(blob) || area === 'international youth';
  }
  return NATIONAL_COMPETITION.test(competition) && !/amateur|league|division|cup/.test(area);
}

export function isNationalSide(name, context = {}) {
  if (!isNationalContext(context)) return false;
  const core = coreName(name);
  return Boolean(FLAGS[core] || FLAGS[fold(name)] || FLAGS[fold(expandAlias(name))]);
}

export function flagFor(name) {
  const keys = [coreName(name), fold(name), fold(expandAlias(name)), fold(stripQualifiers(name))];
  for (const key of keys) {
    const row = FLAGS[key];
    if (row) return { iso: row[0], svg: row[1], key };
  }
  return null;
}

export function flagUrl(name) {
  const flag = flagFor(name);
  if (!flag) return null;
  if (flag.svg) return flag.svg;
  return `https://flagcdn.com/w160/${flag.iso}.png`;
}

export function searchQueries(name, context = {}) {
  const queries = [];
  const add = (value) => {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (text.length < 3 || queries.some((item) => fold(item) === fold(text))) return;
    queries.push(text);
  };
  add(name);
  const alias = ALIASES[fold(name)] || ALIASES[stripQualifiers(name)] || ALIASES[coreName(name)];
  if (alias) add(alias);
  const core = coreName(name);
  add(core);
  if (isNationalSide(name, context) || (isNationalContext(context) && flagFor(name))) {
    add(`${alias || core} national football team`);
  } else {
    const country = realCountry(context.area);
    if (country && fold(country) !== fold(core)) add(`${core} ${country}`);
  }
  return queries.slice(0, 4);
}

function levenshtein(left, right) {
  const rows = Array.from({ length: left.length + 1 }, (_, index) => [index]);
  for (let col = 1; col <= right.length; col += 1) rows[0][col] = col;
  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
    }
  }
  return rows[left.length][right.length];
}

export function nameSimilarity(query, candidate) {
  const left = coreName(query);
  const right = coreName(candidate);
  if (!left || !right) return 0;
  if (left === right) return 0.97;
  const at = left.split(' ');
  const bt = right.split(' ');
  if (at.every((token) => bt.includes(token)) && bt.every((token) => at.includes(token))) return 0.97;
  if (at.every((token) => bt.includes(token)) && bt.length > at.length) {
    if (at.length === 1) return 0.55;
    return 0.72;
  }
  if (bt.every((token) => at.includes(token)) && at.length > bt.length) {
    if (bt.length === 1 && FLAGS[bt[0]]) return 0.58;
    if (bt.length === 1 && at.length >= 3) return 0.7;
    if (bt.length === 1 && at.length === 2) return 0.9;
    return 0.92;
  }
  const ratio = 1 - levenshtein(left, right) / Math.max(left.length, right.length);
  return ratio >= 0.92 ? 0.91 : ratio * 0.8;
}

export function countryFits(area, country) {
  const left = realCountry(area) || fold(area);
  const right = fold(country);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.includes(right) || right.includes(left)) return true;
  const alias = fold(ALIASES[left] || '');
  return Boolean(alias) && (alias === right || right.includes(alias) || alias.includes(right));
}

export function leagueFits(competition, leagues) {
  const left = fold(competition);
  const rights = (Array.isArray(leagues) ? leagues : [leagues]).map((league) => fold(league)).filter(Boolean);
  if (!left || !rights.length) return false;
  const hints = [
    'champions league', 'europa league', 'conference league', 'premier league', 'championship', 'league one', 'league two',
    'national league', 'fa cup', 'la liga', 'laliga', 'segunda', 'primera federacion', 'copa del rey', 'serie a', 'serie b',
    'serie c', 'bundesliga', 'eredivisie', 'eerste divisie', 'ligue 1', 'ligue 2', 'primeira liga', 'j1 league', 'j2 league',
    'j3 league', 'allsvenskan', 'eliteserien', 'super league', 'premiering',
  ];
  return hints.some((hint) => left.includes(hint) && rights.some((league) => league.includes(hint)));
}

function soccer(sport) {
  const text = fold(sport || 'soccer');
  return !text || text === 'soccer' || text === 'football';
}

export function scoreCandidate(queryName, candidate, context = {}) {
  if (!candidate || !soccer(candidate.sport)) return 0;
  const names = [candidate.name, ...(candidate.aliases || [])].filter(Boolean);
  let best = 0;
  for (const name of names) best = Math.max(best, nameSimilarity(queryName, name));
  if (best < 0.5) return best;
  if (context.area && candidate.country) {
    if (countryFits(context.area, candidate.country)) best = Math.min(1, best + 0.03);
    else if (realCountry(context.area)) best -= 0.28;
  }
  const leagues = candidate.leagues || (candidate.league ? [candidate.league] : []);
  if (leagueFits(context.competition || '', leagues)) best = Math.min(1, best + 0.05);
  return Math.max(0, Math.min(1, Number(best.toFixed(4))));
}

export function pickBest(queryName, candidates, context = {}) {
  const ranked = (candidates || [])
    .map((candidate) => ({ candidate, score: scoreCandidate(queryName, candidate, context) }))
    .filter((row) => row.score >= CONFIDENCE)
    .sort((a, b) => b.score - a.score || String(a.candidate.name).length - String(b.candidate.name).length);
  if (!ranked.length) return null;
  const close = ranked.filter((row) => ranked[0].score - row.score < AMBIGUITY);
  if (close.length > 1) {
    const sameClub = close.every((row) => coreName(row.candidate.name) === coreName(close[0].candidate.name) && fold(row.candidate.country || '') === fold(close[0].candidate.country || ''));
    if (sameClub) {
      const badged = close.find((row) => allowedImageUrl(row.candidate.badge || ''));
      const chosen = badged || close[0];
      return { candidate: chosen.candidate, confidence: chosen.score };
    }
    const leagues = (row) => row.candidate.leagues || (row.candidate.league ? [row.candidate.league] : []);
    const fitted = close.filter((row) => leagueFits(context.competition || '', leagues(row)));
    if (fitted.length === 1) return { candidate: fitted[0].candidate, confidence: fitted[0].score };
    const area = realCountry(context.area);
    if (area) {
      const countries = close.filter((row) => countryFits(area, row.candidate.country || ''));
      if (countries.length === 1) return { candidate: countries[0].candidate, confidence: countries[0].score };
    }
    return null;
  }
  return { candidate: ranked[0].candidate, confidence: ranked[0].score };
}

export function allowedImageUrl(url) {
  if (typeof url !== 'string') return false;
  const text = url.trim();
  if (!text) return false;
  const lower = text.toLowerCase();
  if (lower.includes('sofascore') || lower.includes('sportybet')) return false;
  if (text.startsWith('/flags/') || text.startsWith('/crests/')) return true;
  try {
    const parsed = new URL(text);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

const LOGO_FIELDS = ['crest', 'logo', 'badge', 'teamLogo', 'teamBadge', 'image', 'strBadge', 'strTeamBadge', 'homeCrest', 'awayCrest'];

export function providerLogo(record) {
  if (!record || typeof record !== 'object') return null;
  for (const key of LOGO_FIELDS) {
    const value = record[key];
    if (typeof value === 'string' && allowedImageUrl(value)) return value.trim();
  }
  return null;
}

export function sportsDbCandidates(payload) {
  const teams = Array.isArray(payload?.teams) ? payload.teams : [];
  return teams
    .filter((team) => team && typeof team === 'object')
    .map((team) => ({
      id: String(team.idTeam || ''),
      name: team.strTeam || '',
      aliases: String(team.strTeamAlternate || team.strAlternate || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      country: team.strCountry || '',
      sport: team.strSport || '',
      league: team.strLeague || '',
      leagues: [team.strLeague, team.strLeague2, team.strLeague3, team.strLeague4, team.strLeague5, team.strLeague6, team.strLeague7].filter(Boolean),
      badge: team.strBadge || team.strTeamBadge || '',
    }))
    .filter((team) => team.name);
}

export function commonsFileUrl(filename) {
  const file = String(filename || '').trim().replace(/ /g, '_');
  if (!file || /sofascore|sportybet/i.test(file)) return null;
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=128`;
}

const FOOTBALL_TYPES = new Set(['Q476028', 'Q6979593', 'Q6979754', 'Q15991376', 'Q847017', 'Q219456']);

export function wikidataCandidates(entities) {
  const rows = entities && typeof entities === 'object' ? Object.values(entities) : [];
  const out = [];
  for (const entity of rows) {
    if (!entity || typeof entity !== 'object') continue;
    const label = entity.labels?.en?.value || '';
    const description = entity.descriptions?.en?.value || '';
    const about = fold(`${label} ${description}`);
    if (/municipality|city in|footballer|soccer player|stadium|human|family name|film|song/.test(about)) continue;
    const claims = entity.claims || {};
    const types = (claims.P31 || []).map((claim) => claim?.mainsnak?.datavalue?.value?.id).filter(Boolean);
    const footballType = types.some((id) => FOOTBALL_TYPES.has(id));
    const footballText = /football|soccer/.test(about) && /club|team|national|side/.test(about);
    if (!footballType && !footballText) continue;
    const logo = (claims.P154 || []).map((claim) => claim?.mainsnak?.datavalue?.value).find((value) => typeof value === 'string');
    const countryId = (claims.P17 || []).map((claim) => claim?.mainsnak?.datavalue?.value?.id).find(Boolean) || '';
    out.push({
      id: entity.id || '',
      name: label,
      aliases: (entity.aliases?.en || []).map((item) => item.value).filter(Boolean),
      country: countryHint(description),
      countryId,
      sport: 'Soccer',
      league: '',
      leagues: [],
      badge: logo ? commonsFileUrl(logo) : '',
      description,
      national: /national/.test(about),
    });
  }
  return out;
}

function countryHint(description) {
  const text = String(description || '');
  const match = text.match(/\bin ([A-Z][A-Za-z]+(?: [A-Z][A-Za-z]+){0,2})$/);
  return match ? match[1] : '';
}

export function chooseLayer(layers) {
  for (const source of SOURCE_ORDER) {
    const hit = (layers || []).find((layer) => layer && layer.source === source && allowedImageUrl(layer.url));
    if (!hit) continue;
    const floor = source === 'override' || source === 'fixture' || source === 'flag' ? 0.8 : CONFIDENCE;
    if ((hit.confidence ?? 0) >= floor) return { ...hit, source };
  }
  return null;
}

export function blockedSourceLabel(source) {
  const text = fold(source || '');
  return text.includes('sportybet') || text.includes('sofascore');
}
