import {
  adminPassword,
  clearCookie,
  clearFailures,
  failureAddress,
  hasSession,
  noteFailure,
  passwordsMatch,
  requestIsSecure,
  retryAfterSeconds,
  sessionCookie,
  tooManyFailures,
} from './adminAuth.mjs';
import { loadOverview } from './adminData.mjs';
import { consoleHtml, loginHtml, unavailableHtml } from './adminPage.mjs';
import { runEngineCycle } from './engine.mjs';
import { sendTestPush } from './push.mjs';

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

function passwordFrom(raw, type) {
  if (String(type || '').includes('application/json')) {
    try {
      const json = JSON.parse(raw || '{}');
      return typeof json.password === 'string' ? json.password : '';
    } catch {
      return '';
    }
  }
  return new URLSearchParams(raw).get('password') || '';
}

async function login(req, res) {
  const password = adminPassword();
  if (!password) {
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
  if (!passwordsMatch(passwordFrom(raw, req.headers['content-type']), password)) {
    noteFailure(ip);
    sendHtml(res, 401, loginHtml('Wrong password.'));
    return;
  }
  clearFailures(ip);
  redirect(res, '/admin', sessionCookie(password, requestIsSecure(req)));
}

export async function handleAdminPage(req, res, url) {
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
  if (!adminPassword()) {
    sendHtml(res, 503, unavailableHtml());
    return;
  }
  sendHtml(res, hasSession(req) ? 200 : 200, hasSession(req) ? consoleHtml() : loginHtml());
}

export async function handleAdminApi(req, res, url, ctx) {
  if (!url.pathname.startsWith('/api/admin/')) return false;
  if (!adminPassword()) {
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
