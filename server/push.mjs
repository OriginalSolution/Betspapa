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
import { spawn } from 'node:child_process';
import { createSign } from 'node:crypto';
import { priceInRange } from './oddsRange.mjs';
import { gradePick } from './results.mjs';
import { cleanCountry } from './geo.mjs';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { safeWriteFile } from './safeWrite.mjs';
import { join } from 'node:path';
import { expandAlias, looseKey, teamSlug } from '../src/lib/crestMatch.mjs';
import { loadCatalog } from './crestResolve.mjs';
import { crestStore } from './crestStore.mjs';
import { isDummyId, isSimulated } from './upcoming.mjs';
import {
  disallowedCopy,
  fixtureLine,
  fullTimeCopy,
  goalCopy,
  halfTimeCopy,
  incidentCopy,
  kickoffCopy,
  legFixture,
  legScore,
  legList,
  trendCopy,
  varReviewCopy,
} from '../src/lib/noteCopy.mjs';

export const MIN_ODDS = 1.2;
const LIVE = 'https://www.sportybet.com/api/gh/factsCenter/liveOrPrematchEvents?sportId=sr%3Asport%3A1';
const LIVE_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
  Referer: 'https://www.sportybet.com/gh/sport/football',
};
/**
 * HiOS and other OEM battery savers often deliver a data message minutes
 * after FCM accepts it. A 2-minute TTL expired before the phone woke, so
 * Google reported success and the shade stayed empty.
 */
export const PUSH_TTL = '3600s';

/**
 * A goal that reaches the phone 50 minutes late is noise, so live events expire
 * sooner than a trend hit. The phone also drops a live card that arrives stale.
 */
export function ttlFor(kind) {
  if (kind === 'goal' || kind === 'var' || kind === 'red' || kind === 'penalty') return '900s';
  if (kind === 'kickoff' || kind === 'ht') return '900s';
  if (kind === 'ft') return '1800s';
  if (kind === 'slip') return PUSH_TTL;
  return PUSH_TTL;
}

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
  if (kind === 'slip' || kind === 'lineup') return 'betspapa.goal.off.v4';
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

/** Our own crest copy by competitor id first, then the bundled catalogue by name. */
function teamCrest(competitor, name) {
  try {
    const url = crestStore().crestFor(competitor, name);
    if (url) return url;
  } catch {
    /* the bundled catalogue below still answers */
  }
  return crestUrlFor(name);
}

const BOOKMAKER_URL = /https?:\/\/(?:www\.)?(?:sportybet\.com|football\.com|msport\.com|betika\.com|betpawa\.com(?:\.gh)?)(?:\/\S*)?/gi;

