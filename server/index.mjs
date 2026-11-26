import { createHash } from 'node:crypto';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { encodePayload, etagMatches, NOT_LIVE_RETRY_SECONDS, publicCacheControl, staticCacheControl, takeRequest, clientIp } from './bandwidth.mjs';
import { hasSession } from './adminAuth.mjs';
import { handleAdminApi, handleAdminPage } from './adminHttp.mjs';
import { latestBooking, submitBooking } from './booking.mjs';
import { forceLiveMode, getConfig } from './config.mjs';
import { appEngineState, engineNeedsRepair, enginePersistence, getCachedEvents, getEngineRaw, getEngineSchedule, getEngineState, getEventOccurrence, onEngineBoard, onEngineCycle, paintEngineCrests, restartEngineIfHung, restoreEngine, runEngineCycle, startEngine } from './engine.mjs';
import { crestSurfaces } from './crestSurfaces.mjs';
import { attachGuardian, createGuardian, noteRequest } from './guardian.mjs';
import { gzippedBytes } from './guardianChecks.mjs';
import { diskBreakdown, readDiskUsage, readIncidents, relieveDisk } from './guardianOps.mjs';
import { bookAll } from './bookers.mjs';
import { requestJson } from './curl-request.mjs';
import { legOpen, priceInRange } from './oddsRange.mjs';
import { createClient, filterByRange, providerDates } from './football.mjs';
import { countryForRequest } from './geo.mjs';
import { fcmConfigured, pruneStaleDevices, sendTestPush, startPushWatch } from './push.mjs';
import { deletePromo, listPromos, promoPng, publicPromos, syncPromos } from './promo/service.mjs';
import { bookGroups } from './bookOnDemand.mjs';
import { slimLivePayload } from './liveSlim.mjs';
import { crestStore, scheduleNightly } from './crestStore.mjs';
import { createResults } from './results.mjs';
import { createLineups, lineupNote, lineupWanted } from './lineups.mjs';
import { bankerNote, bankerWanted, createBanker } from './banker.mjs';
import { flattenPrematch, loadUpcomingEvents } from './upcoming.mjs';
import { loadMarketRules } from './marketRules.mjs';
import { installDiskGuard } from './safeWrite.mjs';
import { cachedMatchInsight } from './matchInsight.mjs';
import { readEntitlements, rememberEntitlement, verifyPlayPurchase, writeEntitlements } from './proBilling.mjs';
installDiskGuard();
loadMarketRules();

const dataDir = process.env.ENGINE_DATA_DIR || join(process.cwd(), 'data', 'engine');
const diskRelief = relieveDisk(dataDir);
{
  const beforePct = diskRelief.before.total ? Math.round((100 * (diskRelief.before.total - diskRelief.before.free)) / diskRelief.before.total) : 0;
  const after = readDiskUsage(dataDir);
  const afterPct = after.total ? Math.round((100 * (after.total - after.free)) / after.total) : beforePct;
  const biggest = (diskRelief.largest.length ? diskRelief.largest : diskBreakdown(dataDir)).slice(0, 8).map((row) => `${row.name} ${Math.round(row.bytes / (1024 * 1024))}MB`).join(', ');
  console.log(`[disk] ${beforePct}% full before cleanup (${biggest || 'no files'}). Removed ${diskRelief.removed.length} cache files, ${Math.round(diskRelief.freed / (1024 * 1024))}MB. Now ${afterPct}% full, ${Math.round((after.free || 0) / (1024 * 1024))}MB free.`);
}

function diskHealth() {
  const usage = readDiskUsage(dataDir);
  const total = Number(usage.total) || 0;
  const free = Number(usage.free) || 0;
  return {
    usedPct: total ? Math.round((100 * (total - free)) / total) : null,
    freeMb: Math.round(free / (1024 * 1024)),
    totalMb: Math.round(total / (1024 * 1024)),
  };
}
const results = createResults({
  dir: dataDir,
  crestFor: (id, name) => crests.crestFor(id, name) || null,
});
onEngineBoard((state) => results.ingest(state));

