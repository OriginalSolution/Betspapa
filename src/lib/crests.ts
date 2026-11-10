/** Club badges from Wikipedia page images. A miss stays an initials mark. */

const KEY = 'betspapa.crests.v2';
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
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function scoreCrestPage(name: string, page: WikiPage): number {
  const title = fold(page.title || '');
  const desc = (page.description || '').toLowerCase();
  const wanted = fold(expandTeamName(name));
  if (/municipality|city in|family name|constituency|parliamentary/.test(desc)) return -1;
  const football = /football|soccer/.test(desc) || /\bfc\b|\bf\.c/.test(title);
  if (!football) return -1;
  const womenPage = /women|ladies|w\.f\.c/.test(desc) || /\bwomen\b/.test(title);
  const womenName = /\bwomen\b|\bladies\b|\bwfc\b|(^|\s)w$/.test(name.toLowerCase());
  if (womenPage !== womenName) return -1;
  let score = 0;
  if (/association football|football club/.test(desc)) score += 4;
  if (title.includes(wanted)) score += 4;
  for (const token of wanted.split(/\s+/).filter((part) => part.length > 2)) {
    if (title.includes(token)) score += 1;
  }
  const thumb = page.thumbnail?.source?.toLowerCase() || '';
  if (/logo|badge|crest|shield|escudo|\.svg/.test(thumb)) score += 3;
  return score;
}

export function pickCrestPage(name: string, pages: WikiPage[]): WikiPage | null {
  let best: WikiPage | null = null;
  let bestScore = 1;
  for (const page of pages) {
    const score = scoreCrestPage(name, page);
    if (score > bestScore) {
      best = page;
      bestScore = score;
    }
  }
  return best;
}

export function crestUrlFromSummary(summary: { thumbnail?: { source?: string }; description?: string; title?: string }, name: string): string | null {
  const source = summary.thumbnail?.source;
  if (!source) return null;
  if (scoreCrestPage(name, { title: summary.title, description: summary.description, thumbnail: { source } }) < 2) return null;
  const lower = source.toLowerCase();
  if (/\.jpe?g/.test(lower) && !/logo|badge|crest|shield|escudo/.test(lower)) return null;
  return source.replace(/\/\d+px-/, '/250px-');
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

async function readJson(response: Response): Promise<any> {
  if (!response.ok) throw new Error(`crest lookup ${response.status}`);
  return response.json();
}

export async function lookupCrest(name: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  const cached = cachedCrest(name);
  if (cached !== undefined) return cached;
  const searchName = expandTeamName(name);
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: `${searchName} football`,
    gsrlimit: '5',
    prop: 'description|pageimages',
    piprop: 'thumbnail',
    pithumbsize: '80',
    format: 'json',
    origin: '*',
  });
  try {
    const found = await readJson(await fetchImpl(`https://en.wikipedia.org/w/api.php?${params}`));
    const pages = Object.values((found?.query?.pages || {}) as Record<string, WikiPage>);
    const best = pickCrestPage(name, pages);
    if (!best?.title) {
      rememberCrest(name, null);
      return null;
    }
    const searched = crestUrlFromSummary(
      { title: best.title, description: best.description, thumbnail: best.thumbnail },
      name,
    );
    if (searched) {
      rememberCrest(name, searched);
      return searched;
    }
    const summary = await readJson(
      await fetchImpl(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(best.title.replace(/ /g, '_'))}`),
    );
    const url = crestUrlFromSummary(summary, name);
    rememberCrest(name, url);
    return url;
  } catch {
    return null;
  }
}

export async function resolveCrests(names: string[], onBatch: (found: Record<string, string>) => void, fetchImpl: typeof fetch = fetch) {
  const pending = names.filter((name, index) => names.indexOf(name) === index && cachedCrest(name) === undefined);
  const found: Record<string, string> = {};
  for (const name of names) {
    const cached = cachedCrest(name);
    if (cached) found[crestKey(name)] = cached;
  }
  if (Object.keys(found).length) onBatch({ ...found });
  let cursor = 0;
  const workers = Array.from({ length: Math.min(3, pending.length) }, async () => {
    while (cursor < pending.length) {
      const index = cursor;
      cursor += 1;
      const name = pending[index];
      const url = await lookupCrest(name, fetchImpl);
      if (!url) continue;
      found[crestKey(name)] = url;
      onBatch({ ...found });
    }
  });
  await Promise.all(workers);
}
