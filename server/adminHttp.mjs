import { readFileSync } from 'node:fs';
import {
  adminEmail,
  clearCookie,
  emailsMatch,
  passwordAccepted,
  sessionMaterial,
  clearFailures,
  failureAddress,
  hasSession,
  noteFailure,
  requestIsSecure,
  retryAfterSeconds,
  REMEMBER_SECONDS,
  SESSION_SECONDS,
  sessionCookie,
  tooManyFailures,
} from './adminAuth.mjs';
import { loadOverview } from './adminData.mjs';
import { consoleHtml, loginHtml, unavailableHtml } from './adminPage.mjs';
import { runEngineCycle, getEngineState } from './engine.mjs';
import { sendTestPush } from './push.mjs';
import { deletePromo, listPromos, sendCurrentShare, sendPromo, setApproveFirst } from './promo/service.mjs';

function sendHtml(res, status, html, extra = {}) {
  const data = Buffer.from(html);
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': data.length,
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    ...extra,
  });
  res.end(data);
}

function sendJson(res, status, body, extra = {}) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': data.length,
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex',
    ...extra,
  });
  res.end(data);
}

function redirect(res, location, cookie) {
  res.writeHead(303, {
    Location: location,
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex',
    'Set-Cookie': cookie,
  });
  res.end();
}