async function tinySelfTest() {
  let parsed = false;
  try {
    const view = JSON.parse(JSON.stringify(engineView()));
    parsed = Boolean(view && typeof view === 'object' && ('master' in view || Array.isArray(view.tiers)));
  } catch {
    parsed = false;
  }
  const raw = getEngineRaw();
  const pool = [...(raw?.legs || []), ...(raw?.master?.legs || [])];
  const leg = pool.find((item) => legOpen(item) && priceInRange(item?.market, item?.odds, item));
  if (!leg) return { ok: parsed, message: parsed ? 'App view parses. No open leg for a desk test.' : 'App view did not parse.' };
  const books = await bookAll([leg], requestJson);
  const coded = Object.entries(books || {}).filter(([, book]) => (book?.parts || []).some((part) => part?.code)).map(([desk]) => desk);
  return { ok: parsed, message: `Desk test ${coded.length ? `booked ${coded.join(', ')}` : 'returned no code'}. App view ${parsed ? 'parses' : 'failed'}.` };
}
forceLiveMode();
const crests = crestStore();
scheduleNightly(async () => {
  try {
    crests.prewarm(await loadUpcomingEvents(), { days: 7 });
  } catch (error) {
    console.error(`[crests] Nightly pre-warm failed: ${error instanceof Error ? error.message : error}`);
  }
});
function engineView() {
  const full = getEngineState();
  return paintEngineCrests(appEngineState(full), full?.events || getCachedEvents(), (id, name) => crests.crestFor(id, name) || '');
}

onEngineCycle(() => {
  try {
    const extra = [];
    for (const row of Object.values(banker?.state?.codes || {})) {
      for (const leg of row.legs || []) {
        extra.push({
          home: leg.home,
          away: leg.away,
          homeId: leg.homeId,
          awayId: leg.awayId,
          kickoff: leg.kickMs ? new Date(leg.kickMs).toISOString() : new Date().toISOString(),
          country: '',
          tournament: '',
        });
      }
    }
    crests.prewarm([...getCachedEvents(), ...extra], { days: 2 });
  } catch {
    /* the nightly pass still runs */
  }
});

/** Board, search and live rows carry our own crest URL for each side. */
function withCrests(events) {
  crests.remember(events);
  return events.map((event) => {
    const homeCrest = crests.crestFor(event.homeId, event.home);
    const awayCrest = crests.crestFor(event.awayId, event.away);
    return homeCrest || awayCrest ? { ...event, homeCrest: homeCrest || undefined, awayCrest: awayCrest || undefined } : event;
  });
}