/** A push must not carry a bookmaker link. The Play app cannot be switched back to opening one. */
export function stripBookmakerUrls(value) {
  return String(value || '').replace(BOOKMAKER_URL, '').replace(/[ \t]{2,}/g, ' ').trim();
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
    title: stripBookmakerUrls(note.title || ''),
    body: stripBookmakerUrls(note.body || ''),
    channel,
    home,
    away,
    homeScore: match.homeScore == null ? '' : String(match.homeScore),
    awayScore: match.awayScore == null ? '' : String(match.awayScore),
    minute: note.minute != null && note.minute !== '' ? String(note.minute) : match.minute == null ? '' : String(match.minute),
    status: String(match.status || ''),
    player: String(note.player || ''),
    side: note.side === 'home' || note.side === 'away' ? note.side : '',
    homeCrest: String(match.homeCrest || teamCrest(match.homeCompetitor, home)),
    awayCrest: String(match.awayCrest || teamCrest(match.awayCompetitor, away)),
    competition: String(match.competition || ''),
    market: String(note.market || ''),
    marketLabel: String(note.marketLabel || ''),
    trendId: String(note.trendId || ''),
    fixture: String(note.fixture || ''),
    odds: String(note.odds || ''),
    image: String(note.image || ''),
    route: stripBookmakerUrls(note.route || ''),
    code: String(note.code || ''),
    disallowed: note.disallowed ? '1' : '',
    replaces: String(note.replaces || ''),
    sentAt: String(note.sentAt || Date.now()),
  };
  return {
    message: {
      token: device.token,
      android: {
        priority: 'HIGH',
        ttl: ttlFor(note.kind),
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
        homeCompetitor: event.homeTeamId ? String(event.homeTeamId) : '',
        awayCompetitor: event.awayTeamId ? String(event.awayTeamId) : '',
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

/** A kick-off seen for the first time this late is not news. The phone would get it mid-match. */
export const KICKOFF_FRESH_MINUTES = 5;

/** Goal ids. A goal VAR took back bumps the revision so the re-scored goal still alerts. */
export function goalNoteId(matchId, side, index, rev = 0) {
  const base = `${matchId}:goal:${side}:${index}`;
  return rev > 0 ? `${base}:r${rev}` : base;
}

function revsOf(row) {
  const revs = row && row.revs && typeof row.revs === 'object' ? row.revs : {};
  return {
    home: { ...(revs.home && typeof revs.home === 'object' ? revs.home : {}) },
    away: { ...(revs.away && typeof revs.away === 'object' ? revs.away : {}) },
  };
}

/** Which side a VAR review is about, or '' when the feed's team id matches neither. */
function reviewSide(match) {
  const id = String(match?.varReview?.teamId || '');
  if (!id) return '';
  if (id === String(match.homeCompetitor || '') || id === String(match.homeId || '')) return 'home';
  if (id === String(match.awayCompetitor || '') || id === String(match.awayId || '')) return 'away';
  return '';
}

function kickoffNote(match) {
  return { id: `${match.id}:kickoff`, matchId: match.id, kind: 'kickoff', ...kickoffCopy(match), match };
}

/**
 * Notes for what changed between two polls. `next` rows gain a `revs` map so a
 * cancelled goal's revision is carried into the stored baseline.
 */
export function diffMatches(previous, next) {
  const prior = new Map((previous || []).map((match) => [match.id, match]));
  const notes = [];
  for (const match of next || []) {
    const before = prior.get(match.id);
    if (!before) {
      const fresh = match.minute == null || (Number.isFinite(match.minute) && match.minute <= KICKOFF_FRESH_MINUTES);
      if (match.status === 'live' && fresh) notes.push(kickoffNote(match));
      continue;
    }
    const revs = revsOf(before);
    match.revs = revs;
    if ((before.status === 'scheduled' || !before.status) && (match.status === 'live' || match.status === 'halftime')) {
      notes.push(kickoffNote(match));
    }
    for (const side of ['home', 'away']) {
      const was = Number(before[`${side}Score`]) || 0;
      const now = Number(match[`${side}Score`]) || 0;
      if (now < was) {
        // The feed took a goal back. That is a VAR (or data) correction, never a new goal.
        for (let index = was; index > now; index -= 1) {
          const rev = Number(revs[side][index]) || 0;
          const goalId = goalNoteId(match.id, side, index, rev);
          notes.push({
            id: `${goalId}:cancelled`,
            matchId: match.id,
            kind: 'var',
            ...disallowedCopy(match, side),
            disallowed: true,
            replaces: goalId,
            match,
          });
          revs[side][index] = rev + 1;
        }
        continue;
      }
      for (let index = was + 1; index <= now; index += 1) {
        const rev = Number(revs[side][index]) || 0;
        notes.push({
          id: goalNoteId(match.id, side, index, rev),
          matchId: match.id,
          kind: 'goal',
          ...goalCopy(match, side),
          side,
          match,
        });
      }
    }
    // Half-time only when the feed actually shows the break. A match first seen as finished is not half-time.
    if (before.status !== 'halftime' && before.status !== 'finished' && match.status === 'halftime') {
      notes.push({ id: `${match.id}:ht`, matchId: match.id, kind: 'ht', ...halfTimeCopy(match), match });
    }
    if (before.status !== 'finished' && match.status === 'finished') {
      notes.push({ id: `${match.id}:ft`, matchId: match.id, kind: 'ft', ...fullTimeCopy(match), match });
    }
    const seen = new Set((before.incidents || []).map((item) => item.key));
    for (const incident of match.incidents || []) {
      if (seen.has(incident.key)) continue;
      const title = incident.type === 'red' ? 'Red card' : incident.type === 'penalty' ? 'Penalty' : 'VAR';
      const player = incident.player || title;
      notes.push({
        // Same id the phone's own watcher builds, so the two never post the same card twice.
        id: `${match.id}:${incident.type}:${incident.side}:${incident.minute}:${player}`,
        matchId: match.id,
        kind: incident.type,
        ...incidentCopy(match, incident.type, incident.side, { player: incident.player, minute: incident.minute }),
        player: incident.player || '',
        side: incident.side,
        minute: incident.minute,
        match,
      });
    }
    if (match.varReview && !before.varReview) {
      notes.push({
        id: `${match.id}:var:${match.varReview.minute}:${match.varReview.player || 'Goal'}`,
        matchId: match.id,
        kind: 'var',
        ...varReviewCopy(match, reviewSide(match), { player: match.varReview.player, minute: match.varReview.minute }),
        player: match.varReview.player || '',
        side: reviewSide(match),
        minute: match.varReview.minute,
        match,
      });
    }
  }
  return notes;
}

/** How long a live row may be missing from the feed before it is forgotten. */
export const CARRY_MS = 12 * 60 * 1000;

/**
 * The live list sometimes drops a match for a poll or two, and it never lists
 * a finished match. Keep the last row for a while so the next poll still has
 * something to diff against instead of losing goals or re-sending kick-off.
 */
export function carryForward(previous, next, now = Date.now()) {
  const ids = new Set((next || []).map((match) => match.id));
  const out = [...(next || [])];
  for (const row of previous || []) {
    if (!row || ids.has(row.id)) continue;
    if (row.status !== 'live' && row.status !== 'halftime') continue;
    const since = Number(row.missingSince) || now;
    if (now - since > CARRY_MS) continue;
    out.push({ ...row, missingSince: since });
  }
  return out;
}

/**
 * A followed match that left the live list late in the second half has usually
 * ended. `detail` is SportyBet's own event row; only its final status is trusted.
 */
export function finishedFromDetail(row, detail) {
  if (!row || !detail || typeof detail !== 'object') return null;
  const status = liveStatus(detail.matchStatus, detail.status);
  if (status !== 'finished') return null;
  const score = pair(detail.setScore);
  return {
    ...row,
    status: 'finished',
    homeScore: score ? score[0] : row.homeScore,
    awayScore: score ? score[1] : row.awayScore,
    missingSince: undefined,
  };
}

function clubKey(name) {
  return looseKey(expandAlias(String(name || '')));
}

/** A followed team matches the live row by id, by slug, or by the same club name. */
export function teamFollows(team, match) {
  if (!team || !match) return false;
  const ids = [match.homeId, match.awayId, match.homeCompetitor, match.awayCompetitor].filter(Boolean);
  const storedId = String(team.id || '');
  if (storedId && ids.includes(storedId)) return true;
  const storedName = String(team.name || '');
  if (storedName && (teamSlug(storedName) === match.homeId || teamSlug(storedName) === match.awayId)) return true;
  const key = clubKey(storedName || storedId.replace(/-/g, ' '));
  if (!key) return false;
  return key === clubKey(match.home) || key === clubKey(match.away);
}

function follows(device, match) {
  const book = device.follows || {};
  if ((book.matches || []).includes(match.id)) return true;
  return (book.teams || []).some((team) => teamFollows(team, match));
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
      ...trendCopy(match, label),
      marketLabel: label,
      fixture: fixtureLine(match),
      match,
    });
  }
  return notes;
}

