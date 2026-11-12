/** Club badges from Wikipedia page images. A miss stays an initials mark. */

const KEY = 'betspapa.crests.v5';
const HIT_MS = 14 * 86_400_000;
const MISS_MS = 12 * 60 * 60 * 1000;

type Entry = { url: string | null; at: number };

const ALIASES: Record<string, string> = {
  'man city': 'Manchester City',
  'man utd': 'Manchester United',
  'man united': 'Manchester United',
  spurs: 'Tottenham Hotspur',
  wolves: 'Wolverhampton Wanderers',
  'nottm forest': 'Nottingham Forest',
  'sheff utd': 'Sheffield United',
  'sheff wed': 'Sheffield Wednesday',
  'west ham': 'West Ham United',
  newcastle: 'Newcastle United',
  brighton: 'Brighton and Hove Albion',
  leicester: 'Leicester City',
};

export type WikiPage = {
  title?: string;
  description?: string;
  thumbnail?: { source?: string };
};

export function crestKey(name: string): string {
  return name.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
}

export function expandTeamName(name: string): string {
  const key = crestKey(name).replace(/\s+w$/, '').trim();
  return ALIASES[key] || ALIASES[crestKey(name)] || name;
}

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const CLUB_PREFIX = new Set(['fc', 'cf', 'sc', 'ac', 'cd', 'sd', 'ad', 'ue', 'ud', 'afc', 'cp', 'cde', 'rcd', 'ca', 'ec', 'fk', 'bk', 'sk', 'if', 'ff']);
const STATE_SUFFIX = new Set(['se', 'pe', 'rj', 'sp', 'mg', 'ba', 'rs', 'go', 'pr', 'sc', 'al', 'ce', 'ma', 'pa', 'am', 'es', 'rn', 'pb', 'pi', 'to', 'ro', 'ac', 'ap', 'rr', 'df']);
const CITY_SUFFIX = new Set(['gothenburg', 'goteborg', 'london', 'munich', 'munchen', 'geneva', 'geneve']);
const LEAD_WORD = /^(cf|cd|sd|ud|ue|ad|ac|sc|fc|afc|bk|ifk|ca|cp|cde|rcd|real|club|de|la|el|da|do|dos|das|futbol|football|futebol|fodbold|deportivo|deportiva|sporting|atletico|athletic|associacao|asociacion|association|union|unio|uniao|sociedad|desportiva|esportiva|esportivo|polideportivo|agrupacion)\b\s*/;

export function womenSide(name: string): boolean {
  return /\b(women|ladies|femenino|feminino|wfc)\b|(^|\s)w$|(^|\s)q$/i.test(name.trim());
}

export function coreTokens(name: string): string[] {
  const expanded = fold(expandTeamName(name)).replace(/\balcoron\b/g, 'alcorcon');
  const parts = expanded.split(' ').filter((part) => part.length > 1 && part !== 'women' && part !== 'ladies' && part !== 'reserve' && part !== 'reserves' && part !== 'w' && part !== 'q' && !CLUB_PREFIX.has(part));
  if (parts.length > 1 && STATE_SUFFIX.has(parts[parts.length - 1])) parts.pop();
  const withoutCity = parts.filter((part) => !CITY_SUFFIX.has(part));
  return withoutCity.length ? withoutCity : parts;
}

function leadOnly(before: string): boolean {
  let rest = before.trim();
  for (let guard = 0; guard < 6 && rest; guard += 1) {
    const next = rest.replace(LEAD_WORD, '').trim();
    if (next === rest) return false;
    rest = next;
  }
  return rest === '';
}

const QUALIFIER = new Set(['castilla', 'promesas', 'juvenil', 'youth', 'reserve', 'reserves', 'atletic', 'ii', 'iii']);

export function titleFitsClub(name: string, title: string): boolean {
  const core = coreTokens(name);
  const folded = fold(title);
  const titleTokens = folded.split(' ').filter(Boolean);
  const candidates = [core];
  if (core.length > 2 && !QUALIFIER.has(core[core.length - 1])) candidates.push(core.slice(0, -1));
  return candidates.some((tokens) => {
    if (!tokens.length || !tokens.every((token) => folded.includes(token))) return false;
    const at = folded.indexOf(tokens[0]);
    if (at < 0 || !leadOnly(folded.slice(0, at))) return false;
    return titleTokens.filter((token) => QUALIFIER.has(token)).every((token) => tokens.includes(token));
  });
}

function clubText(description: string): boolean {
  const text = fold(description);
  if (/municipality|city in|family name|constituency|parliamentary|stadium|stadion|footballer|soccer player|futsal|futbol sala|futebol de salao|beach soccer/.test(text)) return false;
  return /football|soccer|futbol|futebol|fodbold/.test(text) && /club|clube|team|equip/.test(text);
}

function womenText(title: string, description: string): boolean {
  return /women|ladies|femenin|feminin|femeni|feminino|damer|kvinde|w f c|wfc/.test(fold(`${title} ${description}`));
}