const pushWatch = startPushWatch();
let prunedTokens = 0;
const guardian = createGuardian({
  dir: join(dataDir, 'health'),
  dataDir,
  getState: getEngineState,
  getRaw: getEngineRaw,
  booking: () => Boolean(getEngineSchedule().running),
  persistence: enginePersistence,
  needsRepair: engineNeedsRepair,
  runCycle: runEngineCycle,
  restore: restoreEngine,
  fcm: fcmConfigured,
  mode: () => getConfig().mode,
  forceLive: () => forceLiveMode(),
  restartHung: restartEngineIfHung,
  selfTest: tinySelfTest,
  deviceCount: () => pushWatch.book.list().length,
  push: () => ({ ...pushWatch.stats(), pruned: prunedTokens }),
  crests: () => {
    const cover = crests.coverage({ hours: 48 });
    const look = (id, name) => crests.crestFor(id, name) || '';
    try {
      cover.surfaces = crestSurfaces({
        events: getCachedEvents(),
        engine: getEngineState(),
        codes: banker?.view?.() || null,
        crestFor: look,
      });
    } catch {
      cover.surfaces = [];
    }
    return cover;
  },
  healCrests: () => crests.healMisses({ hours: 48 }),
  payloadBytes: () => gzippedBytes(engineView()),
  pruneDevices: async () => {
    prunedTokens = pruneStaleDevices(pushWatch.book);
    return prunedTokens;
  },
  prunePromos: async () => {
    const cutoff = Date.now() - 21 * 86_400_000;
    let removed = 0;
    for (const item of listPromos().items || []) {
      const at = Date.parse(item.createdAt || '');
      if (Number.isFinite(at) && at < cutoff && deletePromo(item.id)) removed += 1;
    }
    return removed;
  },
  probe: async () => {
    const started = Date.now();
    const state = getEngineState();
    return [{ path: '/api/engine', ms: Date.now() - started, ok: Boolean(state) && typeof state.eventCount === 'number' && 'master' in state }];
  },
});
attachGuardian(guardian);
onEngineCycle(() => guardian.check());
const pushBook = pushWatch.book;
const lineups = createLineups({
  dir: dataDir,
  crestFor: (id, name) => crests.crestFor(id, name) || '',
});
async function publishLineups(events) {
  let fresh = [];
  try {
    fresh = await lineups.scan(events);
  } catch (error) {
    console.error(`[lineups] ${error instanceof Error ? error.message : error}`);
    return;
  }
  for (const announcement of fresh) {
    for (const device of pushBook.list()) {
      if (!lineupWanted(device, announcement)) continue;
      await pushWatch.post(lineupNote(announcement, device), device);
    }
  }
}
onEngineBoard(() => {
  void publishLineups(getCachedEvents());
});
const banker = createBanker({
  dir: dataDir,
  request: requestJson,
  fetchImpl: fetch,
  results,
  coverage: () => getCachedEvents(),
  crestFor: (id, name) => crests.crestFor(id, name) || '',
});
async function publishCodes(forceRead = false) {
  try {
    if (forceRead) await banker.refresh();
    else await banker.tick();
    for (const alert of banker.drain()) {
      for (const device of pushBook.list()) {
        if (!bankerWanted(device, alert)) continue;
        await pushWatch.post(bankerNote(alert), device);
      }
    }
  } catch (error) {
    console.error(`[codes] ${error instanceof Error ? error.message : error}`);
  }
}
const pushAlerts = pushWatch.alerts;
const config = getConfig();
const dist = join(process.cwd(), 'dist');
const PUBLIC_SITE = 'https://betspapa.com';
const port = Number(process.env.PORT) || 8787;
const cache = new Map();

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
};

function send(req, res, status, body, cacheControl, extraHeaders = {}) {
  const startedAt = Date.now();
  const path = String(req?.url || '/').split('?')[0];
  const json = JSON.stringify(body);
  const etag = `"${createHash('sha1').update(json).digest('hex')}"`;
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': cacheControl || ((req?.method || 'GET') === 'GET' ? publicCacheControl(path, status) : 'private, no-store'),
    ETag: etag,
    'Access-Control-Allow-Origin': '*',
    Vary: 'Accept-Encoding',
    ...extraHeaders,
  };
  if ((status === 200 || status === 409) && etagMatches(req?.headers?.['if-none-match'], etag)) {
    headers['Content-Length'] = 0;
    res.writeHead(304, headers);
    res.end();
    noteRequest(path, Date.now() - startedAt, 0);
    return;
  }
  let payload = Buffer.from(json);
  const encoded = status === 200 ? encodePayload(payload, req?.headers?.['accept-encoding']) : { body: payload, encoding: '' };
  payload = encoded.body;
  if (encoded.encoding) headers['Content-Encoding'] = encoded.encoding;
  headers['Content-Length'] = payload.length;
  res.writeHead(status, headers);
  res.end(payload);
  noteRequest(path, Date.now() - startedAt, payload.length);
}

function sendNotLive(req, res, error) {
  send(req, res, 409, { error }, `public, max-age=${NOT_LIVE_RETRY_SECONDS}`, { 'Retry-After': String(NOT_LIVE_RETRY_SECONDS) });
}