/** A booked builder slip. Omitted means "leave the stored slip alone". Null clears it. */
export function builderSlipFrom(body) {
  if (!body || !Object.prototype.hasOwnProperty.call(body, 'builderSlip')) return undefined;
  const slip = body.builderSlip;
  if (!slip || typeof slip !== 'object') return null;
  const id = String(slip.id || '').slice(0, 80);
  const legs = (Array.isArray(slip.legs) ? slip.legs : []).slice(0, 200).map((leg) => {
    const eventId = String(leg?.eventId || '');
    const market = String(leg?.market || '');
    const odds = Number(leg?.odds);
    if (!/^sr:match:\d+$/.test(eventId) || !market || !priceInRange(market, odds, leg)) return null;
    return {
      key: `${eventId}|${market}`,
      eventId,
      market,
      home: String(leg.home || '').slice(0, 80),
      away: String(leg.away || '').slice(0, 80),
      odds,
      label: String(leg.label || market).slice(0, 80),
    };
  }).filter(Boolean);
  if (!id || !legs.length) return null;
  return { id, label: String(slip.label || '').slice(0, 80), legs };
}

/** Every tracked slip. Omitted means "leave the stored list alone". An empty list clears it. */
export function builderSlipsFrom(body) {
  if (!body || !Object.prototype.hasOwnProperty.call(body, 'builderSlips')) return undefined;
  const rows = Array.isArray(body.builderSlips) ? body.builderSlips : [];
  return rows.slice(0, 12).map((slip) => builderSlipFrom({ builderSlip: slip })).filter(Boolean);
}

export function trackedSlipsOf(device) {
  if (Array.isArray(device?.builderSlips) && device.builderSlips.length) return device.builderSlips;
  if (device?.builderSlip?.id && Array.isArray(device.builderSlip.legs) && device.builderSlip.legs.length) return [device.builderSlip];
  return [];
}

function slipCopy(legs, progress) {
  const rows = legs.map((leg) => ({ ...leg, ...(progress[leg.key] || {}) }));
  if (rows.some((row) => !row.status)) return null;
  const played = rows.filter((row) => row.status === 'won' || row.status === 'lost');
  if (!played.length) return null;
  const won = played.filter((row) => row.status === 'won');
  const lost = played.filter((row) => row.status === 'lost');
  const missed = lost[0];
  const title = lost.length ? `Slip lost · ${won.length} of ${played.length} legs won` : `Slip won · ${won.length} of ${played.length} legs`;
  const landed = legList(won, (row) => legScore(row), 3);
  const landedLine = landed ? `${landed} landed.` : '';
  const body = missed
    ? `${legScore(missed)} missed ${missed.label}.${landedLine ? ` ${landedLine}` : ''}`.replace(/\s+/g, ' ').trim()
    : landedLine;
  return { title, body, kind: lost.length ? 'bust' : 'win' };
}

/**
 * One alert for a tracked slip, and only after every leg has a final score.
 * Progress is kept on the device so a match that has left the live list is not asked again.
 */
export function slipNote(device, matches) {
  const slip = device?.builderSlip;
  if (!slip?.id || !Array.isArray(slip.legs) || !slip.legs.length) return null;
  const progress = { ...(device.slipProgress || {}) };
  let changed = false;
  for (const leg of slip.legs) {
    if (progress[leg.key]?.status) continue;
    const match = (matches || []).find((item) => item.id === leg.eventId);
    if (!match || match.status !== 'finished' || match.homeScore == null || match.awayScore == null) continue;
    const ht = Number.isFinite(match.htHome) && Number.isFinite(match.htAway) ? { home: match.htHome, away: match.htAway } : null;
    const status = gradePick(leg.market, { home: match.homeScore, away: match.awayScore }, ht);
    if (status === 'open') continue;
    progress[leg.key] = { status, ft: `${match.homeScore}-${match.awayScore}`, home: match.home || leg.home, away: match.away || leg.away, label: leg.label };
    changed = true;
  }
  if (changed) device.slipProgress = progress;
  const copy = slipCopy(slip.legs, progress);
  if (!copy) return { note: null, changed };
  return {
    changed,
    note: {
      id: `slip:${slip.id}`,
      matchId: '',
      kind: 'slip',
      title: copy.title,
      body: copy.body,
      route: 'slip',
      marketLabel: copy.title,
      fixture: copy.body,
    },
  };
}

/**
 * One win or lose card per tracked slip, after every leg of that slip has a score.
 * The kind is win or bust so the phone plays it on the goal-sound path.
 */
