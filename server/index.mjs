import { createHash } from 'node:crypto';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { hasSession } from './adminAuth.mjs';
import { handleAdminApi, handleAdminPage } from './adminHttp.mjs';
import { latestBooking, submitBooking } from './booking.mjs';
import { getConfig } from './config.mjs';
import { engineNeedsRepair, getCachedEvents, getEngineSchedule, getEngineState, getEventOccurrence, restoreEngine, runEngineCycle, startEngine } from './engine.mjs';
import { attachGuardian, createGuardian, noteRequest } from './guardian.mjs';
import { createClient, filterByRange, providerDates } from './football.mjs';
import { countryForRequest } from './geo.mjs';
import { fcmConfigured, sendTestPush, startPushWatch } from './push.mjs';
import { deletePromo, listPromos, promoPng, publicPromos, syncPromos } from './promo/service.mjs';
import { bookGroups } from './bookOnDemand.mjs';
import { slimLivePayload } from './liveSlim.mjs';
import { loadUpcomingEvents } from './upcoming.mjs';

const pushWatch = startPushWatch();
const guardian = createGuardian({
  dir: join(process.env.ENGINE_DATA_DIR || join(process.cwd(), 'data', 'engine'), 'health'),
  getState: getEngineState,
  booking: () => Boolean(getEngineSchedule().running),
  needsRepair: engineNeedsRepair,
  runCycle: runEngineCycle,
  restore: restoreEngine,
  fcm: fcmConfigured,
  pruneDevices: async () => {
    let removed = 0;
    for (const device of pushWatch.book.list()) {
      if (String(device?.token || '').trim().length < 20) {
        pushWatch.book.drop(device.token);
        removed += 1;
      }
    }
    return removed;
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
const pushBook = pushWatch.book;
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

function send(req, res, status, body, cacheControl = 'private, no-cache') {
  const startedAt = Date.now();
  const json = JSON.stringify(body);
  const etag = `"${createHash('sha1').update(json).digest('hex')}"`;
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': cacheControl,
    ETag: etag,
    'Access-Control-Allow-Origin': '*',
    Vary: 'Accept-Encoding',
  };
  if (status === 200 && req?.headers?.['if-none-match'] === etag) {
    res.writeHead(304, headers);
    res.end();
    return;
  }
  let payload = Buffer.from(json);
  if (status === 200 && payload.length > 800 && /\bgzip\b/.test(String(req?.headers?.['accept-encoding'] || ''))) {
    payload = gzipSync(payload);
    headers['Content-Encoding'] = 'gzip';
  }
  headers['Content-Length'] = payload.length;
  res.writeHead(status, headers);
  res.end(payload);
  noteRequest(String(req?.url || '/').split('?')[0], Date.now() - startedAt, payload.length);
}

async function cached(key, ttl, fn) {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = await fn();
  cache.set(key, { value, expires: Date.now() + ttl });
  return value;
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
    await handleAdminApi(req, res, url, { book: pushBook, alerts: pushAlerts, fcm: fcmConfigured });
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
    const watch = guardian.status();
    send(req, res, 200, { ok: true, mode: config.mode, fixtures: 'live', push: fcmConfigured(), guardian: watch.ok ? 'ok' : 'attention' });
    return;
  }
  if (url.pathname === '/api/engine') {
    if (req.method !== 'GET') {
      send(req, res, 405, { error: 'Method not allowed' });
      return;
    }
    send(req, res, 200, getEngineState());
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
  if (url.pathname === '/api/live') {
    try {
      const events = await cached('inplay-football', 20_000, async () => {
        const response = await fetch(
          'https://www.sportybet.com/api/gh/factsCenter/liveOrPrematchEvents?sportId=sr%3Asport%3A1',
          {
            headers: {
              Accept: 'application/json',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
              Referer: 'https://www.sportybet.com/gh/sport/football',
            },
            signal: AbortSignal.timeout(20_000),
          },
        );
        if (!response.ok) throw new Error(`In-play scores returned ${response.status}`);
        return response.json();
      });
      send(req, res, 200, slimLivePayload(events), 'public, max-age=20');
    } catch (error) {
      send(req, res, 502, { error: error.message || 'In-play scores failed' });
    }
    return;
  }
  if (url.pathname === '/api/sportybet/upcoming') {
    // Public fixture feed the Android app reads directly. Real fixtures only.
    try {
      const events = await loadUpcomingEvents({ force: url.searchParams.get('force') === '1' });
      const decorated = withOccurrence(events);
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
      send(req, res, 200, { source: 'betspapa', events: withOccurrence(filtered) }, 'public, max-age=60');
    } catch (error) {
      send(req, res, 502, { error: error.message || 'Fixture feed failed' });
    }
    return;
  }
  if (config.mode !== 'live') {
    send(req, res, 409, { error: 'Demo mode is active. Scores are simulated in the browser.' });
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
  res.writeHead(200, {
    'Content-Type': TYPES[ext] || 'application/octet-stream',
    'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : ext === '.html' ? 'no-cache' : 'public, max-age=3600',
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

function serveStatic(req, res, url) {
  const requested = decodeURIComponent(url.pathname);
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
}
