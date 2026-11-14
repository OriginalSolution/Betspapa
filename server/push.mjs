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
import { priceInRange } from './oddsRange.mjs';
import { cleanCountry } from './geo.mjs';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { looseKey, teamSlug } from '../src/lib/crestMatch.mjs';
import { loadCatalog } from './crestResolve.mjs';
import { isDummyId, isSimulated } from './upcoming.mjs';

export const MIN_ODDS = 1.2;
const LIVE = 'https://www.sportybet.com/api/gh/factsCenter/liveOrPrematchEvents?sportId=sr%3Asport%3A1';

export function fcmConfigured(env = process.env) {
  const account = serviceAccount(env);
  return Boolean(account && account.project_id && account.client_email && account.private_key);
}

/** Fields safe to print. The service-account key and access token are never included. */
export function publicFcm(body) {
  const json = body && typeof body === 'object' ? body : {};
  const out = {};
  if (typeof json.name === 'string') out.name = json.name;
  const error = json.error && typeof json.error === 'object' ? json.error : null;
  if (error) {
    out.error = {};
    if (error.code != null) out.error.code = error.code;
    if (typeof error.status === 'string') out.error.status = error.status;
    if (typeof error.message === 'string') out.error.message = error.message.slice(0, 400);
  }
  return out;
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

let crestCatalog;

function crestCatalogSafe() {
  if (crestCatalog) return crestCatalog;
  try {
    crestCatalog = loadCatalog();
  } catch {
    crestCatalog = { byId: {}, byKey: {} };
  }
  return crestCatalog;
}

/** Absolute crest URL the phone can fetch. Empty when this club has no stored badge. */
export function crestUrlFor(name) {
  const catalog = crestCatalogSafe();
  const file = catalog.byId?.[teamSlug(name)] || catalog.byKey?.[looseKey(name)] || '';
  if (!file || typeof file !== 'string') return '';
  if (/^https?:\/\//i.test(file)) return file;
  return `https://api.betspapa.com${file.startsWith('/') ? file : `/${file}`}`;
}

/**
 * Data-only FCM. A notification block makes Android draw a plain system card
 * and never calls onMessageReceived, so the Red Ticker would not run.
 */
export function messageFor(note, device) {
  const channel = channelFor(note.kind, device.settings);
  const match = note.match || {};
  const home = String(match.home || '');
  const away = String(match.away || '');
  const data = {
    id: String(note.id || ''),
    matchId: String(note.matchId || match.id || ''),
    kind: String(note.kind || ''),
    title: String(note.title || ''),
    body: String(note.body || ''),
    channel,
    home,
    away,
    homeScore: match.homeScore == null ? '' : String(match.homeScore),
    awayScore: match.awayScore == null ? '' : String(match.awayScore),
    minute: match.minute == null ? '' : String(match.minute),
    status: String(match.status || ''),
    homeCrest: String(match.homeCrest || crestUrlFor(home)),
    awayCrest: String(match.awayCrest || crestUrlFor(away)),
    competition: String(match.competition || ''),
    market: String(note.market || ''),
    marketLabel: String(note.marketLabel || ''),
    trendId: String(note.trendId || ''),
    fixture: String(note.fixture || ''),
    odds: String(note.odds || ''),
    image: String(note.image || ''),
    route: String(note.route || ''),
    code: String(note.code || ''),
  };
  return {
    message: {
      token: device.token,
      android: {
        priority: 'HIGH',
        ttl: '120s',
      },
      data,
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

const TREND_LABELS = {
  home: 'Full-time home win',
  draw: 'Full-time draw',
  away: 'Full-time away win',
  'dc-1x': 'Double chance 1X',
  'dc-12': 'Double chance 12',
  'dc-x2': 'Double chance X2',
  'dnb-home': 'Draw no bet · home',
  'dnb-away': 'Draw no bet · away',
  over05: 'Over 0.5 goals',
  over15: 'Over 1.5 goals',
  over25: 'Over 2.5 goals',
  over35: 'Over 3.5 goals',
  under15: 'Under 1.5 goals',
  under25: 'Under 2.5 goals',
  under35: 'Under 3.5 goals',
  btts: 'Both teams to score',
  'btts-no': 'Both teams not to score',
  'home-score': 'Home team to score',
  'away-score': 'Away team to score',
  clean: 'Clean sheet',
  'fh-home': 'First-half home win',
  'fh-draw': 'First-half draw',
  'fh-away': 'First-half away win',
  'fh-over05': 'First-half over 0.5',
  'fh-over15': 'First-half over 1.5',
  'sh-over05': 'Second-half over 0.5',
};

function bothSrl(home, away) {
  const srl = (name) => {
    const lower = String(name || '').toLowerCase();
    if (lower.includes('societ') || lower.includes('sportiva') || lower.includes('s.r.l')) return false;
    return lower.endsWith(' srl');
  };
  return srl(home) && srl(away);
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
      const country = String(tournament?.categoryName || event?.sport?.category?.name || '');
      const competition = String(tournament?.name || event?.sport?.category?.tournament?.name || '');
      if (isDummyId(id) || isSimulated({ country, tournament: competition, home, away }) || bothSrl(home, away)) continue;
      const score = pair(event.setScore);
      const status = liveStatus(event.matchStatus, event.status);
      if (status === 'scheduled') continue;
      const period = String(event.period || event.matchStatus || '').toUpperCase();
      let minute = null;
      const playedHead = String(event.playedSeconds || '').split(':')[0];
      if (/^\d+$/.test(playedHead)) {
        minute = Number(playedHead);
        if ((period === 'H2' || period === '2H' || period === 'HT') && minute < 46) minute += 45;
      }
      let htHome = null;
      let htAway = null;
      const second = period === '2' || period === 'H2' || period === '2H' || status === 'halftime' || status === 'finished';
      if (second && Array.isArray(event.gameScore) && event.gameScore.length) {
        const half = pair(event.gameScore[0]);
        if (half) {
          htHome = half[0];
          htAway = half[1];
        }
      }
      matches.push({
        id,
        home,
        away,
        homeId: slug(home),
        awayId: slug(away),
        status,
        minute,
        homeScore: score ? score[0] : 0,
        awayScore: score ? score[1] : 0,
        htHome,
        htAway,
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
    if (!before) {
      if (match.status === 'live' || match.status === 'halftime') {
        notes.push({ id: `${match.id}:kickoff`, matchId: match.id, kind: 'kickoff', title: 'Kick-off', body: `${match.home} vs ${match.away} is underway`, match });
      }
      continue;
    }
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

function halfReady(match) {
  if (match.htHome == null || match.htAway == null) return false;
  if (match.status === 'halftime' || match.status === 'finished') return true;
  return match.status === 'live' && Number.isFinite(match.minute) && match.minute >= 45;
}

export function settleTrend(market, match) {
  const homeSide = !(market === 'away' || market === 'away-score' || market === 'dnb-away' || market === 'fh-away');
  if (String(market).startsWith('fh-')) {
    if (!halfReady(match)) return 'open';
    const home = match.htHome;
    const away = match.htAway;
    const total = home + away;
    if (market === 'fh-over05') return total >= 1 ? 'won' : 'bust';
    if (market === 'fh-over15') return total >= 2 ? 'won' : 'bust';
    if (market === 'fh-home') return home > away ? 'won' : 'bust';
    if (market === 'fh-away') return away > home ? 'won' : 'bust';
    if (market === 'fh-draw') return home === away ? 'won' : 'bust';
    return 'open';
  }
  if (!match || match.status === 'scheduled' || match.status === 'postponed' || match.homeScore == null || match.awayScore == null) return 'open';
  const home = match.homeScore;
  const away = match.awayScore;
  const total = home + away;
  const finished = match.status === 'finished';
  const conceded = homeSide ? away : home;
  const scored = homeSide ? home : away;
  if (market === 'over05') return total >= 1 ? 'won' : finished ? 'bust' : 'open';
  if (market === 'over15') return total >= 2 ? 'won' : finished ? 'bust' : 'open';
  if (market === 'over25') return total >= 3 ? 'won' : finished ? 'bust' : 'open';
  if (market === 'over35') return total >= 4 ? 'won' : finished ? 'bust' : 'open';
  if (market === 'under15') return total >= 2 ? 'bust' : finished ? 'won' : 'open';
  if (market === 'under25') return total >= 3 ? 'bust' : finished ? 'won' : 'open';
  if (market === 'under35') return total >= 4 ? 'bust' : finished ? 'won' : 'open';
  if (market === 'btts') return home > 0 && away > 0 ? 'won' : finished ? 'bust' : 'open';
  if (market === 'btts-no') return home > 0 && away > 0 ? 'bust' : finished ? 'won' : 'open';
  if (market === 'home-score') return home > 0 ? 'won' : finished ? 'bust' : 'open';
  if (market === 'away-score') return away > 0 ? 'won' : finished ? 'bust' : 'open';
  if (market === 'clean') return conceded > 0 ? 'bust' : finished ? 'won' : 'open';
  if (market === 'home') return finished ? (home > away ? 'won' : 'bust') : 'open';
  if (market === 'away') return finished ? (away > home ? 'won' : 'bust') : 'open';
  if (market === 'draw') return finished ? (home === away ? 'won' : 'bust') : 'open';
  if (market === 'dc-1x') return finished ? (home >= away ? 'won' : 'bust') : 'open';
  if (market === 'dc-12') return finished ? (home !== away ? 'won' : 'bust') : 'open';
  if (market === 'dc-x2') return finished ? (away >= home ? 'won' : 'bust') : 'open';
  if (market === 'dnb-home') {
    if (!finished) return 'open';
    if (home > away) return 'won';
    if (away > home) return 'bust';
    return 'open';
  }
  if (market === 'dnb-away') {
    if (!finished) return 'open';
    if (away > home) return 'won';
    if (home > away) return 'bust';
    return 'open';
  }
  return scored > 0 && finished ? 'won' : 'open';
}

function oddsOf(device, trendId) {
  const row = (device.bookings || []).find((item) => item.id === trendId);
  if (!row || row.odds == null) return null;
  const value = Number(row.odds);
  return Number.isFinite(value) ? value : null;
}

export function trendNotes(previous, next, device) {
  const prior = new Map((previous || []).map((match) => [match.id, match]));
  const notes = [];
  for (const trendId of device.trends || []) {
    const id = String(trendId || '');
    const cut = id.lastIndexOf(':');
    if (cut <= 0) continue;
    const matchId = id.slice(0, cut);
    const market = id.slice(cut + 1);
    const label = TREND_LABELS[market];
    if (!label) continue;
    const match = (next || []).find((item) => item.id === matchId);
    const before = prior.get(matchId);
    if (!match || !before) continue;
    if (settleTrend(market, before) === 'won') continue;
    if (settleTrend(market, match) !== 'won') continue;
    const odds = oddsOf(device, id);
    if (odds != null && !priceInRange(market, odds)) continue;
    notes.push({
      id: `trend:${id}:hit`,
      matchId,
      kind: 'win',
      title: `Trend hit · ${label}`,
      body: `${match.home} vs ${match.away} · ${label}`,
      match,
    });
  }
  return notes;
}

function cleanVersion(value) {
  if (typeof value !== 'string') return '';
  const version = value.trim();
  if (!/^[0-9A-Za-z._+-]{1,32}$/.test(version)) return '';
  return version;
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
  const bookings = Array.isArray(body.bookings)
    ? body.bookings
        .filter((row) => row && typeof row.id === 'string')
        .map((row) => {
          const odds = Number(row.odds);
          return { id: row.id.slice(0, 120), odds: Number.isFinite(odds) ? odds : null };
        })
        .slice(0, 200)
    : [];
  const settings = body.settings && typeof body.settings === 'object' ? body.settings : {};
  return {
    device: {
      token,
      follows: { matches, teams },
      trends,
      bookings,
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
        promos: settings.promos !== false,
      },
      appVersion: cleanVersion(body?.appVersion),
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
    register(body, meta = {}) {
      const accepted = acceptDevice(body);
      if (accepted.error) return accepted;
      const existing = devices.find((item) => item.token === accepted.device.token);
      const now = new Date().toISOString();
      const device = {
        ...accepted.device,
        sent: existing?.sent || [],
        appVersion: accepted.device.appVersion || (typeof existing?.appVersion === 'string' ? existing.appVersion : ''),
        country: cleanCountry(meta?.country) || cleanCountry(existing?.country) || null,
        firstSeenAt: existing?.firstSeenAt || existing?.updatedAt || now,
        lastSeenAt: now,
      };
      delete device.ip;
      delete device.address;
      devices = [device, ...devices.filter((item) => item.token !== device.token)].slice(0, 5000);
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
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { error: { message: 'FCM response was not JSON' } };
  }
  if (response.status === 404 || response.status === 410) return { dropped: true, ok: false, status: response.status, body };
  if (!response.ok) {
    const error = new Error(`FCM returned ${response.status}`);
    error.fcm = publicFcm(body);
    throw error;
  }
  return { dropped: false, ok: true, status: response.status, body };
}

/** One promo image to a single registered phone. A fresh id so a retry still shows. */
export async function sendPromoToToken(book, note, token) {
  const account = serviceAccount();
  if (!fcmConfigured() || !account) return { ok: false, error: 'FCM is not configured.', sent: 0 };
  const chosen = String(token || '').trim();
  if (chosen.length < 20 || /\s/.test(chosen)) return { ok: false, error: 'Paste a device token, or register the phone first.', sent: 0 };
  const known = (book?.list?.() || []).find((item) => item.token === chosen);
  if (known?.settings?.promos === false) return { ok: false, error: 'That phone has Promos turned off.', sent: 0 };
  try {
    const result = await sendMessage(account, messageFor(note, known || { token: chosen, settings: { goalSound: 'crowd', promos: true } }));
    if (result.dropped && known) book.drop(chosen);
    return { ok: !result.dropped, sent: result.dropped ? 0 : 1, error: result.dropped ? 'That token is no longer registered with FCM.' : null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'FCM did not accept the promo.', sent: 0 };
  }
}

/** One promo image to every device that still wants promos. A sent id is not posted again. */
export async function broadcastPromo(book, note) {
  const account = serviceAccount();
  if (!fcmConfigured() || !account) return { ok: false, error: 'FCM is not configured.', sent: 0 };
  let sent = 0;
  for (const device of book?.list?.() || []) {
    if (device?.settings?.promos === false) continue;
    if (book.alreadySent(device.token, note.id)) continue;
    try {
      const result = await sendMessage(account, messageFor(note, device));
      if (result.dropped) book.drop(device.token);
      else {
        book.remember(device.token, note.id);
        sent += 1;
      }
    } catch {
      /* the next device still gets the creative */
    }
  }
  return { ok: true, sent };
}

export async function sendTestPush(book, body, log = (message) => console.log(message)) {
  const account = serviceAccount();
  if (!fcmConfigured()) return { status: 503, error: 'FCM is not configured.' };
  let token = typeof body?.token === 'string' ? body.token.trim() : '';
  if (!token && body?.latest) token = book.list()[0]?.token || '';
  if (token.length < 20 || /\s/.test(token)) return { status: 400, error: 'A device token is required.' };
  const allowed = new Set(['goal', 'kickoff', 'win', 'red', 'var', 'penalty']);
  const kind = allowed.has(body?.kind) ? body.kind : 'goal';
  const matchId = typeof body?.matchId === 'string' && body.matchId.trim() ? body.matchId.trim() : 'qc-arsenal';
  const copy = {
    goal: { title: 'Goal · Arsenal', body: 'Saka score · Arsenal 2–1 Chelsea', minute: 54 },
    kickoff: { title: 'Kick-off', body: 'Arsenal vs Chelsea is underway', minute: 1 },
    win: { title: 'Trend hit · Over 2.5 goals', body: 'Arsenal vs Chelsea · Over 2.5 goals', minute: 54 },
    red: { title: 'Red card · Chelsea', body: 'Keeper 50′ · Arsenal vs Chelsea', minute: 50 },
    var: { title: 'VAR', body: 'Saka 54′ · Arsenal goal under review', minute: 54 },
    penalty: { title: 'Penalty · Arsenal', body: 'Saka 61′ · Arsenal vs Chelsea', minute: 61 },
  }[kind];
  const note = {
    id: `test:${kind}:${Date.now()}`,
    matchId,
    kind,
    title: copy.title,
    body: copy.body,
    market: kind === 'win' ? 'over25' : '',
    marketLabel: kind === 'win' ? 'Over 2.5 goals' : '',
    trendId: kind === 'win' ? `${matchId}:over25` : '',
    fixture: 'ARS vs CHE',
    odds: kind === 'win' ? '1.72' : '',
    match: {
      id: matchId,
      home: 'Arsenal',
      away: 'Chelsea',
      homeScore: 2,
      awayScore: 1,
      minute: copy.minute,
      status: 'live',
      competition: 'Premier League',
      homeCrest: 'https://upload.wikimedia.org/wikipedia/en/thumb/5/53/Arsenal_FC.svg/250px-Arsenal_FC.svg.png',
      awayCrest: 'https://upload.wikimedia.org/wikipedia/en/thumb/c/cc/Chelsea_FC.svg/250px-Chelsea_FC.svg.png',
    },
  };
  try {
    const result = await sendMessage(account, messageFor(note, { token, settings: body?.settings || { goalSound: 'crowd' } }));
    const fcm = publicFcm(result.body);
    log(`[push] FCM response ${result.status} ${JSON.stringify(fcm)}`);
    return { status: 200, fcm };
  } catch (error) {
    const fcm = error && error.fcm ? error.fcm : null;
    log(`[push] FCM response failed ${error instanceof Error ? error.message : error}${fcm ? ` ${JSON.stringify(fcm)}` : ''}`);
    return { status: 502, error: error instanceof Error ? error.message : 'FCM request failed', fcm };
  }
}

export function alertMatch(note) {
  const match = note?.match && typeof note.match === 'object' ? note.match : {};
  if (match.home && match.away) return `${match.home} vs ${match.away}`.replace(/\s+/g, ' ').trim().slice(0, 140);
  if (typeof note?.fixture === 'string' && note.fixture.trim()) return note.fixture.trim().slice(0, 140);
  return '';
}

export function createAlertLog(dir) {
  const file = join(dir, 'push-log.json');
  let rows = load();

  function load() {
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8'));
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((row) => row && typeof row.type === 'string' && typeof row.time === 'string')
        .map((row) => ({ type: String(row.type).slice(0, 40), match: String(row.match || '').slice(0, 140), time: String(row.time) }));
    } catch {
      return [];
    }
  }

  function save() {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, JSON.stringify(rows));
  }

  return {
    list: () => rows.map((row) => ({ ...row })),
    record(note, time = new Date().toISOString()) {
      const row = { type: String(note?.kind || 'alert').slice(0, 40), match: alertMatch(note), time };
      if (!row.match) return;
      rows = [row, ...rows].slice(0, 40);
      save();
    },
  };
}

export function startPushWatch(options = {}) {
  const dir = options.dir || process.env.ENGINE_DATA_DIR || join(process.cwd(), 'data', 'engine');
  const book = options.book || createDeviceBook(dir);
  const alerts = options.alerts || createAlertLog(dir);
  const log = options.log || ((message) => console.log(`[push] ${message}`));
  const intervalMs = options.intervalMs ?? 25_000;
  let baseline = null;
  let warned = false;
  let announced = false;
  let timer = null;

  async function tick() {
    const account = serviceAccount();
    if (!fcmConfigured() && !warned) {
      warned = true;
      log('FCM service account is not set. Devices can register. Nothing is pushed.');
    }
    if (fcmConfigured() && !announced) {
      announced = true;
      log(`FCM HTTP v1 is on for project ${account.project_id}.`);
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
    const previous = baseline;
    baseline = matches;
    if (!fcmConfigured()) return;
    const logged = new Set();
    for (const device of book.list()) {
      const mine = [...notesForDevice(notes, device), ...trendNotes(previous, matches, device)];
      for (const item of mine) {
        if (book.alreadySent(device.token, item.id)) continue;
        try {
          const result = await sendMessage(account, messageFor(item, device));
          const fcm = publicFcm(result.body);
          log(`FCM response ${result.status} ${JSON.stringify(fcm)}`);
          if (result.dropped) book.drop(device.token);
          else {
            book.remember(device.token, item.id);
            if (!logged.has(item.id)) {
              logged.add(item.id);
              alerts.record(item);
            }
          }
        } catch (error) {
          const fcm = error && error.fcm ? ` ${JSON.stringify(error.fcm)}` : '';
          log(`Push failed: ${error instanceof Error ? error.message : error}${fcm}`);
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

  return { book, alerts, start, tick };
}
