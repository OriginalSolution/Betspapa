import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { latestBooking, submitBooking } from './booking.mjs';
import { getConfig } from './config.mjs';
import { createClient, filterByRange, providerDates } from './football.mjs';

const config = getConfig();
const dist = join(process.cwd(), 'dist');
const port = Number(process.env.PORT) || 8787;
const cache = new Map();

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
};

function send(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(data),
  });
  res.end(data);
}

async function cached(key, ttl, fn) {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = await fn();
  cache.set(key, { value, expires: Date.now() + ttl });
  return value;
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
  if (url.pathname === '/api/book') {
    if (req.method === 'GET') {
      send(res, 200, latestBooking());
      return;
    }
    if (req.method !== 'POST') {
      send(res, 405, { error: 'Method not allowed' });
      return;
    }
    try {
      const body = await readJson(req);
      send(res, 200, submitBooking(body.legs));
    } catch (error) {
      send(res, 400, { error: error.message || 'Invalid booking request' });
    }
    return;
  }
  if (req.method !== 'GET') {
    send(res, 405, { error: 'Method not allowed' });
    return;
  }
  if (url.pathname === '/api/health') {
    send(res, 200, { ok: true, mode: config.mode });
    return;
  }
  if (url.pathname === '/api/config') {
    send(res, 200, {
      mode: 'sporty',
      provider: 'Betspapa fixtures',
      pollMs: 30000,
      reason: null,
    });
    return;
  }
  if (url.pathname === '/api/fixtures') {
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    if (!from || !to || Number.isNaN(new Date(from).getTime()) || Number.isNaN(new Date(to).getTime())) {
      send(res, 400, { error: 'from and to must be ISO timestamps.' });
      return;
    }
    try {
      const events = await cached('sporty-upcoming', 20_000, async () => {
        const response = await fetch('https://api.betspapa.com/api/sportybet/upcoming', { signal: AbortSignal.timeout(12_000) });
        if (!response.ok) throw new Error(`Betspapa fixtures returned ${response.status}`);
        const body = await response.json();
        return Array.isArray(body.events) ? body.events : [];
      });
      const fromMs = new Date(from).getTime();
      const toMs = new Date(to).getTime();
      const filtered = events.filter((event) => {
        const kick = new Date(event.kickoff).getTime();
        return kick >= fromMs && kick <= toMs;
      });
      send(res, 200, { source: 'betspapa', events: filtered });
    } catch (error) {
      send(res, 502, { error: error.message || 'Fixture feed failed' });
    }
    return;
  }
  if (config.mode !== 'live') {
    send(res, 409, { error: 'Demo mode is active. Scores are simulated in the browser.' });
    return;
  }

  try {
    if (url.pathname === '/api/matches') {
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      const dates = from && to ? providerDates(from, to) : null;
      if (!dates) {
        send(res, 400, { error: 'from and to must be ISO timestamps.' });
        return;
      }
      const all = await cached(`list:${dates.dateFrom}:${dates.dateTo}`, 15_000, () => client().matches(dates.dateFrom, dates.dateTo));
      const matches = filterByRange(all, from, to).sort((a, b) => a.utcDate.localeCompare(b.utcDate));
      send(res, 200, { matches });
      return;
    }
    const detail = url.pathname.match(/^\/api\/matches\/([^/]+)$/);
    if (detail) {
      const id = decodeURIComponent(detail[1]);
      const match = await cached(`match:${id}`, 12_000, () => client().match(id));
      send(res, 200, { match });
      return;
    }
    send(res, 404, { error: 'Not found' });
  } catch (error) {
    const status = error.status === 429 ? 429 : error.status === 400 ? 400 : 502;
    send(res, status, { error: error.message || 'football-data.org request failed' });
  }
}

function serveStatic(req, res, url) {
  if (!existsSync(dist)) {
    send(res, 404, { error: 'Build the UI with npm run build, or use npm run dev.' });
    return;
  }
  const requested = decodeURIComponent(url.pathname);
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
  const ext = extname(file);
  const hashed = requested.startsWith('/assets/');
  res.writeHead(200, {
    'Content-Type': TYPES[ext] || 'application/octet-stream',
    'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : ext === '.html' ? 'no-cache' : 'public, max-age=3600',
  });
  createReadStream(file).pipe(res);
}

const server = createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url);
    return;
  }
  serveStatic(req, res, url);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Betspapa listening on http://0.0.0.0:${port} (${config.mode})`);
});
