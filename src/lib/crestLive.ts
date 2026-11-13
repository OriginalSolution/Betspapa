/**
 * Live crest fallback used only when the bundled store has no badge.
 * TheSportsDB, then Wikidata, then Wikipedia, then a national-team flag.
 */
import { allowedImageUrl, flagUrl, isNationalSide, pickBest, searchQueries, sportsDbCandidates, wikidataCandidates } from './crestMatch.mjs';
import { lookupCrest, rememberCrest, type CrestContext } from './crests';

const USER_AGENT = 'Betspapa/0.3.6 (crest resolver; https://github.com/OriginalSolution/Betspapa)';
const SPORTSDB = 'https://www.thesportsdb.com/api/v1/json/123';

let sportsAt = 0;
let wikiAt = 0;

async function gap(kind: 'sports' | 'wiki') {
  const waitMs = kind === 'sports' ? 1500 : 280;
  const now = Date.now();
  const due = kind === 'sports' ? sportsAt : wikiAt;
  const wait = Math.max(0, due - now);
  const next = Math.max(now, due) + waitMs;
  if (kind === 'sports') sportsAt = next;
  else wikiAt = next;
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
}

async function readJson(url: string, fetchImpl: typeof fetch, kind: 'sports' | 'wiki'): Promise<any> {
  await gap(kind);
  const response = await fetchImpl(url, { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } });
  if (response.status === 429) return null;
  if (!response.ok) return null;
  return response.json();
}

async function sportsDbCrest(name: string, context: CrestContext, fetchImpl: typeof fetch): Promise<string | null> {
  for (const query of searchQueries(name, context)) {
    let payload: any = null;
    try {
      payload = await readJson(`${SPORTSDB}/searchteams.php?t=${encodeURIComponent(query)}`, fetchImpl, 'sports');
    } catch {
      continue;
    }
    const candidates = sportsDbCandidates(payload).map((team) => ({
      ...team,
      badge: allowedImageUrl(team.badge) ? team.badge : '',
    }));
    const picked = pickBest(name, candidates, context);
    const badge = picked?.candidate.badge;
    if (badge && allowedImageUrl(badge)) return badge;
    const id = picked?.candidate.id;
    if (!id) continue;
    try {
      const lookup = await readJson(`${SPORTSDB}/lookupteam.php?id=${encodeURIComponent(id)}`, fetchImpl, 'sports');
      const confirmed = sportsDbCandidates(lookup).find((team) => allowedImageUrl(team.badge));
      if (confirmed?.badge) return confirmed.badge;
    } catch {
      /* the next source can still find a badge */
    }
  }
  return null;
}

async function wikidataCrest(name: string, context: CrestContext, fetchImpl: typeof fetch): Promise<string | null> {
  const found = [];
  for (const query of searchQueries(name, context).slice(0, 2)) {
    let search: any = null;
    try {
      search = await readJson(
        `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=en&format=json&type=item&limit=6&origin=*`,
        fetchImpl,
        'wiki',
      );
    } catch {
      continue;
    }
    const ids = (search?.search || []).map((item: { id?: string }) => item.id).filter(Boolean).slice(0, 6);
    if (!ids.length) continue;
    try {
      const entities = await readJson(
        `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids.join('|')}&props=claims|descriptions|labels|aliases&languages=en&format=json&origin=*`,
        fetchImpl,
        'wiki',
      );
      found.push(...wikidataCandidates(entities?.entities));
    } catch {
      /* try the next query */
    }
  }
  const picked = pickBest(name, found, context);
  const badge = picked?.candidate.badge;
  return badge && allowedImageUrl(badge) ? badge : null;
}

export async function lookupCrestChain(name: string, fetchImpl: typeof fetch = fetch, context: CrestContext = {}): Promise<string | null> {
  try {
    const sports = await sportsDbCrest(name, context, fetchImpl);
    if (sports) {
      rememberCrest(name, sports);
      return sports;
    }
  } catch {
    /* Wikidata is the next layer */
  }
  try {
    const data = await wikidataCrest(name, context, fetchImpl);
    if (data) {
      rememberCrest(name, data);
      return data;
    }
  } catch {
    /* Wikipedia is the next layer */
  }
  const wiki = await lookupCrest(name, fetchImpl, context);
  if (wiki) return wiki;
  if (isNationalSide(name, context)) {
    const flag = flagUrl(name);
    if (flag && allowedImageUrl(flag)) {
      rememberCrest(name, flag);
      return flag;
    }
  }
  return null;
}