export function scoreCrestPage(name: string, page: WikiPage, context: CrestContext = {}): number {
  const title = page.title || '';
  const description = page.description || '';
  if (!clubText(description) || !titleFitsClub(name, title)) return -1;
  const womenPage = womenText(title, description);
  if (womenSide(name) !== womenPage) return -1;
  const area = fold(context.area || '');
  const about = fold(`${title} ${description}`);
  if (area.includes('spain') && /venezuela|argentina|colombia|mexico|chile|peru|ecuador/.test(about) && !/spain|espana|espanol|espanola/.test(about)) return -1;
  if ((area.includes('brazil') || area.includes('brasil')) && /\bportugal\b/.test(about) && !/brasil|brazil|brasileir/.test(about)) return -1;
  let score = 6 + coreTokens(name).length;
  const foldedTitle = fold(title);
  if (foldedTitle.startsWith(coreTokens(name)[0] || '')) score += 2;
  if (/"|\bii\b|\bmestalla\b|\s+b$/.test(foldedTitle) && !coreTokens(name).some((token) => token === 'b' || token === 'ii')) score -= 5;
  const thumb = page.thumbnail?.source?.toLowerCase() || '';
  if (/logo|badge|crest|shield|escudo|\.svg/.test(thumb)) score += 3;
  return score;
}

export function pickCrestPage(name: string, pages: WikiPage[], context: CrestContext = {}): WikiPage | null {
  let best: WikiPage | null = null;
  let bestScore = 1;
  for (const page of pages) {
    const score = scoreCrestPage(name, page, context);
    if (score > bestScore) {
      best = page;
      bestScore = score;
    }
  }
  return best;
}

export type CrestContext = { area?: string; competition?: string };

export function crestSearches(name: string, context: CrestContext = {}): Array<{ lang: string; query: string }> {
  const area = `${context.area || ''} ${context.competition || ''}`;
  const cleaned = name.replace(/\balcoron\b/i, 'Alcorcón').replace(/\s+(reserves?)$/i, '').trim();
  const base = cleaned.replace(/\s+(women|ladies|femenino|feminino|w|q)$/i, '').trim();
  const spain = /spain|españa|copa del rey|la liga/i.test(area) || /\b(cf|cd|sd|ud|ue|cp)\b/i.test(name);
  const brazil = /brazil|brasil|sergipe|pernambuco/i.test(area) || (/\b(se|pe)\b/i.test(name) && /\b(ec|ad)\b/i.test(name));
  const denmark = /denmark|danmark|liga/i.test(area) && /denmark|danmark/i.test(area);
  const out: Array<{ lang: string; query: string }> = [];
  const add = (lang: string, query: string) => {
    const text = query.replace(/\s+/g, ' ').trim();
    if (text.length < 3 || out.some((item) => item.lang === lang && fold(item.query) === fold(text))) return;
    out.push({ lang, query: text });
  };
  if (womenSide(name)) {
    add('en', `${cleaned} football`);
    add('en', `${base} Femenino`);
    add('en', `${base} women football`);
    if (spain) add('es', `${base} femenino`);
  }
  if (brazil) {
    const stripped = base.replace(/\s+(se|pe|rj|sp|mg|ba|rs)$/i, '').trim();
    const expanded = stripped.replace(/\bEC\b/g, 'Esporte Clube').replace(/\bAD\b/g, 'Associação Desportiva');
    add('pt', `${expanded} futebol`);
    add('en', `${expanded} football`);
  }
  if (spain) {
    const short = base.split(/\s+/).slice(0, 4).join(' ');
    add('en', `${short} football`);
    add('es', `${short} fútbol`);
  }
  if (denmark) add('en', `${cleaned} football`);
  add('en', `${base} football`);
  return out.slice(0, 4);
}

function photoBadge(url: string): boolean {
  return /stadium|stadion|squad|aerial|panorama|flag_of|portrait|building|players|team_photo|ground|map_of|wikipedia-logo/.test(url.toLowerCase());
}

export function normalizeBadge(source: string): string {
  const clean = source.split('?')[0];
  return /\/\d+px-/.test(clean) ? clean.replace(/\/\d+px-/, '/250px-') : clean;
}

export function crestUrlFromSummary(
  summary: { thumbnail?: { source?: string }; description?: string; title?: string },
  name: string,
  context: CrestContext = {},
): string | null {
  const source = summary.thumbnail?.source;
  if (!source || photoBadge(source)) return null;
  if (scoreCrestPage(name, { title: summary.title, description: summary.description, thumbnail: { source } }, context) < 2) return null;
  return normalizeBadge(source);
}

type Store = { getItem(key: string): string | null; setItem(key: string, value: string): void };
let memory: Store | null = null;
const ram = new Map<string, Entry>();

export function setCrestStore(store: Store | null) {
  memory = store;
}

function bucket(): Store | null {
  if (memory) return memory;
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* private mode */
  }
  return null;
}

