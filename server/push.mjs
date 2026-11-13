/**
 * Server-side alerts for phones that kill ScoreWatchService.
 * High-priority FCM notification messages name the sound channel. Without a
 * service account this module still diffs the live feed and stores device
 * tokens, and it does not call Google.
 *
 * The SportyBet live list (liveOrPrematchEvents) and event detail (factsCenter/event)
 * do not include a timeline, incidents, comments, VAR reviews, red cards, or
 * penalties (checked 2026-11-13). Goals, kick-off, half-time, and full-time
 * come from the score and matchStatus. Red cards, VAR, and penalties are
 * emitted only when those fields are present on a row.
 */
import { createSign } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const MIN_ODDS = 1.2;
const LIVE = 'https://www.sportybet.com/api/gh/factsCenter/liveOrPrematchEvents?sportId=sr%3Asport%3A1';

export function fcmConfigured(env = process.env) {
  return Boolean(serviceAccount(env));
}

export function serviceAccount(env = process.env) {
  const inline = env.FCM_SERVICE_ACCOUNT_JSON;
  if (inline) {
    try {
      return JSON.parse(inline);
    } catch {
      return null;
    }
  }
  const path = env.FCM_SERVICE_ACCOUNT || env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!path) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

export function channelFor(kind, settings = {}) {
  if (kind === 'red') return settings.redSound === false ? 'betspapa.goal.off.v4' : 'betspapa.redcard.v1';
  if (kind === 'var') return settings.varSound === false ? 'betspapa.goal.off.v4' : 'betspapa.var.v1';
  if (kind === 'penalty') return settings.penaltySound === false ? 'betspapa.goal.off.v4' : 'betspapa.penalty.v1';
  const sound = settings.goalSound;
  if (sound === 'off') return 'betspapa.goal.off.v4';
  const name = sound === 'afro' || sound === 'chant' || sound === 'papa' || sound === 'horn' || sound === 'arp' ? sound : 'crowd';
  return `betspapa.goal.${name}.v4`;
}

export function messageFor(note, device) {
  const channel = channelFor(note.kind, device.settings);
  return {
    message: {
      token: device.token,
      android: {
        priority: 'HIGH',
        ttl: '120s',
        notification: {
          title: note.title,
          body: note.body,
          channel_id: channel,
          tag: note.id,
          notification_priority: 'PRIORITY_MAX',
        },
      },
      data: {
        id: String(note.id),
        matchId: String(note.matchId || ''),
        kind: String(note.kind || ''),
        title: String(note.title || ''),
        body: String(note.body || ''),
        channel,
      },
    },
  };
}

function slug(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'team';
}

function liveStatus(matchStatus, numeric) {
  const status = String(matchStatus || '').trim().toUpperCase();
  if (['HT', 'PAUSED', 'HALFTIME', 'HALF-TIME', 'HALF TIME'].includes(status)) return 'halftime';
  if (['FT', 'ENDED', 'FINISHED', 'AET', 'AP', 'CLOSED', 'AWD', 'WO'].includes(status)) return 'finished';
  if (['PST', 'POSTPONED', 'CANCELLED', 'CANCELED', 'ABD', 'ABANDONED'].includes(status)) return 'postponed';
  if (['H1', '1H', 'H2', '2H', 'LIVE', 'OT', 'ET', 'PEN', 'INPLAY', 'IN PLAY'].includes(status)) return 'live';
  if (numeric === 3 || numeric === 4) return 'finished';
  if (numeric === 1 || numeric === 2) return 'live';
  return 'scheduled';
}

function pair(value) {
  const match = String(value || '').trim().match(/^(\d+)\s*[:\-]\s*(\d+)$/);
  return match ? [Number(match[1]), Number(match[2])] : null;
}

function incidentKinds(raw) {
  const type = String(raw || '').toLowerCase().replace(/[_-]+/g, ' ');
  if (!type.trim()) return [];
  const kinds = [];
  const red = type.includes('red') || type.includes('second yellow') || type.includes('yellow red');
  const penalty = type.includes('penalty') || type === 'pen';
  const review = type.includes('var') || type.includes('video assistant');
  if (review) kinds.push('var');
  if (red) kinds.push('red');
  if (penalty) kinds.push('penalty');
  return kinds;
}

function readIncidents(event) {
  const rows = [];
  for (const key of ['timeline', 'incidents', 'comments']) {
    const value = event[key];
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (!item || typeof item !== 'object') continue;
      const minute = Number(item.minute ?? item.time);
      if (!Number.isFinite(minute)) continue;
      for (const type of incidentKinds(item.type || item.incidentType || '')) {
        const side = String(item.side || item.team || '').toLowerCase().startsWith('away') ? 'away' : 'home';
        rows.push({ type, minute, side, player: String(item.player || item.playerName || '').trim(), key: `${type}:${side}:${minute}` });
      }
    }
  }
  return rows;
}