async function cached(key, ttl, fn) {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = await fn();
  cache.set(key, { value, expires: Date.now() + ttl });
  return value;
}

async function loadInPlay() {
  return cached('inplay-football', 20_000, async () => {
    const response = await fetch(
      'https://www.sportybet.com/api/gh/factsCenter/liveOrPrematchEvents?sportId=sr%3Asport%3A1',
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
          Referer: 'https://www.sportybet.com/gh/sport/football',
        },
        signal: AbortSignal.timeout(45_000),
      },
    );
    if (!response.ok) throw new Error(`In-play scores returned ${response.status}`);
    return response.json();
  });
}

function withOccurrence(events) {
  const table = getEventOccurrence();
  return events.map((event) => {
    const rows = table?.[event.eventId];
    return Array.isArray(rows) && rows.length ? { ...event, occurrence: rows } : event;
  });
}

function client() {
  return createClient({ token: config.token });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 256_000) {
        reject(new Error('Booking request is too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Booking request must be JSON.'));
      }
    });
    req.on('error', reject);
  });
}

async function handleApi(req, res, url) {
  if (req.method === 'GET') {
    const limit = takeRequest(clientIp(req), url.pathname);
    if (limit.limited) {
      send(req, res, 429, { error: 'Slow down.' }, 'private, no-store', { 'Retry-After': String(limit.retryAfter) });
      return;
    }
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end();
    return;
  }
  if (url.pathname === '/api/book') {
    if (req.method === 'GET') {
      send(req, res, 200, latestBooking());
      return;
    }
    if (req.method !== 'POST') {
      send(req, res, 405, { error: 'Method not allowed' });
      return;
    }
    try {
      const body = await readJson(req);
      if (Array.isArray(body.groups)) {
        const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'local').split(',')[0].trim();
        const { requestJson } = await import('./curl-request.mjs');
        send(req, res, 200, await bookGroups(body.groups, requestJson, new Date(), ip));
        return;
      }
      send(req, res, 200, submitBooking(body.legs));
    } catch (error) {
      send(req, res, error.status === 429 ? 429 : 400, { error: error.message || 'Invalid booking request' });
    }
    return;
  }
  if (url.pathname.startsWith('/api/admin/')) {
    await handleAdminApi(req, res, url, { book: pushBook, alerts: pushAlerts, fcm: fcmConfigured, crests });
    return;
  }
  if (url.pathname === '/api/devices/test') {
    if (req.method !== 'POST') {
      send(req, res, 405, { error: 'Method not allowed' });
      return;
    }
    const engineToken = process.env.ENGINE_RUN_TOKEN || '';
    const engineAuth = Boolean(engineToken) && req.headers.authorization === `Bearer ${engineToken}`;
    if (!engineAuth && !hasSession(req)) {
      send(req, res, 401, { error: 'Admin session required.' });
      return;
    }
    try {
      const body = await readJson(req);
      const result = await sendTestPush(pushBook, body, (message) => console.log(message));
      if (result.error) {
        send(req, res, result.status, { error: result.error, fcm: result.fcm || null });
        return;
      }
      send(req, res, 200, { ok: true, fcm: result.fcm });
    } catch (error) {
      send(req, res, 400, { error: error.message || 'Invalid test push' });
    }
    return;
  }
  if (url.pathname === '/api/devices') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }
    if (req.method !== 'POST') {
      send(req, res, 405, { error: 'Method not allowed' });
      return;
    }
    try {
      const body = await readJson(req);
      const country = await countryForRequest(req);
      const result = pushBook.register(body, { country });
      if (result.error) {
        send(req, res, 400, { error: result.error });
        return;
      }
      const data = JSON.stringify(result);
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
        'Content-Length': Buffer.byteLength(data),
      });
      res.end(data);
    } catch (error) {
      send(req, res, 400, { error: error.message || 'Invalid device registration' });
    }
    return;
  }
  if (url.pathname === '/api/engine/run') {
    if (req.method !== 'POST') {
      send(req, res, 405, { error: 'Method not allowed' });
      return;
    }
    const token = process.env.ENGINE_RUN_TOKEN || '';
    if (!token || req.headers.authorization !== `Bearer ${token}`) {
      send(req, res, 401, { error: 'Engine run is not authorized.' });
      return;
    }
    try {
      send(req, res, 200, await runEngineCycle());
    } catch (error) {
      console.error(`[engine] Cycle failed: ${error.message || error}`);
      send(req, res, 500, { error: error.message || 'Engine cycle failed' });
    }
    return;
  }
  // Codes read back with POST, so the route sits above the GET-only guard.
  if (url.pathname === '/api/codes') {
    if (req.method === 'GET') {
      send(req, res, 200, banker.view(), 'public, max-age=30');
      return;
    }
    if (req.method === 'POST') {
      const limit = takeRequest(clientIp(req), url.pathname);
      if (limit.limited) {
        send(req, res, 429, { error: 'Slow down.' }, 'private, no-store', { 'Retry-After': String(limit.retryAfter) });
        return;
      }
      send(req, res, 200, await banker.refresh(), 'no-store');
      for (const alert of banker.drain()) {
        for (const device of pushBook.list()) {
          if (!bankerWanted(device, alert)) continue;
          await pushWatch.post(bankerNote(alert), device);
        }
      }
      return;
    }
    send(req, res, 405, { error: 'Method not allowed' });
    return;
  }
  if (req.method !== 'GET') {
    send(req, res, 405, { error: 'Method not allowed' });
    return;
  }
  const promoFile = url.pathname.match(/^\/api\/promos\/(.+)\.png$/);
  if (promoFile) {
    const png = promoPng(decodeURIComponent(promoFile[1]));
    if (!png) {
      send(req, res, 404, { error: 'Promo art was not found.' });
      return;
    }
    res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=300', 'Content-Length': png.length });
    res.end(png);
    return;
  }
  if (url.pathname === '/api/promos') {
    const origin = `${req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http'}://${req.headers.host || 'localhost'}`;
    send(req, res, 200, { promos: publicPromos(origin) });
    return;
  }
  if (url.pathname === '/api/health/full') {
    if (!hasSession(req)) {
      send(req, res, 401, { error: 'Admin session required.' });
      return;
    }
    send(req, res, 200, guardian.status());
    return;
  }
  if (url.pathname === '/api/health') {
    const live = getConfig();
    const watch = guardian.status();
    send(req, res, 200, {
      ok: true,
      mode: live.mode,
      provider: live.provider,
      fixtures: 'live',
      push: fcmConfigured(),
      guardian: watch.ok ? 'ok' : 'attention',
      reason: watch.reason,
      devices: watch.devices,
      checks: watch.checks,
      disk: diskHealth(),
    });
    return;
  }
  if (url.pathname === '/api/guardian/incidents') {
    send(req, res, 200, { incidents: readIncidents(dataDir) });
    return;
  }
  if (url.pathname === '/api/guardian') {
    if (String(getConfig().mode) !== 'live') forceLiveMode();
    send(req, res, 200, guardian.status());
    return;
  }
  if (url.pathname === '/api/lineups') {
    if (req.method !== 'GET') {
      send(req, res, 405, { error: 'Method not allowed' });
      return;
    }
    send(req, res, 200, { lineups: lineups.list() }, 'public, max-age=30');
    return;
  }
  if (url.pathname === '/api/results') {
    if (req.method !== 'GET') {
      send(req, res, 405, { error: 'Method not allowed' });
      return;
    }
    send(req, res, 200, results.view(url.searchParams.get('day') || ''), 'public, max-age=15');
    return;
  }
  if (url.pathname === '/api/engine') {
    if (req.method !== 'GET') {
      send(req, res, 405, { error: 'Method not allowed' });
      return;
    }
    const full = getEngineState();
    send(req, res, 200, url.searchParams.get('view') === 'app' ? engineView() : full);
    return;
  }
  if (url.pathname === '/api/config') {
    send(req, res, 200, {
      mode: 'sporty',
      provider: 'Betspapa fixtures',
      pollMs: 120000,
      reason: null,
    });
    return;
  }
  if (url.pathname === '/api/pro/verify') {
    if (req.method !== 'POST') {
      send(req, res, 405, { error: 'Method not allowed' });
      return;
    }
    const limit = takeRequest(clientIp(req), url.pathname);
    if (limit.limited) {
      send(req, res, 429, { error: 'Slow down.' }, 'private, no-store', { 'Retry-After': String(limit.retryAfter) });
      return;
    }
    try {
      const body = await readJson(req);
      const result = await verifyPlayPurchase({
        productId: String(body?.productId || ''),
        purchaseToken: String(body?.purchaseToken || ''),
      });
      if (result.store) {
        const file = join(dataDir, 'pro-entitlements.json');
        const book = rememberEntitlement(readEntitlements(file), result.store);
        writeEntitlements(file, book);
      }
      send(req, res, result.status, result.body, 'private, no-store');
    } catch (error) {
      send(req, res, 400, { entitled: false, error: error instanceof Error ? error.message : 'Purchase could not be checked.' });
    }
    return;
  }
  if (url.pathname === '/api/match-insight') {
    const id = url.searchParams.get('id') || '';
    if (!/^(sr:match:)?\d+$/.test(id)) {
      send(req, res, 400, { error: 'id must be a match id.' });
      return;
    }
    try {
      send(req, res, 200, await cachedMatchInsight(id), 'public, max-age=30');
    } catch (error) {
      send(req, res, 502, { error: error.message || 'Match facts failed' });
    }
    return;
  }
  if (url.pathname === '/api/live') {
    try {
      const events = await loadInPlay();
      send(req, res, 200, slimLivePayload(events, (id, name) => crests.crestFor(id, name)), 'public, max-age=20');
    } catch (error) {
      send(req, res, 502, { error: error.message || 'In-play scores failed' });
    }
    return;
  }
  if (url.pathname === '/api/sportybet/upcoming') {
    // Public fixture feed the Android app reads directly. Real fixtures only.
    try {
      const events = await loadUpcomingEvents({ force: url.searchParams.get('force') === '1' });
      const decorated = withCrests(withOccurrence(events));
      send(req, res, 200, { source: 'betspapa', generatedAt: new Date().toISOString(), count: decorated.length, events: decorated }, 'public, max-age=60');
    } catch (error) {
      send(req, res, 502, { error: error.message || 'Fixture feed failed' });
    }
    return;
  }
  if (url.pathname === '/api/fixtures') {
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    if (!from || !to || Number.isNaN(new Date(from).getTime()) || Number.isNaN(new Date(to).getTime())) {
      send(req, res, 400, { error: 'from and to must be ISO timestamps.' });
      return;
    }
    try {
      const events = await loadUpcomingEvents().catch((error) => {
        const saved = getCachedEvents();
        if (saved.length) {
          console.error(`[fixtures] Fixture catalogue failed: ${error.message}. Serving ${saved.length} cached events.`);
          return saved;
        }
        throw error;
      });
      const fromMs = new Date(from).getTime();
      const toMs = new Date(to).getTime();
      const filtered = events.filter((event) => {
        const kick = new Date(event.kickoff).getTime();
        return kick >= fromMs && kick <= toMs;
      });
      const seen = new Set(filtered.map((event) => event.eventId));
      try {
        const live = flattenPrematch(await loadInPlay());
        for (const event of live) {
          const kick = new Date(event.kickoff).getTime();
          if (!event.eventId || seen.has(event.eventId) || kick < fromMs || kick > toMs) continue;
          filtered.push(event);
          seen.add(event.eventId);
        }
      } catch (error) {
        console.error(`[fixtures] In-play list was not merged: ${error instanceof Error ? error.message : error}`);
      }
      send(req, res, 200, { source: 'betspapa', events: withCrests(withOccurrence(filtered)) }, 'public, max-age=60');
    } catch (error) {
      send(req, res, 502, { error: error.message || 'Fixture feed failed' });
    }
    return;
  }
  if (getConfig().mode !== 'live') {
    forceLiveMode();
  }
  if (getConfig().mode !== 'live') {
    sendNotLive(req, res, 'Not live.');
    return;
  }
  if (url.pathname.startsWith('/api/matches') && !config.footballData) {
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const dates = from && to ? providerDates(from, to) : null;
    const saved = dates ? cache.get(`list:${dates.dateFrom}:${dates.dateTo}`) : null;
    if (saved && Array.isArray(saved.value)) {
      send(req, res, 200, { matches: saved.value, stale: true }, 'public, max-age=60');
      return;
    }
    sendNotLive(req, res, 'Not live.');
    return;
  }

  try {
    if (url.pathname === '/api/matches') {
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      const dates = from && to ? providerDates(from, to) : null;
      if (!dates) {
        send(req, res, 400, { error: 'from and to must be ISO timestamps.' });
        return;
      }
      const all = await cached(`list:${dates.dateFrom}:${dates.dateTo}`, 15_000, () => client().matches(dates.dateFrom, dates.dateTo));
      const matches = filterByRange(all, from, to).sort((a, b) => a.utcDate.localeCompare(b.utcDate));
      send(req, res, 200, { matches });
      return;
    }
    const detail = url.pathname.match(/^\/api\/matches\/([^/]+)$/);
    if (detail) {
      const id = decodeURIComponent(detail[1]);
      const match = await cached(`match:${id}`, 12_000, () => client().match(id));
      send(req, res, 200, { match });
      return;
    }
    send(req, res, 404, { error: 'Not found' });
  } catch (error) {
    const status = error.status === 429 ? 429 : error.status === 400 ? 400 : 502;
    send(req, res, status, { error: error.message || 'football-data.org request failed' });
  }
}