function readCache(): Record<string, Entry> {
  try {
    const raw = bucket()?.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, Entry>) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeCache(cache: Record<string, Entry>) {
  try {
    bucket()?.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* a full cache must not block the board */
  }
}

export function cachedCrest(name: string, now = Date.now()): string | null | undefined {
  const key = crestKey(name);
  const hit = ram.get(key) || readCache()[key];
  if (!hit) return undefined;
  const max = hit.url ? HIT_MS : MISS_MS;
  if (now - hit.at > max) return undefined;
  return hit.url;
}

export function rememberCrest(name: string, url: string | null, now = Date.now()) {
  const key = crestKey(name);
  const entry = { url, at: now };
  ram.set(key, entry);
  const cache = readCache();
  cache[key] = entry;
  writeCache(cache);
}

async function readJson(response: Response, retry: () => Promise<Response>): Promise<any> {
  let current = response;
  for (let attempt = 0; current.status === 429 && attempt < 3; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    current = await retry();
  }
  if (!current.ok) throw new Error(`crest lookup ${current.status}`);
  return current.json();
}

const WIKI = { en: 'en', es: 'es', pt: 'pt', da: 'da' } as const;
let paced = Promise.resolve();

function pace(): Promise<void> {
  const next = paced.then(() => new Promise<void>((resolve) => setTimeout(resolve, 160)));
  paced = next;
  return next;
}

async function searchWiki(lang: string, query: string, fetchImpl: typeof fetch): Promise<WikiPage[]> {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: query,
    gsrlimit: '6',
    prop: 'description|pageimages',
    piprop: 'thumbnail',
    pithumbsize: '250',
    format: 'json',
    origin: '*',
  });
  const url = `https://${lang}.wikipedia.org/w/api.php?${params}`;
  await pace();
  const found = await readJson(await fetchImpl(url), async () => {
    await pace();
    return fetchImpl(url);
  });
  return Object.values((found?.query?.pages || {}) as Record<string, WikiPage>);
}

async function summaryBadge(lang: string, title: string, name: string, fetchImpl: typeof fetch, context: CrestContext): Promise<string | null> {
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`;
  await pace();
  const summary = await readJson(await fetchImpl(url), async () => {
    await pace();
    return fetchImpl(url);
  });
  return crestUrlFromSummary(summary, name, context);
}

export async function lookupCrest(name: string, fetchImpl: typeof fetch = fetch, context: CrestContext = {}): Promise<string | null> {
  const cached = cachedCrest(name);
  if (cached !== undefined) return cached;
  let answered = false;
  let failed = false;
  let sawClub = false;
  try {
    for (const search of crestSearches(name, context)) {
      const lang = WIKI[search.lang as keyof typeof WIKI] || 'en';
      let pages: WikiPage[] = [];
      try {
        pages = await searchWiki(lang, search.query, fetchImpl);
        answered = true;
      } catch {
        failed = true;
        continue;
      }
      const best = pickCrestPage(name, pages, context);
      if (!best?.title) continue;
      sawClub = true;
      const fromSearch = crestUrlFromSummary(best, name, context);
      if (fromSearch) {
        rememberCrest(name, fromSearch);
        return fromSearch;
      }
      try {
        const fromSummary = await summaryBadge(lang, best.title, name, fetchImpl, context);
        if (fromSummary) {
          rememberCrest(name, fromSummary);
          return fromSummary;
        }
      } catch {
        failed = true;
      }
    }
    if (answered && !sawClub && !failed) rememberCrest(name, null);
    return null;
  } catch {
    return null;
  }
}

export type CrestRequest = { name: string; area?: string; competition?: string };

export async function resolveCrests(
  input: Array<string | CrestRequest>,
  onBatch: (found: Record<string, string>) => void,
  fetchImpl: typeof fetch = fetch,
  lookup: (name: string, fetchImpl: typeof fetch, context: CrestContext) => Promise<string | null> = lookupCrest,
) {
  const requests: CrestRequest[] = [];
  for (const item of input) {
    const request = typeof item === 'string' ? { name: item } : item;
    if (!request.name || requests.some((existing) => existing.name === request.name)) continue;
    requests.push(request);
  }
  const found: Record<string, string> = {};
  for (const request of requests) {
    const cached = cachedCrest(request.name);
    if (cached) found[crestKey(request.name)] = cached;
  }
  if (Object.keys(found).length) onBatch({ ...found });
  const pending = requests.filter((request) => cachedCrest(request.name) === undefined);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(1, pending.length) }, async () => {
    while (cursor < pending.length) {
      const index = cursor;
      cursor += 1;
      const request = pending[index];
      const url = await lookup(request.name, fetchImpl, request);
      if (!url) continue;
      found[crestKey(request.name)] = url;
      onBatch({ ...found });
    }
  });
  await Promise.all(workers);
  for (const request of pending) {
    if (cachedCrest(request.name) !== undefined) continue;
    const url = await lookup(request.name, fetchImpl, request);
    if (!url) continue;
    found[crestKey(request.name)] = url;
    onBatch({ ...found });
  }
}