export function normalizeLive(payload) {
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  const matches = [];
  for (const tournament of rows) {
    for (const event of tournament?.events || []) {
      const id = String(event?.eventId || '');
      const home = String(event?.homeTeamName || '').trim();
      const away = String(event?.awayTeamName || '').trim();
      if (!id || !home || !away) continue;
      const score = pair(event.setScore);
      const status = liveStatus(event.matchStatus, event.status);
      if (status === 'scheduled') continue;
      matches.push({
        id,
        home,
        away,
        homeId: slug(home),
        awayId: slug(away),
        status,
        homeScore: score ? score[0] : 0,
        awayScore: score ? score[1] : 0,
        incidents: readIncidents(event),
        varReview: event.varReview && event.varReview.teamId ? event.varReview : null,
      });
    }
  }
  return matches;
}

export function diffMatches(previous, next) {
  const prior = new Map((previous || []).map((match) => [match.id, match]));
  const notes = [];
  for (const match of next || []) {
    const before = prior.get(match.id);
    if (!before) continue;
    if ((before.status === 'scheduled' || !before.status) && (match.status === 'live' || match.status === 'halftime')) {
      notes.push({ id: `${match.id}:kickoff`, matchId: match.id, kind: 'kickoff', title: 'Kick-off', body: `${match.home} vs ${match.away} is underway`, match });
    }
    const homeDelta = match.homeScore - (before.homeScore || 0);
    const awayDelta = match.awayScore - (before.awayScore || 0);
    for (let index = 1; index <= homeDelta; index += 1) {
      const n = (before.homeScore || 0) + index;
      notes.push({ id: `${match.id}:goal:home:${n}`, matchId: match.id, kind: 'goal', title: `Goal · ${match.home}`, body: `${match.home} score · ${match.home} ${match.homeScore}–${match.awayScore} ${match.away}`, match });
    }
    for (let index = 1; index <= awayDelta; index += 1) {
      const n = (before.awayScore || 0) + index;
      notes.push({ id: `${match.id}:goal:away:${n}`, matchId: match.id, kind: 'goal', title: `Goal · ${match.away}`, body: `${match.away} score · ${match.home} ${match.homeScore}–${match.awayScore} ${match.away}`, match });
    }
    if (before.status !== 'halftime' && before.status !== 'finished' && (match.status === 'halftime' || match.status === 'finished')) {
      notes.push({ id: `${match.id}:ht`, matchId: match.id, kind: 'ht', title: 'Half-time', body: `${match.home} vs ${match.away}`, match });
    }
    if (before.status !== 'finished' && match.status === 'finished') {
      notes.push({ id: `${match.id}:ft`, matchId: match.id, kind: 'ft', title: 'Full-time', body: `${match.home} ${match.homeScore}–${match.awayScore} ${match.away}`, match });
    }
    const seen = new Set((before.incidents || []).map((item) => item.key));
    for (const incident of match.incidents || []) {
      if (seen.has(incident.key)) continue;
      const team = incident.side === 'away' ? match.away : match.home;
      const title = incident.type === 'red' ? 'Red card' : incident.type === 'penalty' ? 'Penalty' : 'VAR';
      notes.push({
        id: `${match.id}:${incident.type}:${incident.side}:${incident.minute}`,
        matchId: match.id,
        kind: incident.type,
        title: `${title} · ${team}`,
        body: `${incident.player || title} ${incident.minute}′ · ${match.home} vs ${match.away}`,
        match,
      });
    }
    if (match.varReview && !before.varReview) {
      notes.push({
        id: `${match.id}:var:${match.varReview.minute}:${match.varReview.player || 'Goal'}`,
        matchId: match.id,
        kind: 'var',
        title: 'VAR',
        body: `${match.varReview.player || 'Goal'} ${match.varReview.minute || ''}′ · goal under review`,
        match,
      });
    }
  }
  return notes;
}

function follows(device, match) {
  const book = device.follows || {};
  if ((book.matches || []).includes(match.id)) return true;
  return (book.teams || []).some((team) => team && (team.id === match.homeId || team.id === match.awayId));
}

function allowed(device, kind) {
  const settings = device.settings || {};
  if (settings[kind] === false) return false;
  return true;
}

export function notesForDevice(notes, device) {
  return (notes || []).filter((item) => item.match && follows(device, item.match) && allowed(device, item.kind));
}