export function slipNotes(device, matches) {
  const slips = trackedSlipsOf(device);
  if (!slips.length) return { notes: [], changed: false };
  const bag = { ...(device.slipProgressBySlip || {}) };
  if (device.builderSlip?.id && device.slipProgress && !bag[device.builderSlip.id]) bag[device.builderSlip.id] = { ...device.slipProgress };
  const notes = [];
  let changed = false;
  for (const slip of slips) {
    const progress = { ...(bag[slip.id] || {}) };
    let slipChanged = false;
    for (const leg of slip.legs) {
      if (progress[leg.key]?.status) continue;
      const match = (matches || []).find((item) => item.id === leg.eventId);
      if (!match || match.status !== 'finished' || match.homeScore == null || match.awayScore == null) continue;
      const ht = Number.isFinite(match.htHome) && Number.isFinite(match.htAway) ? { home: match.htHome, away: match.htAway } : null;
      const status = gradePick(leg.market, { home: match.homeScore, away: match.awayScore }, ht);
      if (status === 'open') continue;
      progress[leg.key] = { status, ft: `${match.homeScore}-${match.awayScore}`, home: match.home || leg.home, away: match.away || leg.away, label: leg.label };
      slipChanged = true;
    }
    if (slipChanged) {
      bag[slip.id] = progress;
      changed = true;
    }
    const copy = slipCopy(slip.legs, progress);
    if (!copy) continue;
    notes.push({
      id: `slip:${slip.id}`,
      matchId: '',
      kind: copy.kind,
      title: copy.title,
      body: copy.body,
      route: 'slip',
      marketLabel: copy.title,
      fixture: copy.body,
    });
  }
  if (changed) device.slipProgressBySlip = bag;
  return { notes, changed };
}

/** Slips with the bell on. Omitted means "leave the stored bells alone". An empty list clears them. */
export function slipBellsFrom(body) {
  if (!body || !Object.prototype.hasOwnProperty.call(body, 'slipBells')) return undefined;
  const rows = Array.isArray(body.slipBells) ? body.slipBells : [];
  return rows.slice(0, 12).map((slip) => {
    const id = String(slip?.id || '').slice(0, 120);
    const seen = new Set();
    const legs = (Array.isArray(slip?.legs) ? slip.legs : []).slice(0, 60).map((leg) => {
      const eventId = String(leg?.eventId || '');
      const market = String(leg?.market || '');
      if (!/^sr:match:\d+$/.test(eventId) || !/^[a-z0-9-]{2,24}$/.test(market)) return null;
      const key = `${eventId}|${market}`;
      if (seen.has(key)) return null;
      seen.add(key);
      const odds = Number(leg?.odds);
      return {
        key,
        eventId,
        market,
        home: String(leg.home || '').slice(0, 80),
        away: String(leg.away || '').slice(0, 80),
        odds: Number.isFinite(odds) ? odds : null,
        label: String(leg.label || market).slice(0, 80),
      };
    }).filter(Boolean);
    if (!id || !legs.length) return null;
    return { id, label: String(slip?.label || '').slice(0, 80), legs };
  }).filter(Boolean);
}

/** Keep the settled results of bells the phone still has, drop the rest. */
export function keepBellProgress(progress, bells) {
  const keep = {};
  for (const bell of bells || []) if (progress?.[bell.id]) keep[bell.id] = progress[bell.id];
  return keep;
}

/**
 * Belled slips: one push per leg as soon as it is won or lost, full team names,
 * then one for the whole slip once every leg has a result.
 * A leg can be won before full time (over 1.5 at the second goal); a loss waits for the market to be dead.
 */
export function bellNotes(device, matches) {
  const bells = Array.isArray(device?.slipBells) ? device.slipBells : [];
  if (!bells.length) return { notes: [], changed: false };
  const progress = { ...(device.bellProgress || {}) };
  const notes = [];
  let changed = false;
  for (const bell of bells) {
    const done = { ...(progress[bell.id] || {}) };
    for (const leg of bell.legs || []) {
      if (done[leg.key]?.status) continue;
      const match = (matches || []).find((item) => item.id === leg.eventId);
      if (!match) continue;
      const verdict = settleTrend(leg.market, match);
      if (verdict === 'open') continue;
      const status = verdict === 'won' ? 'won' : 'lost';
      const ft = match.homeScore != null && match.awayScore != null ? `${match.homeScore}-${match.awayScore}` : '';
      done[leg.key] = { status, ft, home: leg.home || match.home, away: leg.away || match.away, label: leg.label };
      changed = true;
      const settled = (bell.legs || []).filter((row) => done[row.key]?.status).length;
      const row = { home: leg.home || match.home, away: leg.away || match.away, ft };
      notes.push({
        id: `slipleg:${bell.id}:${leg.key}`,
        matchId: leg.eventId,
        kind: status === 'won' ? 'win' : 'bust',
        title: `${status === 'won' ? 'Leg won' : 'Leg lost'} · ${leg.label}`,
        body: `${legScore(row)}${leg.odds ? ` · ${Number(leg.odds).toFixed(2)}` : ''} · ${settled} of ${bell.legs.length} settled`,
        marketLabel: leg.label,
        market: leg.market,
        fixture: legFixture(row),
        odds: leg.odds ? Number(leg.odds).toFixed(2) : '',
        route: 'slip',
        match: { ...match, home: row.home, away: row.away },
      });
    }
    progress[bell.id] = done;
    // A tracked slip already sends its own one-off card under the same id.
    const trackedIds = new Set(trackedSlipsOf(device).map((slip) => slip.id));
    if (device?.builderSlip?.id) trackedIds.add(device.builderSlip.id);
    if (trackedIds.has(bell.id)) continue;
    const copy = slipCopy(bell.legs || [], done);
    if (copy) {
      notes.push({
        id: `slip:${bell.id}`,
        matchId: '',
        kind: 'slip',
        title: copy.title,
        body: copy.body,
        route: 'slip',
        marketLabel: copy.title,
        fixture: copy.body,
      });
    }
  }
  if (changed) device.bellProgress = progress;
  return { notes, changed };
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
        promos: settings.promos === true,
        lineups: settings.lineups !== false,
        lineupBig: settings.lineupBig === true,
        bankerCodes: Array.isArray(settings.bankerCodes) ? settings.bankerCodes.filter((id) => typeof id === 'string').slice(0, 8) : [],
      },
      appVersion: cleanVersion(body?.appVersion),
      builderSlip: null,
      builderSlips: null,
      slipBells: slipBellsFrom(body) || [],
      lineupOff: Array.isArray(body?.lineupOff) ? body.lineupOff.filter((id) => typeof id === 'string').slice(0, 200) : [],
      sent: [],
      updatedAt: new Date().toISOString(),
    },
  };
}

