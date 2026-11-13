/**
 * Resolves club and national-team crests, downloads each badge once, and writes
 * public/crests. TheSportsDB is first, then Wikidata, Wikipedia, then a flag
 * for a national side. Fixture logo URLs win when the feed actually has one.
 */
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import {
  CONFIDENCE,
  allowedImageUrl,
  chooseLayer,
  coreName,
  flagUrl,
  fold,
  indexKeys,
  isNationalSide,
  looseKey,
  pickBest,
  realCountry,
  providerLogo,
  searchQueries,
  sportsDbCandidates,
  teamSlug,
  wikidataCandidates,
} from '../src/lib/crestMatch.mjs';

const USER_AGENT = 'Betspapa/0.3.8 (crest resolver; https://github.com/OriginalSolution/Betspapa)';
const SPORTSDB = 'https://www.thesportsdb.com/api/v1/json/123';
const SPORTS_GAP_MS = 1500;
const WIKI_GAP_MS = 280;

function emptyCatalog() {
  return { version: 1, generatedAt: null, byKey: {}, byId: {}, teams: [] };
}

export function crestDir(root = process.cwd()) {
  return join(root, 'public', 'crests');
}

function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export function loadCatalog(root = process.cwd()) {
  return { ...emptyCatalog(), ...readJson(join(crestDir(root), 'crests.json'), {}) };
}

export function loadOverrides(root = process.cwd()) {
  const body = readJson(join(crestDir(root), 'overrides.json'), {});
  return {
    byName: body.byName && typeof body.byName === 'object' ? body.byName : {},
    byId: body.byId && typeof body.byId === 'object' ? body.byId : {},
  };
}

function publishFile(root, relative, bytes) {
  const targets = [join(crestDir(root), relative)];
  const dist = join(root, 'dist', 'crests', relative);
  if (existsSync(join(root, 'dist'))) targets.push(dist);
  for (const target of targets) {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
  }
  return `/crests/${relative.replace(/\\/g, '/')}`;
}

export function saveCatalog(catalog, root = process.cwd()) {
  const next = { ...catalog, generatedAt: new Date().toISOString() };
  const body = JSON.stringify(next);
  publishFile(root, 'crests.json', body);
  return next;
}

export function saveMissing(teams, root = process.cwd(), resolvedNames = []) {
  const prior = readJson(join(crestDir(root), 'missing.json'), { teams: [] });
  const done = new Set(resolvedNames);
  const merged = new Map();
  for (const team of prior.teams || []) {
    const key = `${team.name}|${team.area || ''}`;
    if (!done.has(key)) merged.set(key, team);
  }
  for (const team of teams) merged.set(`${team.name}|${team.area || ''}`, team);
  const body = JSON.stringify({ generatedAt: new Date().toISOString(), teams: [...merged.values()] }, null, 2);
  publishFile(root, 'missing.json', body);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pacer(gap) {
  let nextAt = 0;
  return async function pace() {
    const wait = Math.max(0, nextAt - Date.now());
    nextAt = Math.max(Date.now(), nextAt) + gap;
    if (wait) await sleep(wait);
  };
}

async function readBody(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function fetchJson(url, fetchImpl, pace, tries = 3) {
  let last = new Error('crest request failed');
  for (let attempt = 0; attempt < tries; attempt += 1) {
    await pace();
    let response;
    try {
      response = await fetchImpl(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      last = error instanceof Error ? error : new Error(String(error));
      await sleep(1000 * (attempt + 1));
      continue;
    }
    if (response.status === 429) {
      const retry = Number(response.headers?.get?.('retry-after')) || 8;
      await sleep(Math.min(30, retry) * 1000);
      last = new Error(`crest lookup 429 ${url}`);
      continue;
    }
    if (!response.ok) {
      last = new Error(`crest lookup ${response.status}`);
      if (response.status >= 500) {
        await sleep(800 * (attempt + 1));
        continue;
      }
      return null;
    }
    return readBody(response);
  }
  throw last;
}

function fileName(key) {
  return `${createHash('sha1').update(key).digest('hex').slice(0, 16)}.png`;
}

function rasterize(input, output) {
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-i',
      input,
      '-vf',
      'scale=96:96:force_original_aspect_ratio=decrease:flags=lanczos,format=rgba,pad=96:96:(ow-iw)/2:(oh-ih)/2:color=black@0',
      '-frames:v',
      '1',
      '-update',
      '1',
      output,
    ];
    const child = spawn('ffmpeg', args, { stdio: 'ignore' });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
  });
}