export function acceptDevice(body) {
  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  if (token.length < 20 || /\s/.test(token)) return { error: 'A device token is required.' };
  const followsIn = body.follows && typeof body.follows === 'object' ? body.follows : {};
  const matches = Array.isArray(followsIn.matches) ? followsIn.matches.filter((id) => typeof id === 'string').slice(0, 200) : [];
  const teams = Array.isArray(followsIn.teams)
    ? followsIn.teams
        .filter((team) => team && typeof team.id === 'string')
        .map((team) => ({ id: team.id, name: typeof team.name === 'string' ? team.name : team.id }))
        .slice(0, 200)
    : [];
  const trends = Array.isArray(body.trends) ? body.trends.filter((id) => typeof id === 'string').slice(0, 200) : [];
  const settings = body.settings && typeof body.settings === 'object' ? body.settings : {};
  return {
    device: {
      token,
      follows: { matches, teams },
      trends,
      settings: {
        kickoff: settings.kickoff !== false,
        goal: settings.goal !== false,
        red: settings.red !== false,
        penalty: settings.penalty !== false,
        ht: settings.ht !== false,
        ft: settings.ft !== false,
        var: settings.var !== false,
        goalSound: typeof settings.goalSound === 'string' ? settings.goalSound : 'crowd',
        redSound: settings.redSound !== false,
        varSound: settings.varSound !== false,
        penaltySound: settings.penaltySound !== false,
      },
      sent: [],
      updatedAt: new Date().toISOString(),
    },
  };
}

export function createDeviceBook(dir) {
  const file = join(dir, 'devices.json');
  let devices = load();

  function load() {
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8'));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function save() {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, JSON.stringify(devices));
  }

  return {
    list: () => devices,
    register(body) {
      const accepted = acceptDevice(body);
      if (accepted.error) return accepted;
      const existing = devices.find((item) => item.token === accepted.device.token);
      accepted.device.sent = existing?.sent || [];
      devices = [accepted.device, ...devices.filter((item) => item.token !== accepted.device.token)].slice(0, 5000);
      save();
      return { ok: true, push: fcmConfigured() };
    },
    alreadySent(token, id) {
      const device = devices.find((item) => item.token === token);
      return Boolean(device && device.sent.includes(id));
    },
    remember(token, id) {
      const device = devices.find((item) => item.token === token);
      if (!device || device.sent.includes(id)) return;
      device.sent = [id, ...device.sent].slice(0, 400);
      save();
    },
    drop(token) {
      devices = devices.filter((item) => item.token !== token);
      save();
    },
  };
}

let accessToken = null;
let accessUntil = 0;

async function googleToken(account) {
  if (accessToken && accessUntil > Date.now() + 60_000) return accessToken;
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const claim = Buffer.from(JSON.stringify({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })).toString('base64url');
  const sign = createSign('RSA-SHA256');
  sign.update(`${header}.${claim}`);
  const jwt = `${header}.${claim}.${sign.sign(account.private_key).toString('base64url')}`;
  const body = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) throw new Error(`FCM auth returned ${response.status}`);
  const json = await response.json();
  accessToken = json.access_token;
  accessUntil = Date.now() + (Number(json.expires_in) || 3600) * 1000;
  return accessToken;
}

export async function sendMessage(account, payload) {
  const token = await googleToken(account);
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (response.status === 404 || response.status === 410) return { dropped: true };
  if (!response.ok) throw new Error(`FCM returned ${response.status}`);
  return { dropped: false };
}

export function startPushWatch(options = {}) {
  const dir = options.dir || process.env.ENGINE_DATA_DIR || join(process.cwd(), 'data', 'engine');
  const book = options.book || createDeviceBook(dir);
  const log = options.log || ((message) => console.log(`[push] ${message}`));
  const intervalMs = options.intervalMs ?? 25_000;
  let baseline = null;
  let warned = false;
  let timer = null;

  async function tick() {
    const account = serviceAccount();
    if (!account && !warned) {
      warned = true;
      log('FCM service account is not set. Devices can register. Nothing is pushed.');
    }
    let payload;
    try {
      const response = await (options.fetchImpl || fetch)(LIVE, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
          Referer: 'https://www.sportybet.com/gh/sport/football',
        },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`In-play scores returned ${response.status}`);
      payload = await response.json();
    } catch (error) {
      log(`Live feed failed: ${error instanceof Error ? error.message : error}`);
      return;
    }
    const matches = normalizeLive(payload);
    if (!baseline) {
      baseline = matches;
      return;
    }
    const notes = diffMatches(baseline, matches);
    baseline = matches;
    if (!notes.length || !account) return;
    for (const device of book.list()) {
      for (const item of notesForDevice(notes, device)) {
        if (book.alreadySent(device.token, item.id)) continue;
        try {
          const result = await sendMessage(account, messageFor(item, device));
          if (result.dropped) book.drop(device.token);
          else book.remember(device.token, item.id);
        } catch (error) {
          log(`Push failed: ${error instanceof Error ? error.message : error}`);
        }
      }
    }
  }

  function start() {
    if (timer) return book;
    timer = setInterval(() => void tick(), intervalMs);
    timer.unref?.();
    void tick();
    return book;
  }

  return { book, start, tick };
}