function readRaw(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('Request is too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function credentialsFrom(raw, type) {
  if (String(type || '').includes('application/json')) {
    try {
      const json = JSON.parse(raw || '{}');
      const remember = json.remember === true || json.remember === '1' || json.remember === 'on' ? '1' : '';
      return {
        email: typeof json.email === 'string' ? json.email : '',
        password: typeof json.password === 'string' ? json.password : '',
        remember,
      };
    } catch {
      return { email: '', password: '', remember: '' };
    }
  }
  const params = new URLSearchParams(raw);
  return {
    email: params.get('email') || '',
    password: params.get('password') || '',
    remember: params.get('remember') || '',
  };
}

function keepSignedIn(remember) {
  return remember === '1' || remember === 'on' || remember === 'true';
}

async function login(req, res) {
  const secret = sessionMaterial();
  if (!secret) {
    sendHtml(res, 503, unavailableHtml());
    return;
  }
  const ip = failureAddress(req);
  if (tooManyFailures(ip)) {
    sendHtml(res, 429, loginHtml('Too many attempts. Try again in a few minutes.'), { 'Retry-After': String(retryAfterSeconds(ip)) });
    return;
  }
  let raw = '';
  try {
    raw = await readRaw(req, 8_000);
  } catch {
    sendHtml(res, 400, loginHtml('Sign-in could not be read.'));
    return;
  }
  const given = credentialsFrom(raw, req.headers['content-type']);
  const emailOk = emailsMatch(given.email, adminEmail());
  const passwordOk = passwordAccepted(given.password);
  if (!emailOk || !passwordOk) {
    noteFailure(ip);
    sendHtml(res, 401, loginHtml('Wrong email or password.'));
    return;
  }
  clearFailures(ip);
  const remember = keepSignedIn(given.remember);
  redirect(res, '/admin', sessionCookie(secret, requestIsSecure(req), Date.now(), {
    maxAge: remember ? REMEMBER_SECONDS : SESSION_SECONDS,
    // Chrome does not send SameSite=Strict on the first load of an installed PWA.
    sameSite: remember ? 'Lax' : 'Strict',
  }));
}

const ADMIN_ASSETS = {
  '/admin/manifest.webmanifest': { file: 'manifest.webmanifest', type: 'application/manifest+json; charset=utf-8' },
  '/admin/sw.js': { file: 'sw.js', type: 'text/javascript; charset=utf-8', extra: { 'Service-Worker-Allowed': '/admin', 'Cache-Control': 'no-cache' } },
  '/admin/icons/icon-192.png': { file: 'icons/icon-192.png', type: 'image/png' },
  '/admin/icons/icon-512.png': { file: 'icons/icon-512.png', type: 'image/png' },
  '/admin/icons/icon-maskable-512.png': { file: 'icons/icon-maskable-512.png', type: 'image/png' },
  '/admin/icons/apple-touch-icon.png': { file: 'icons/apple-touch-icon.png', type: 'image/png' },
};

function sendAsset(res, asset) {
  const data = readFileSync(new URL(`./admin/${asset.file}`, import.meta.url));
  res.writeHead(200, {
    'Content-Type': asset.type,
    'Content-Length': data.length,
    'X-Robots-Tag': 'noindex',
    'Cache-Control': 'no-cache',
    ...asset.extra,
  });
  res.end(data);
}

export async function handleAdminPage(req, res, url) {
  const asset = ADMIN_ASSETS[url.pathname];
  if (asset && (req.method === 'GET' || req.method === 'HEAD')) {
    sendAsset(res, asset);
    return;
  }
  if (url.pathname === '/admin/logout' && req.method === 'POST') {
    redirect(res, '/admin', clearCookie(requestIsSecure(req)));
    return;
  }
  if (url.pathname === '/admin/login' && req.method === 'POST') {
    await login(req, res);
    return;
  }
  if (url.pathname !== '/admin') {
    sendHtml(res, 404, unavailableHtml().replace('The operator page is unavailable.', 'Not found.'));
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendHtml(res, 405, loginHtml('Method not allowed.'));
    return;
  }
  if (!hasSession(req) && !sessionMaterial()) {
    sendHtml(res, 503, unavailableHtml());
    return;
  }
  sendHtml(res, 200, hasSession(req) ? consoleHtml() : loginHtml());
}

export async function handleAdminApi(req, res, url, ctx) {
  if (!url.pathname.startsWith('/api/admin/')) return false;
  if (!sessionMaterial()) {
    sendJson(res, 503, { error: 'Operator page is unavailable.' });
    return true;
  }
  if (!hasSession(req)) {
    sendJson(res, 401, { error: 'Admin session required.' });
    return true;
  }
  if (url.pathname === '/api/admin/overview' && req.method === 'GET') {
    try {
      sendJson(res, 200, await loadOverview({ devices: ctx.book.list(), alerts: ctx.alerts.list(), fcm: ctx.fcm() }));
    } catch (error) {
      console.error(`[admin] Overview failed: ${error instanceof Error ? error.message : error}`);
      sendJson(res, 500, { error: 'Overview failed.' });
    }
    return true;
  }
  if (url.pathname === '/api/admin/cycle' && req.method === 'POST') {
    try {
      const state = await runEngineCycle();
      sendJson(res, 200, {
        ok: true,
        updatedAt: state.updatedAt,
        legCount: state.legCount,
        feed: state.eventCount,
        feedError: state.feedError || null,
      });
    } catch (error) {
      console.error(`[admin] Cycle failed: ${error instanceof Error ? error.message : error}`);
      sendJson(res, 500, { error: 'Engine cycle failed.' });
    }
    return true;
  }
  if (url.pathname === '/api/admin/promos' && req.method === 'GET') {
    sendJson(res, 200, listPromos());
    return true;
  }
  if (url.pathname === '/api/admin/promos/settings' && req.method === 'POST') {
    let approveFirst = true;
    try {
      approveFirst = JSON.parse((await readRaw(req, 4_000)) || '{}').approveFirst !== false;
    } catch {
      sendJson(res, 400, { error: 'Promo settings must be JSON.' });
      return true;
    }
    sendJson(res, 200, { approveFirst: setApproveFirst(approveFirst) });
    return true;
  }
  if (url.pathname === '/api/admin/promos/send-now' && req.method === 'POST') {
    const origin = `${requestIsSecure(req) ? 'https' : 'http'}://${req.headers.host || 'localhost'}`;
    const result = await sendCurrentShare(getEngineState(), ctx.book, origin);
    sendJson(res, result.error ? 400 : 200, result.error ? { error: result.error } : { ok: true, ...result });
    return true;
  }
  const promoSend = url.pathname.match(/^\/api\/admin\/promos\/([^/]+)\/send$/);
  if (promoSend && req.method === 'POST') {
    const origin = `${requestIsSecure(req) ? 'https' : 'http'}://${req.headers.host || 'localhost'}`;
    const result = await sendPromo(decodeURIComponent(promoSend[1]), ctx.book, origin);
    sendJson(res, result.error ? 404 : 200, result.error ? { error: result.error } : { ok: true, ...result });
    return true;
  }
  const promoDelete = url.pathname.match(/^\/api\/admin\/promos\/([^/]+)$/);
  if (promoDelete && req.method === 'DELETE') {
    sendJson(res, deletePromo(decodeURIComponent(promoDelete[1])) ? 200 : 404, { ok: true });
    return true;
  }
  if (url.pathname === '/api/admin/push-test' && req.method === 'POST') {
    let kind = '';
    try {
      const body = JSON.parse((await readRaw(req, 8_000)) || '{}');
      kind = body?.kind === 'kickoff' ? 'kickoff' : body?.kind === 'goal' ? 'goal' : '';
    } catch {
      sendJson(res, 400, { error: 'Test push must be JSON.' });
      return true;
    }
    if (!kind) {
      sendJson(res, 400, { error: 'Choose a test goal or a kick-off.' });
      return true;
    }
    const result = await sendTestPush(ctx.book, { latest: true, kind }, (message) => console.log(message));
    if (result.error && /token/i.test(result.error)) {
      sendJson(res, 400, { error: 'No registered device to test.' });
      return true;
    }
    sendJson(res, result.status || (result.error ? 502 : 200), { ok: !result.error, error: result.error || null });
    return true;
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return true;
  }
  sendJson(res, 404, { error: 'Not found' });
  return true;
}
