import type { Match, Team } from '../types';
import { crestKey } from './crests';
import { coreName, juniorSide, looseKey, teamSlug } from './crestMatch.mjs';

export type CrestCatalog = {
  byKey: Record<string, string>;
  byId: Record<string, string>;
};

const empty: CrestCatalog = { byKey: {}, byId: {} };

export async function loadCrestCatalog(fetchImpl: typeof fetch = fetch): Promise<CrestCatalog> {
  try {
    const response = await fetchImpl('/crests/crests.json');
    if (!response.ok) return empty;
    const body = (await response.json()) as Partial<CrestCatalog>;
    return {
      byKey: body.byKey && typeof body.byKey === 'object' ? body.byKey : {},
      byId: body.byId && typeof body.byId === 'object' ? body.byId : {},
    };
  } catch {
    return empty;
  }
}

function lookup(catalog: CrestCatalog, keys: string[]): string | null {
  for (const key of keys) {
    if (!key) continue;
    const byId = catalog.byId[key];
    if (byId) return byId;
    const byKey = catalog.byKey[key];
    if (byKey) return byKey;
  }
  return null;
}

/** Youth and reserve sides wear the senior crest. A women's side borrows it only when it has none. */
export function catalogCrest(catalog: CrestCatalog, team: Pick<Team, 'id' | 'name'>): string | null {
  const junior = juniorSide(team.name);
  const seniorKeys = junior ? [teamSlug(junior.senior), crestKey(junior.senior), looseKey(junior.senior), coreName(junior.senior)] : [];
  if (junior && junior.kind !== 'women') {
    const senior = lookup(catalog, seniorKeys);
    if (senior) return senior;
  }
  const own = lookup(catalog, [team.id, teamSlug(team.name), crestKey(team.name), looseKey(team.name), coreName(team.name)]);
  if (own || !junior) return own;
  return lookup(catalog, seniorKeys);
}

/** Paint keys are the board's crestKey, so the existing crest map can apply them. */
export function catalogUrls(matches: Match[], catalog: CrestCatalog): Record<string, string> {
  const found: Record<string, string> = {};
  for (const match of matches) {
    for (const team of [match.home, match.away]) {
      const url = catalogCrest(catalog, team);
      if (url) found[crestKey(team.name)] = url;
    }
  }
  return found;
}