function publicAsset(requested) {
  const allowed = requested === '/favicon.svg'
    || requested === '/manifest.webmanifest'
    || requested.startsWith('/bookies/')
    || requested.startsWith('/crests/')
    || requested.startsWith('/icons/');
  if (!allowed) return '';
  const root = join(process.cwd(), 'public');
  const file = normalize(join(root, requested));
  if (file !== root && !file.startsWith(root + sep)) return '';
  if (!existsSync(file) || statSync(file).isDirectory()) return '';
  return file;
}

function streamFile(res, file, requested) {
  const ext = extname(file);
  const hashed = requested.startsWith('/assets/');
  const frozen = staticCacheControl(requested);
  res.writeHead(200, {
    'Content-Type': TYPES[ext] || 'application/octet-stream',
    'Cache-Control': frozen || (hashed ? 'public, max-age=31536000, immutable' : ext === '.html' ? 'no-cache' : 'public, max-age=3600'),
  });
  createReadStream(file).pipe(res);
}

function isStaticPath(pathname) {
  return pathname === '/favicon.svg'
    || pathname === '/favicon.ico'
    || pathname === '/manifest.webmanifest'
    || pathname === '/sw.js'
    || pathname.startsWith('/bookies/')
    || pathname.startsWith('/crests/')
    || pathname.startsWith('/icons/')
    || pathname.startsWith('/assets/')
    || pathname.startsWith('/sounds/')
    || extname(pathname) !== '';
}