function storedSlips(body, existing) {
  const listed = builderSlipsFrom(body);
  if (listed) return { slips: listed, slip: listed[0] || null };
  const single = builderSlipFrom(body);
  if (single) return { slips: [single], slip: single };
  if (builderSlipsFrom(body) === undefined && builderSlipFrom(body) === undefined && body && !Object.prototype.hasOwnProperty.call(body, 'builderSlip') && !Object.prototype.hasOwnProperty.call(body, 'builderSlips')) {
    const slips = Array.isArray(existing?.builderSlips) && existing.builderSlips.length ? existing.builderSlips : existing?.builderSlip ? [existing.builderSlip] : [];
    return { slips, slip: slips[0] || null };
  }
  return { slips: [], slip: null };
}

function keepSlipProgress(progress, slips) {
  const keep = {};
  for (const slip of slips || []) if (progress?.[slip.id]) keep[slip.id] = progress[slip.id];
  return keep;
}

function readDeviceFile(path) {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    if (!Array.isArray(parsed)) return { ok: false, devices: [] };
    const devices = parsed.filter((item) => item && typeof item.token === 'string' && item.token);
    return { ok: true, devices };
  } catch {
    return { ok: false, devices: [] };
  }
}

export function createDeviceBook(dir) {
  const file = join(dir, 'devices.json');
  let devices = load();

  function load() {
    const primary = readDeviceFile(file);
    if (primary.ok) return primary.devices;
    for (const extra of [`${file}.bak`, `${file}.tmp`]) {
      const copy = readDeviceFile(extra);
      if (!copy.ok || !copy.devices.length) continue;
      console.error(`[push] Restored ${copy.devices.length} device registrations from ${extra.slice(file.length + 1) || 'backup'}.`);
      try {
        safeWriteFile(file, JSON.stringify(copy.devices));
      } catch (error) {
        console.error(`[push] Could not write the restored device list: ${error instanceof Error ? error.message : error}`);
      }
      return copy.devices;
    }
    console.error('[push] Device list could not be read and no backup was found.');
    return [];
  }

  function save() {
    try {
      mkdirSync(dir, { recursive: true });
      const current = readDeviceFile(file);
      if (current.ok && current.devices.length) safeWriteFile(`${file}.bak`, JSON.stringify(current.devices));
      safeWriteFile(file, JSON.stringify(devices));
    } catch (error) {
      console.error(`[push] Could not store device registrations: ${error instanceof Error ? error.message : error}`);
    }
  }

  return {
    list: () => devices,
    register(body, meta = {}) {
      const accepted = acceptDevice(body);
      if (accepted.error) return accepted;
      const existing = devices.find((item) => item.token === accepted.device.token);
      const now = new Date().toISOString();
      const slips = storedSlips(body, existing);
      const device = {
        ...accepted.device,
        follows: body?.follows == null && existing?.follows ? existing.follows : accepted.device.follows,
        trends: body?.trends == null && existing?.trends ? existing.trends : accepted.device.trends,
        builderSlip: slips.slip,
        builderSlips: slips.slips,
        lineupOff: Array.isArray(body?.lineupOff) ? accepted.device.lineupOff : existing?.lineupOff || [],
        slipProgress: slips.slip?.id && existing?.builderSlip?.id === slips.slip.id ? existing?.slipProgress || {} : {},
        slipProgressBySlip: keepSlipProgress(existing?.slipProgressBySlip, slips.slips),
        slipBells: slipBellsFrom(body) === undefined ? existing?.slipBells || [] : accepted.device.slipBells,
        bellProgress: keepBellProgress(existing?.bellProgress, slipBellsFrom(body) === undefined ? existing?.slipBells || [] : accepted.device.slipBells),
        sent: existing?.sent || [],
        appVersion: accepted.device.appVersion || (typeof existing?.appVersion === 'string' ? existing.appVersion : ''),
        country: cleanCountry(meta?.country) || cleanCountry(existing?.country) || null,
        firstSeenAt: existing?.firstSeenAt || existing?.updatedAt || now,
        lastSeenAt: now,
      };
      delete device.ip;
      delete device.address;
      // A refreshed FCM token replaces the old one. The phone names it so the old token is not left to fail.
      const previous = typeof body?.previousToken === 'string' ? body.previousToken.trim() : '';
      const replaced = previous && previous !== device.token ? devices.find((item) => item.token === previous) : null;
      if (replaced) {
        device.sent = [...new Set([...(device.sent || []), ...(replaced.sent || [])])].slice(0, 400);
        if (body?.follows == null && replaced.follows) device.follows = replaced.follows;
        if (body?.trends == null && replaced.trends) device.trends = replaced.trends;
        device.firstSeenAt = replaced.firstSeenAt || device.firstSeenAt;
      }
      devices = [device, ...devices.filter((item) => item.token !== device.token && item.token !== previous)].slice(0, 5000);
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
    persist() {
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

/**
 * FCM answers 404 UNREGISTERED for an uninstalled app, 400 INVALID_ARGUMENT for a
 * malformed token, and 403 SENDER_ID_MISMATCH for a token from another project.
 * Each is permanent, so the token is removed instead of failing every goal.
 */
export function tokenIsDead(status, body) {
  if (status === 404 || status === 410) return true;
  const error = body && typeof body.error === 'object' ? body.error : {};
  const details = Array.isArray(error.details) ? error.details : [];
  const codes = details.map((item) => String(item?.errorCode || '')).filter(Boolean);
  if (codes.includes('UNREGISTERED') || codes.includes('SENDER_ID_MISMATCH')) return true;
  if (status === 403 && String(error.status || '') === 'PERMISSION_DENIED' && codes.includes('SENDER_ID_MISMATCH')) return true;
  if (status === 400 && /registration token/i.test(String(error.message || ''))) return true;
  return false;
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
  if (tokenIsDead(response.status, body)) return { dropped: true, ok: false, status: response.status, body };
  if (!response.ok) {
    const error = new Error(`FCM returned ${response.status}`);
    error.fcm = publicFcm(body);
    error.status = response.status;
    error.retryable = response.status === 429 || response.status >= 500;
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
  if (known?.settings?.promos !== true) return { ok: false, error: 'That phone has Promos turned off.', sent: 0 };
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
    if (device?.settings?.promos !== true) continue;
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
  const sample = { home: 'Arsenal', away: 'Chelsea', homeScore: 2, awayScore: 1, competition: 'Premier League' };
  const copy = {
    goal: { ...goalCopy({ ...sample, minute: 54 }, 'home', { player: 'Saka' }), minute: 54, player: 'Saka', side: 'home' },
    kickoff: { ...kickoffCopy(sample), minute: 1 },
    win: { ...trendCopy(sample, 'Over 2.5 goals'), minute: 54 },
    red: { ...incidentCopy(sample, 'red', 'away', { player: 'Keeper', minute: 50 }), minute: 50, player: 'Keeper', side: 'away' },
    var: { ...varReviewCopy(sample, 'home', { player: 'Saka', minute: 54 }), minute: 54, player: 'Saka', side: 'home' },
    penalty: { ...incidentCopy(sample, 'penalty', 'home', { player: 'Saka', minute: 61 }), minute: 61, player: 'Saka', side: 'home' },
  }[kind];
  const note = {
    id: `test:${kind}:${Date.now()}`,
    matchId,
    kind,
    title: copy.title,
    body: copy.body,
    player: copy.player || '',
    side: copy.side || '',
    minute: copy.minute,
    market: kind === 'win' ? 'over25' : '',
    marketLabel: kind === 'win' ? 'Over 2.5 goals' : '',
    trendId: kind === 'win' ? `${matchId}:over25` : '',
    fixture: fixtureLine(sample),
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
    try {
      mkdirSync(dir, { recursive: true });
      safeWriteFile(file, JSON.stringify(rows));
    } catch (error) {
      console.error(`[push] Could not store the alert log: ${error instanceof Error ? error.message : error}`);
    }
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

/** Drop unusable tokens and tokens the phone has not refreshed for a long time. */
export function pruneStaleDevices(book, { maxAgeMs = 60 * 24 * 60 * 60 * 1000, now = Date.now() } = {}) {
  let removed = 0;
  const rows = [...(book?.list?.() || [])];
  for (const device of rows) {
    const token = String(device?.token || '');
    const seen = Date.parse(device?.lastSeenAt || '');
    const expired = Number.isFinite(seen) && now - seen > maxAgeMs;
    if (token.trim().length < 20 || /\s/.test(token) || expired) {
      book.drop(token);
      removed += 1;
    }
  }
  return removed;
}

export function baselinePath(dir) {
  return join(dir, 'push-baseline.json');
}

/** Last scores the watcher compared. A restart reads this instead of treating the next poll as the first. */
export function readScoreBaseline(dir, { maxAgeMs = BASELINE_MAX_AGE_MS, now = Date.now() } = {}) {
  try {
    const file = baselinePath(dir);
    // After a long outage the stored scores are too old to diff. Goals from then would land as stale alerts.
    if (maxAgeMs > 0 && now - statSync(file).mtimeMs > maxAgeMs) return null;
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** A restart or deploy within this window still sends the goals it missed. Older baselines are re-seeded silently. */
export const BASELINE_MAX_AGE_MS = 8 * 60 * 1000;

export function writeScoreBaseline(dir, matches) {
  mkdirSync(dir, { recursive: true });
  const slim = (matches || []).map((match) => ({
    id: match.id,
    home: match.home,
    away: match.away,
    homeId: match.homeId,
    awayId: match.awayId,
    status: match.status,
    minute: match.minute,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    htHome: match.htHome,
    htAway: match.htAway,
    incidents: Array.isArray(match.incidents) ? match.incidents : [],
    varReview: match.varReview || null,
    revs: match.revs || undefined,
    missingSince: match.missingSince || undefined,
  }));
  try {
    safeWriteFile(baselinePath(dir), JSON.stringify(slim));
  } catch (error) {
    console.error(`[push] Could not store the score baseline: ${error instanceof Error ? error.message : error}`);
  }
}

function readLiveCurl() {
  return new Promise((resolve, reject) => {
    const child = spawn('curl', [
      '-4', '-sS', '-m', '40',
      '-A', LIVE_HEADERS['User-Agent'],
      '-H', `Accept: ${LIVE_HEADERS.Accept}`,
      '-H', `Referer: ${LIVE_HEADERS.Referer}`,
      LIVE,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = [];
    child.stdout.on('data', (buf) => chunks.push(buf));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`In-play scores curl exited ${code}`));
        return;
      }
      try {
        const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!Array.isArray(payload?.data)) throw new Error('not a list');
        resolve(payload);
      } catch {
        reject(new Error('In-play scores curl was not JSON'));
      }
    });
  });
}

async function readLiveFeed(fetchImpl, { timeoutMs = 45_000, allowCurl = false } = {}) {
  try {
    const response = await fetchImpl(LIVE, {
      headers: LIVE_HEADERS,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`In-play scores returned ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload?.data)) throw new Error('In-play scores were not a list');
    return { payload, fallback: false };
  } catch (error) {
    if (!allowCurl) throw error;
    try {
      return { payload: await readLiveCurl(), fallback: true };
    } catch {
      throw error;
    }
  }
}

export const RETRY_LIMIT = 3;
export const RETRY_WINDOW_MS = 5 * 60 * 1000;

/** Match ids any phone follows directly, by team, or through a followed trend. */
export function watchedMatchIds(devices, matches) {
  const ids = new Set();
  for (const device of devices || []) {
    for (const id of device?.follows?.matches || []) ids.add(id);
    for (const trend of device?.trends || []) {
      const cut = String(trend).lastIndexOf(':');
      if (cut > 0) ids.add(String(trend).slice(0, cut));
    }
    for (const slip of trackedSlipsOf(device)) for (const leg of slip?.legs || []) if (leg?.eventId) ids.add(String(leg.eventId));
    for (const bell of device?.slipBells || []) for (const leg of bell?.legs || []) if (leg?.eventId) ids.add(String(leg.eventId));
    for (const match of matches || []) {
      if ((device?.follows?.teams || []).some((team) => teamFollows(team, match))) ids.add(match.id);
    }
  }
  return ids;
}

const EVENT_DETAIL = 'https://www.sportybet.com/api/gh/factsCenter/event?eventId=';

async function readEventDetail(fetchImpl, eventId) {
  const response = await fetchImpl(`${EVENT_DETAIL}${encodeURIComponent(eventId)}`, {
    headers: LIVE_HEADERS,
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Event detail returned ${response.status}`);
  const json = await response.json();
  return json && typeof json.data === 'object' ? json.data : null;
}

export function startPushWatch(options = {}) {
  const dir = options.dir || process.env.ENGINE_DATA_DIR || join(process.cwd(), 'data', 'engine');
  const env = options.env || process.env;
  const deliver = options.send || sendMessage;
  const book = options.book || createDeviceBook(dir);
  const alerts = options.alerts || createAlertLog(dir);
  const log = options.log || ((message) => console.log(`[push] ${message}`));
  const intervalMs = options.intervalMs ?? 25_000;
  const clock = options.now || (() => Date.now());
  let baseline = readScoreBaseline(dir, { now: clock() });
  let baselineAt = clock();
  let pending = [];
  const detailFetch = options.detailImpl || ((id) => readEventDetail(options.fetchImpl || fetch, id));
  const checkedGone = new Map();

  /** Rows that left the live list late in the game: ask SportyBet once whether they ended. */
  async function settleVanished(matches, fresh) {
    const liveIds = new Set(fresh.map((row) => row.id));
    const watched = watchedMatchIds(book.list(), matches);
    const out = [];
    for (const row of matches) {
      if (liveIds.has(row.id) || !row.missingSince || !watched.has(row.id)) {
        out.push(row);
        continue;
      }
      const lateGame = row.status === 'live' && Number.isFinite(row.minute) && row.minute >= 80;
      const last = checkedGone.get(row.id) || 0;
      if (!lateGame || clock() - last < 60_000) {
        out.push(row);
        continue;
      }
      checkedGone.set(row.id, clock());
      try {
        const ended = finishedFromDetail(row, await detailFetch(row.id));
        out.push(ended || row);
      } catch {
        out.push(row);
      }
    }
    for (const [id, at] of checkedGone) if (clock() - at > CARRY_MS * 2) checkedGone.delete(id);
    return out;
  }
  let warned = false;
  let announced = false;
  let curlAnnounced = false;
  let ticking = false;
  let timer = null;
  let lastQuietLog = 0;
  const stats = { feedOk: null, feedAt: null, feedError: null, sentOk: 0, sentError: 0, lastSendAt: null };

  async function tick() {
    if (ticking) return;
    ticking = true;
    try {
      await runTick();
    } finally {
      ticking = false;
    }
  }

  async function runTick() {
    const account = serviceAccount(env);
    const configured = fcmConfigured(env);
    if (!configured && !warned) {
      warned = true;
      log('FCM service account is not set. Devices can register. Nothing is pushed.');
    }
    if (configured && !announced) {
      announced = true;
      log(`FCM HTTP v1 is on for project ${account.project_id}. Devices registered: ${book.list().length}. The list is stored with the engine data.`);
    }
    let payload;
    try {
      const loaded = await readLiveFeed(options.fetchImpl || fetch, {
        timeoutMs: options.timeoutMs ?? 45_000,
        allowCurl: !options.fetchImpl,
      });
      payload = loaded.payload;
      if (loaded.fallback && !curlAnnounced) {
        curlAnnounced = true;
        log('Live feed fetch failed. Reading scores over IPv4 instead.');
      }
      stats.feedOk = true;
      stats.feedAt = new Date().toISOString();
      stats.feedError = null;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Live feed failed';
      stats.feedOk = false;
      stats.feedAt = new Date().toISOString();
      stats.feedError = message;
      log(`Live feed failed: ${message}`);
      return;
    }
    const now = clock();
    const fresh = normalizeLive(payload);
    if (!baseline || now - baselineAt > BASELINE_MAX_AGE_MS) {
      // First look, or the last good poll is too old: store scores without alerting on stale changes.
      baseline = fresh;
      baselineAt = now;
      pending = [];
      try {
        writeScoreBaseline(dir, fresh);
      } catch (error) {
        log(`Could not store the score baseline: ${error instanceof Error ? error.message : error}`);
      }
      return;
    }
    let matches = carryForward(baseline, fresh, now);
    matches = await settleVanished(matches, fresh);
    const notes = diffMatches(baseline, matches);
    const previous = baseline;
    baseline = matches.filter((row) => row.status !== 'finished');
    baselineAt = now;
    try {
      writeScoreBaseline(dir, baseline);
    } catch (error) {
      log(`Could not store the score baseline: ${error instanceof Error ? error.message : error}`);
    }
    if (!configured) return;
    const logged = new Set();
    let sentOk = 0;
    let sentError = 0;
    let matched = 0;
    const queue = [];
    // Retries first: a 429 or 5xx from the last poll is still worth sending while it is fresh.
    for (const row of pending) {
      if (now - row.at > RETRY_WINDOW_MS || row.attempts >= RETRY_LIMIT) continue;
      const device = book.list().find((item) => item.token === row.token);
      if (device) queue.push({ device, item: row.item, attempts: row.attempts, at: row.at });
    }
    pending = [];
    for (const device of book.list()) {
      const slip = slipNotes(device, matches);
      const bell = bellNotes(device, matches);
      if (slip?.changed || bell.changed) book.persist();
      const mine = [...notesForDevice(notes, device), ...trendNotes(previous, matches, device), ...slip.notes, ...bell.notes];
      if (mine.length) matched += 1;
      for (const item of mine) queue.push({ device, item: { ...item, sentAt: now }, attempts: 0, at: now });
    }
    const dropped = new Set();
    for (const { device, item, attempts, at } of queue) {
      if (dropped.has(device.token)) continue;
      if (book.alreadySent(device.token, item.id)) continue;
      try {
        const result = await deliver(account, messageFor(item, device));
        const fcm = publicFcm(result.body);
        if (result.dropped) {
          sentError += 1;
          dropped.add(device.token);
          book.drop(device.token);
          log(`FCM dropped a dead token: ${result.status} ${JSON.stringify(fcm)}`);
        } else {
          sentOk += 1;
          book.remember(device.token, item.id);
          if (!logged.has(item.id)) {
            logged.add(item.id);
            alerts.record(item);
          }
        }
      } catch (error) {
        sentError += 1;
        const fcm = error && error.fcm ? ` ${JSON.stringify(error.fcm)}` : '';
        const retry = !error || error.retryable !== false;
        if (retry) pending.push({ token: device.token, item, attempts: attempts + 1, at });
        log(`Push failed${retry ? ' (will retry)' : ''}: ${error instanceof Error ? error.message : error}${fcm}`);
      }
    }
    if (sentOk || sentError) {
      stats.sentOk += sentOk;
      stats.sentError += sentError;
      stats.lastSendAt = new Date().toISOString();
      log(`FCM sent success=${sentOk} error=${sentError}`);
    } else if ((notes.length || matches.length) && Date.now() - lastQuietLog > 15 * 60 * 1000) {
      lastQuietLog = Date.now();
      log(`Live matches ${matches.length}. Score changes ${notes.length}. Phones ${book.list().length}. Followed matches among them ${matched}.`);
    }
  }

  function start() {
    if (timer) return book;
    timer = setInterval(() => void tick(), intervalMs);
    timer.unref?.();
    void tick();
    return book;
  }

  async function post(item, device) {
    if (!item?.id || !device?.token || !fcmConfigured(env) || book.alreadySent(device.token, item.id)) return false;
    const account = serviceAccount(env);
    if (!account) return false;
    try {
      const result = await deliver(account, messageFor({ ...item, sentAt: Date.now() }, device));
      if (result.dropped) {
        book.drop(device.token);
        return false;
      }
      book.remember(device.token, item.id);
      alerts.record(item);
      return true;
    } catch (error) {
      log(`Push failed: ${error instanceof Error ? error.message : error}`);
      return false;
    }
  }

  return {
    book,
    alerts,
    start,
    tick,
    post,
    stats: () => ({ ...stats }),
  };
}