async function downloadToFile(url, fetchImpl, target) {
  const response = await fetchImpl(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'image/*,*/*' },
    signal: AbortSignal.timeout(25_000),
    redirect: 'follow',
  });
  if (!response.ok) throw new Error(`crest image ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 80) throw new Error('crest image too small');
  const { writeFileSync: write } = await import('node:fs');
  write(target, bytes);
}

export async function storeImage(url, root, fetchImpl = fetch) {
  if (!allowedImageUrl(url)) return null;
  if (url.startsWith('/crests/')) {
    const relative = url.slice('/crests/'.length);
    return existsSync(join(crestDir(root), relative)) ? url : null;
  }
  const relative = `img/${fileName(url)}`;
  const finalPath = join(crestDir(root), relative);
  if (existsSync(finalPath) && readFileSync(finalPath).length > 80) {
    if (existsSync(join(root, 'dist'))) {
      const dist = join(root, 'dist', 'crests', relative);
      mkdirSync(dirname(dist), { recursive: true });
      if (!existsSync(dist)) copyFileSync(finalPath, dist);
    }
    return `/crests/${relative}`;
  }
  const stamp = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const tempIn = join(tmpdir(), `crest-in-${stamp}`);
  const tempOut = join(tmpdir(), `crest-out-${stamp}.png`);
  try {
    if (url.startsWith('/flags/')) {
      const local = join(root, 'public', url);
      if (!existsSync(local)) return null;
      await rasterize(local, tempOut);
    } else {
      await downloadToFile(url, fetchImpl, tempIn);
      await rasterize(tempIn, tempOut);
    }
    const png = readFileSync(tempOut);
    if (png.length < 80) return null;
    return publishFile(root, relative, png);
  } catch {
    return null;
  }
}

function cacheGet(cache, key) {
  return cache && Object.prototype.hasOwnProperty.call(cache, key) ? cache[key] : undefined;
}

async function sportsDb(name, context, deps) {
  const queries = searchQueries(name, context);
  let winner = null;
  for (const query of queries) {
    const key = `sdb:${query.toLowerCase()}`;
    let payload = cacheGet(deps.memory, key);
    if (payload === undefined) {
      try {
        payload = await fetchJson(`${SPORTSDB}/searchteams.php?t=${encodeURIComponent(query)}`, deps.fetchImpl, deps.paceSports);
        deps.memory[key] = payload;
      } catch {
        payload = null;
      }
    }
    const candidates = sportsDbCandidates(payload).map((team) => ({
      ...team,
      badge: allowedImageUrl(team.badge) ? team.badge : '',
    }));
    const picked = pickBest(name, candidates, context);
    if (!picked) continue;
    if (!winner || picked.confidence > winner.confidence) winner = picked;
    if (winner.confidence >= 0.97) break;
  }
  if (!winner?.candidate?.id) return null;
  let badge = winner.candidate.badge;
  if (!badge) {
    const key = `sdb-id:${winner.candidate.id}`;
    let payload = cacheGet(deps.memory, key);
    if (payload === undefined) {
      try {
        payload = await fetchJson(`${SPORTSDB}/lookupteam.php?id=${encodeURIComponent(winner.candidate.id)}`, deps.fetchImpl, deps.paceSports);
        deps.memory[key] = payload;
      } catch {
        payload = null;
      }
    }
    badge = sportsDbCandidates(payload)[0]?.badge || '';
  }
  if (!allowedImageUrl(badge)) return null;
  return { source: 'thesportsdb', url: badge, confidence: winner.confidence, label: winner.candidate.name };
}

async function wikidata(name, context, deps) {
  const queries = searchQueries(name, context).slice(0, 2);
  const found = [];
  for (const query of queries) {
    const key = `wd:${query.toLowerCase()}`;
    let search = cacheGet(deps.memory, key);
    if (search === undefined) {
      const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=en&format=json&type=item&limit=6&origin=*`;
      try {
        search = await fetchJson(url, deps.fetchImpl, deps.paceWiki);
        deps.memory[key] = search;
      } catch {
        search = null;
      }
    }
    const ids = (search?.search || []).map((item) => item.id).filter(Boolean).slice(0, 6);
    if (!ids.length) continue;
    const entityKey = `wde:${ids.join('|')}`;
    let entities = cacheGet(deps.memory, entityKey);
    if (entities === undefined) {
      const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids.join('|')}&props=claims|descriptions|labels|aliases&languages=en&format=json&origin=*`;
      try {
        entities = await fetchJson(url, deps.fetchImpl, deps.paceWiki);
        deps.memory[entityKey] = entities;
      } catch {
        entities = null;
      }
    }
    found.push(...wikidataCandidates(entities?.entities));
  }
  const picked = pickBest(name, found, context);
  if (!picked?.candidate?.badge || !allowedImageUrl(picked.candidate.badge)) return null;
  return { source: 'wikidata', url: picked.candidate.badge, confidence: picked.confidence, label: picked.candidate.name };
}

function wikiPages(payload) {
  const pages = payload?.query?.pages;
  if (!pages || typeof pages !== 'object') return [];
  return Object.values(pages);
}

function usableThumb(page) {
  const thumb = page?.thumbnail?.source || page?.originalimage?.source || '';
  if (!thumb || /stadium|stadion|squad|portrait|flag_of|team_photo|building|map_of|wikipedia-logo/.test(thumb.toLowerCase())) return '';
  return allowedImageUrl(thumb) ? thumb : '';
}

const PLACES = ['spain', 'ecuador', 'england', 'brazil', 'argentina', 'portugal', 'italy', 'france', 'germany', 'mexico', 'colombia', 'japan', 'russia', 'united states', 'scotland', 'wales', 'netherlands', 'belgium', 'turkey', 'greece', 'uruguay', 'chile', 'peru', 'sweden', 'norway', 'denmark', 'poland', 'ukraine', 'serbia', 'croatia', 'switzerland', 'austria', 'hungary', 'romania', 'bulgaria', 'morocco', 'egypt', 'nigeria', 'ghana', 'cameroon', 'senegal', 'south africa', 'australia', 'canada', 'ireland', 'northern ireland', 'paraguay', 'bolivia', 'venezuela', 'costa rica', 'china', 'south korea', 'czechia', 'czech republic'];

function describedPlace(description, area) {
  const text = fold(description);
  const wanted = realCountry(area);
  if (wanted && text.includes(wanted)) return wanted;
  const places = [...PLACES].sort((a, b) => b.length - a.length);
  return places.find((place) => text.includes(place)) || '';
}

function wikiScore(name, page, context) {
  const title = page?.title || '';
  const description = page?.description || page?.extract || '';
  const about = `${title} ${description}`.toLowerCase();
  if (/municipality|city in|footballer|soccer player|stadium|stadion|family name/.test(about)) return -1;
  if (!/football|soccer|futbol|futebol/.test(about) || !/club|clube|team|national/.test(about)) return -1;
  if (isNationalSide(name, context)) {
    const folded = fold(title);
    const country = coreName(name);
    if (country && folded.startsWith(country) && folded.includes('national')) return 0.93;
  }
  const similarity = pickBest(name, [{ name: title, sport: 'Soccer', country: describedPlace(description, context.area), league: '' }], context);
  return similarity ? similarity.confidence : -1;
}

async function wikipedia(name, context, deps) {
  const queries = searchQueries(name, context).slice(0, 3);
  let best = null;
  let bestScore = 0;
  for (const query of queries) {
    const key = `wiki:${query.toLowerCase()}`;
    let payload = cacheGet(deps.memory, key);
    if (payload === undefined) {
      const params = new URLSearchParams({
        action: 'query',
        generator: 'search',
        gsrsearch: `${query} football`,
        gsrlimit: '5',
        prop: 'description|pageimages',
        piprop: 'thumbnail',
        pithumbsize: '250',
        format: 'json',
        origin: '*',
      });
      try {
        payload = await fetchJson(`https://en.wikipedia.org/w/api.php?${params}`, deps.fetchImpl, deps.paceWiki);
        deps.memory[key] = payload;
      } catch {
        payload = null;
      }
    }
    for (const page of wikiPages(payload)) {
      const score = wikiScore(name, page, context);
      if (score > bestScore || (score === bestScore && score > 0 && String(page?.title || '').length < String(best?.title || '').length)) {
        bestScore = score;
        best = page;
      }
    }
    if (bestScore >= 0.97 && usableThumb(best)) break;
  }
  if (!best || bestScore < CONFIDENCE) return null;
  let source = usableThumb(best);
  if (!source && best.title) {
    const key = `sum:${best.title.toLowerCase()}`;
    let summary = cacheGet(deps.memory, key);
    if (summary === undefined) {
      const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(String(best.title).replace(/ /g, '_'))}`;
      try {
        summary = await fetchJson(url, deps.fetchImpl, deps.paceWiki);
        deps.memory[key] = summary;
      } catch {
        summary = null;
      }
    }
    source = usableThumb(summary);
  }
  if (!source) return null;
  const sized = source.split('?')[0].replace(/\/\d+px-/, '/160px-');
  return { source: 'wikipedia', url: sized, confidence: bestScore, label: best.title || name };
}

function overrideFor(team, overrides) {
  const id = team.id || teamSlug(team.name);
  if (overrides.byId[id] && allowedImageUrl(overrides.byId[id])) return overrides.byId[id];
  for (const key of indexKeys(team.name)) {
    const value = overrides.byName[key] || overrides.byName[team.name];
    if (typeof value === 'string' && allowedImageUrl(value)) return value;
  }
  return null;
}

async function keepLayer(layer, deps) {
  if (!layer) return null;
  const chosen = chooseLayer([layer]);
  if (!chosen) return null;
  if (deps.wikipediaOnly) return chosen;
  const store = deps.storeImage || storeImage;
  const file = await store(chosen.url, deps.root, deps.fetchImpl);
  return file ? { ...chosen, file } : null;
}

export async function resolveOne(team, context, deps) {
  if (deps.wikipediaOnly) return wikipedia(team.name, context, deps);
  const override = overrideFor(team, deps.overrides || { byName: {}, byId: {} });
  const fromOverride = await keepLayer(override ? { source: 'override', url: override, confidence: 1 } : null, deps);
  if (fromOverride) return fromOverride;
  const logo = providerLogo(team) || providerLogo(team.raw);
  const fromFeed = await keepLayer(logo ? { source: 'fixture', url: logo, confidence: 1 } : null, deps);
  if (fromFeed) return fromFeed;
  const fromSports = await keepLayer(await sportsDb(team.name, context, deps), deps);
  if (fromSports) return fromSports;
  const fromData = await keepLayer(await wikidata(team.name, context, deps), deps);
  if (fromData) return fromData;
  const fromWiki = await keepLayer(await wikipedia(team.name, context, deps), deps);
  if (fromWiki) return fromWiki;
  if (isNationalSide(team.name, context)) {
    const flag = flagUrl(team.name);
    const fromFlag = await keepLayer(flag ? { source: 'flag', url: flag, confidence: 0.8 } : null, deps);
    if (fromFlag) return fromFlag;
  }
  return null;
}

function remember(catalog, team, resolved) {
  const id = team.id || teamSlug(team.name);
  const keys = [looseKey(team.name), fold(team.name), teamSlug(team.name)];
  for (const key of keys) {
    if (key && !catalog.byKey[key]) catalog.byKey[key] = resolved.file;
  }
  if (!catalog.byId[id]) catalog.byId[id] = resolved.file;
  const existing = catalog.teams.find((item) => item.id === id && item.name === team.name);
  const row = {
    id,
    name: team.name,
    file: resolved.file,
    source: resolved.source,
    confidence: resolved.confidence,
    remote: resolved.url,
  };
  if (existing) Object.assign(existing, row);
  else catalog.teams.push(row);
}

function sideLogo(event, side) {
  const prefix = side === 'home' ? 'home' : 'away';
  const direct = providerLogo({
    crest: event[`${prefix}Crest`],
    logo: event[`${prefix}Logo`],
    badge: event[`${prefix}Badge`],
  });
  if (direct) return direct;
  return providerLogo(event[`${prefix}Team`] || event[`${side}Team`]);
}

export function teamsFromEvents(events) {
  const seen = new Map();
  for (const event of events || []) {
    if (!event || virtualEvent(event)) continue;
    for (const side of ['home', 'away']) {
      const name = event[side];
      if (!name) continue;
      const id = teamSlug(name);
      const key = `${id}|${event.country || ''}|${event.tournament || ''}`;
      if (seen.has(key)) continue;
      const logo = sideLogo(event, side);
      seen.set(key, {
        id,
        name,
        crest: logo,
        area: event.country || '',
        competition: event.tournament || '',
      });
    }
  }
  return [...seen.values()];
}

function virtualEvent(event) {
  const blob = `${event.country || ''} ${event.tournament || ''} ${event.home || ''} ${event.away || ''}`.toLowerCase();
  return /simulated|esoccer|e-soccer|srl|virtual league/.test(blob);
}

export function coverage(events, catalog, wikiHits) {
  const rows = (events || []).filter((event) => event?.home && event?.away && !virtualEvent(event));
  const has = (name) => indexKeys(name).some((key) => catalog.byKey[key] || catalog.byId[teamSlug(name)]);
  const both = rows.filter((event) => has(event.home) && has(event.away)).length;
  const missingTeams = new Set();
  for (const event of rows) {
    if (!has(event.home)) missingTeams.add(teamSlug(event.home));
    if (!has(event.away)) missingTeams.add(teamSlug(event.away));
  }
  let before = null;
  if (wikiHits) {
    const wikiBoth = rows.filter((event) => wikiHits[event.home] && wikiHits[event.away]).length;
    before = { both: wikiBoth, percent: rows.length ? Number(((100 * wikiBoth) / rows.length).toFixed(1)) : 0 };
  }
  const sources = {};
  for (const team of catalog.teams || []) sources[team.source] = (sources[team.source] || 0) + 1;
  return {
    fixtures: rows.length,
    before,
    after: { both, percent: rows.length ? Number(((100 * both) / rows.length).toFixed(1)) : 0 },
    missingTeams: missingTeams.size,
    sources,
  };
}

function inWindow(event, fromDay, toDay) {
  const day = String(event?.kickoff || '').slice(0, 10);
  if (!day) return false;
  if (fromDay && day < fromDay) return false;
  if (toDay && day > toDay) return false;
  return true;
}

export function createResolver(options = {}) {
  const root = options.root || process.cwd();
  const deps = {
    root,
    fetchImpl: options.fetchImpl || fetch,
    memory: options.memory || {},
    overrides: options.overrides || loadOverrides(root),
    paceSports: options.paceSports || pacer(options.sportsGap ?? SPORTS_GAP_MS),
    paceWiki: options.paceWiki || pacer(options.wikiGap ?? WIKI_GAP_MS),
    wikipediaOnly: false,
  };
  return { deps, root };
}

export async function resolveTeams(teams, options = {}) {
  const { deps, root } = createResolver(options);
  const catalog = options.catalog || loadCatalog(root);
  const limit = options.limit ?? teams.length;
  let done = 0;
  let cursor = 0;
  const missing = [];
  const resolvedNames = [];
  const pool = Math.max(1, options.workers || 1);
  async function worker() {
    while (cursor < teams.length && done < limit) {
      const team = teams[cursor];
      cursor += 1;
      const id = team.id || teamSlug(team.name);
      if (!options.refresh && (catalog.byId[id] || catalog.byKey[looseKey(team.name)])) continue;
      deps.wikipediaOnly = Boolean(options.wikipediaOnly);
      const context = { area: team.area, competition: team.competition };
      let resolved = null;
      try {
        resolved = await resolveOne(team, context, deps);
      } catch (error) {
        missing.push({ name: team.name, id: team.id, area: team.area, competition: team.competition, reason: error instanceof Error ? error.message : 'lookup failed' });
        done += 1;
        continue;
      }
      done += 1;
      if (!resolved?.file && !options.wikipediaOnly) {
        missing.push({ name: team.name, id: team.id, area: team.area || '', competition: team.competition || '', reason: 'no confident crest' });
        if (options.onTeam) options.onTeam(team, null);
        continue;
      }
      if (resolved?.file) {
        remember(catalog, team, resolved);
        resolvedNames.push(`${team.name}|${team.area || ''}`);
      }
      if (options.onTeam) options.onTeam(team, resolved);
      if (done % 20 === 0) saveCatalog(catalog, root);
    }
  }
  await Promise.all(Array.from({ length: Math.min(pool, teams.length || 1) }, () => worker()));
  if (!options.wikipediaOnly) {
    saveCatalog(catalog, root);
    saveMissing(missing, root, resolvedNames);
  }
  return { catalog, missing, checked: done };
}

export async function measureWikipedia(teams, options = {}) {
  const { deps } = createResolver(options);
  deps.wikipediaOnly = true;
  const hits = {};
  let cursor = 0;
  const workers = Math.max(1, options.workers || 2);
  async function run() {
    while (cursor < teams.length) {
      const team = teams[cursor];
      cursor += 1;
      try {
        const resolved = await resolveOne(team, { area: team.area, competition: team.competition }, deps);
        if (resolved?.url) hits[team.name] = true;
      } catch {
        /* a missed page stays an initials circle in the before count */
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(workers, teams.length) }, () => run()));
  return hits;
}

let running = null;

export async function syncFixtureCrests(events, options = {}) {
  const fromDay = options.fromDay;
  const toDay = options.toDay;
  const list = teamsFromEvents((events || []).filter((event) => (fromDay || toDay ? inWindow(event, fromDay, toDay) : true)));
  if (!list.length) return loadCatalog(options.root);
  if (running) return running;
  running = resolveTeams(list, { ...options, limit: options.limit ?? 24 })
    .then((result) => result.catalog)
    .finally(() => {
      running = null;
    });
  return running;
}