function redirectToSite(res) {
  res.writeHead(302, {
    Location: PUBLIC_SITE,
    'Cache-Control': 'no-store',
    'Content-Length': 0,
  });
  res.end();
}

function serveCrest(req, res, pathname) {
  if (pathname === '/crests/id/index.json') {
    send(req, res, 200, crests.publicList(), 'public, max-age=300');
    return true;
  }
  const match = pathname.match(/^\/crests\/id\/(\d{1,12})\.png$/);
  if (!match) return false;
  const file = crests.imagePath(match[1]);
  if (!file) {
    res.writeHead(404, { 'Cache-Control': 'no-store', 'Content-Length': 9, 'Access-Control-Allow-Origin': '*' });
    res.end('Not found');
    return true;
  }
  const size = statSync(file).size;
  res.writeHead(200, {
    'Content-Type': 'image/png',
    'Content-Length': size,
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Access-Control-Allow-Origin': '*',
  });
  if (req.method === 'HEAD') res.end();
  else createReadStream(file).pipe(res);
  noteRequest('/crests/id', 0, size);
  return true;
}

function serveStatic(req, res, url) {
  const requested = decodeURIComponent(url.pathname);
  if (requested.startsWith('/crests/id/') && serveCrest(req, res, requested)) return;
  const bundled = publicAsset(requested);
  if (bundled) {
    streamFile(res, bundled, requested);
    return;
  }
  if (!existsSync(dist)) {
    if (isStaticPath(requested)) {
      res.writeHead(404, { 'Cache-Control': 'no-store', 'Content-Length': 9 });
      res.end('Not found');
      return;
    }
    redirectToSite(res);
    return;
  }
  const safe = normalize(requested).replace(/^(\.\.[/\\])+/, '');
  let file = join(dist, safe);
  if (!file.startsWith(dist)) {
    res.writeHead(400);
    res.end('Bad path');
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) {
    if (extname(safe)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    file = join(dist, 'index.html');
  }
  streamFile(res, file, requested);
}

async function onRequest(req, res) {
  const url = new URL(req.url || '/', 'http://localhost');
  try {
    if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) {
      await handleAdminPage(req, res, url);
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }
    serveStatic(req, res, url);
  } catch (error) {
    console.error(`[http] ${error instanceof Error ? error.message : error}`);
    if (!res.headersSent) send(req, res, 500, { error: 'Request failed' });
  }
}

export function createBetspapaServer() {
  return createServer((req, res) => {
    void onRequest(req, res);
  });
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) {
  const server = createBetspapaServer();
  restoreEngine().finally(() => {
  try {
    results.ingest(getEngineRaw());
  } catch (error) {
    console.error(`[results] Could not record the board already in memory: ${error instanceof Error ? error.message : error}`);
  }
  void results.settle();
  const settleTimer = setInterval(() => {
    void results.settle();
  }, 3 * 60 * 1000);
  settleTimer.unref?.();
  const lineupTimer = setInterval(() => {
    void publishLineups(getCachedEvents());
  }, 2 * 60 * 1000);
  lineupTimer.unref?.();
  void publishLineups(getCachedEvents());
  const codeTimer = setInterval(() => {
    void publishCodes(false);
  }, 60 * 1000);
  codeTimer.unref?.();
  void publishCodes(false);
  server.listen(port, '0.0.0.0', () => {
    console.log(`Betspapa listening on http://0.0.0.0:${port} (fixtures: live catalogue)`);
    loadUpcomingEvents()
      .then((events) => console.log(`[fixtures] Warm cache: ${events.length} real fixtures.`))
      .catch((error) => console.error(`[fixtures] Warm-up failed: ${error.message}`));
  startEngine();
  guardian.start();
  pushWatch.start();
  const promoTimer = setInterval(() => {
    syncPromos({ engine: getEngineState(), events: getCachedEvents(), book: pushBook, origin: `http://127.0.0.1:${port}` }).catch((error) => {
      console.error(`[promo] ${error instanceof Error ? error.message : error}`);
    });
  }, 60_000);
  promoTimer.unref?.();
});
  });
}
