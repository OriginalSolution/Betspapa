/**
 * Banker Codes. SportyBet and Football.com share codes only.
 * Seeded codes are read back and never rebooked. The refresh button
 * only reads back. Predict2u is not called.
 */
import { readFileSync } from 'node:fs';
import { safeWriteFile } from './safeWrite.mjs';
import { join } from 'node:path';
import {
  DAILY_ODDS_TARGET,
  FOOTBALL_SHARE,
  HIGH_RISK_UNDER,
  HIGH_RISK_WARNING,
  ODDS_LABEL,
  READBACK_BEFORE_KO_MS,
  READBACK_EVERY_MS,
  READBACK_FROM_HOUR,
  READBACK_TO_HOUR,
  SEED_CODES,
  SPORTY_SHARE,
  STRATEGIES,
  U45_PART,
  addDays,
  isUnder45Strategy,
  dueDaily,
  dueWeek,
  gmtParts,
  isoDay,
  parseDay,
  rulesFor,
  shortDow,
  slotKey,
  strategyById,
  weekDays,
  weekMonday,
} from './bankerConfig.mjs';
import { collectCandidates, collectUnder45, coverageFromEvents, mapPool } from './bankerFeed.mjs';
import { bookShare, readCode, readDesk, sameSelections } from './bankerRead.mjs';
import { assemble, priceStillOk, productOdds } from './bankerRules.mjs';
import { legFixture, legList, legScore } from '../src/lib/noteCopy.mjs';

function emptyState(now) {
  return {
    version: 1,
    since: new Date(now).toISOString(),
    codes: {},
    order: {},
    empty: {},
    notices: [],
    pending: [],
    sent: {},
    readAt: '',
    ready: false,
  };
}

function readState(file, now) {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    if (parsed?.codes && parsed?.order) return { ...emptyState(now), ...parsed };
  } catch {
    /* first run */
  }
  return emptyState(now);
}

function writeState(file, state) {
  safeWriteFile(file, JSON.stringify(state));
}

function sportyLink(code) {
  return `https://www.sportybet.com/gh/?shareCode=${code}`;
}

function footballLink(code) {
  return `https://www.football.com/gh/?shareCode=${code}`;
}

function mixOf(legs) {
  const mix = {};
  for (const leg of legs) {
    const label = /2UP/.test(leg.label) ? '2UP' : /1UP/.test(leg.label) ? '1UP' : /Over 2\.5/.test(leg.label) ? 'Over 2.5' : /2\+/.test(leg.label) ? 'team 2+' : leg.label;
    mix[label] = (mix[label] || 0) + 1;
  }
  return mix;
}

function codeStatus(legs) {
  const states = legs.map((leg) => leg.gradeStatus || leg.bookResult || 'open');
  if (!states.length) return 'open';
  if (states.includes('lost')) return 'lost';
  if (states.every((state) => state === 'void')) return 'void';
  if (states.every((state) => state === 'won' || state === 'void')) return 'won';
  return 'open';
}

function settledCount(legs) {
  return legs.filter((leg) => (leg.gradeStatus || leg.bookResult || 'open') !== 'open').length;
}

function weekLabel(monday) {
  const end = addDays(monday, 6);
  const fmt = (iso) => {
    const date = new Date(parseDay(iso));
    return { day: date.getUTCDate(), month: date.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' }) };
  };
  const left = fmt(monday);
  const right = fmt(end);
  return left.month === right.month ? `Week ${left.day}–${right.day} ${right.month}` : `Week ${left.day} ${left.month}–${right.day} ${right.month}`;
}

function dailyEmpty(day, now) {
  const bookAt = parseDay(addDays(day, -1)) + 21 * 3600000;
  const today = shortDow(day);
  const next = shortDow(addDays(day, 1));
  if (now < bookAt) return `Books ${shortDow(addDays(day, -1))} 21:00 GMT`;
  return `No ${today} code · ${next} books ${today} 21:00 GMT`;
}

function publicLeg(leg, crestFor) {
  const status = leg.gradeStatus || leg.bookResult || 'open';
  return {
    eventId: leg.eventId,
    home: leg.home,
    away: leg.away,
    homeId: leg.homeId || '',
    awayId: leg.awayId || '',
    homeCrest: crestFor ? crestFor(leg.homeId, leg.home) || '' : leg.homeCrest || '',
    awayCrest: crestFor ? crestFor(leg.awayId, leg.away) || '' : leg.awayCrest || '',
    league: leg.league || '',
    tournamentId: leg.tournamentId || '',
    market: leg.grade || '',
    label: leg.label,
    odds: leg.odds,
    kickoff: leg.kickMs ? new Date(leg.kickMs).toISOString() : '',
    score: leg.score || leg.ft || '',
    status,
    mismatch: Boolean(leg.mismatch),
  };
}

/** Code alert wording. Legs are named by their real fixtures, e.g. "3 legs: Arsenal v Chelsea, Real Madrid v Getafe and 1 more." */
export function codeNoticeCopy(row, kind, name, when = '') {
  let title = `${name} ${when}${row.code} booked`;
  const legs = row.legs || [];
  const count = `${legs.length} ${legs.length === 1 ? 'leg' : 'legs'}`;
  const fixtures = legList(legs, legFixture, 2);
  let body = fixtures ? `${count}: ${fixtures}.` : `${count}.`;
  if (kind === 'rebooked') {
    title = `${name} ${row.replaced} replaced by ${row.code}`;
    body = `Open ${row.code}. The previous code is no longer current.`;
  } else if (kind === 'settled') {
    const lost = (row.legs || []).find((leg) => (leg.gradeStatus || leg.bookResult) === 'lost');
    if (lost) {
      title = `${name} ${when}${row.code} lost`;
      body = `${legScore(lost)} missed ${lost.label}.`.replace(/\s+/g, ' ').trim();
    } else {
      title = `${name} ${when}${row.code} won`;
      const scores = legList(legs, (leg) => legScore(leg), 2);
      body = scores ? `${count} landed: ${scores}.` : `All ${count} landed.`;
    }
  }
  return { title, body };
}

export function bankerNote(alert) {
  return {
    id: alert.id,
    kind: 'code',
    title: alert.title,
    body: alert.body,
    route: 'codes',
    fixture: alert.strategy,
    code: alert.code,
    match: {
      id: '',
      home: alert.home || '',
      away: alert.away || '',
      homeCrest: alert.homeCrest || '',
      awayCrest: alert.awayCrest || '',
      status: alert.kind === 'settled' ? 'finished' : 'scheduled',
    },
  };
}

export function bankerWanted(device, alert) {
  const chosen = device?.settings?.bankerCodes;
  return Array.isArray(chosen) && chosen.includes(alert?.strategy);
}

const REFRESH_COOLDOWN_MS = 60 * 1000;

export function createBanker(options = {}) {
  const now = options.now || (() => Date.now());
  const request = options.request;
  const fetchImpl = options.fetchImpl || fetch;
  const log = options.log || console;
  const file = join(options.dir || join(process.cwd(), 'data', 'engine'), 'banker', 'state.json');
  const bookEnabled = options.book !== false && process.env.BANKER_BOOK !== '0';
  let state = readState(file, now());
  let busy = false;
  let coverageSet = new Set();

  function save() {
    try {
      writeState(file, state);
    } catch (error) {
      log.error?.(`[codes] Could not save: ${error instanceof Error ? error.message : error}`);
    }
  }

  function ensureSeed() {
    for (const seed of SEED_CODES) {
      const id = seed.slot === 'week' ? seed.week : seed.day;
      const key = slotKey(seed.strategy, seed.slot, id);
      if (!state.codes[seed.code]) {
        state.codes[seed.code] = {
          code: seed.code,
          strategy: seed.strategy,
          slot: seed.slot,
          week: seed.week || weekMonday(parseDay(seed.day)),
          day: seed.day || '',
          cap: seed.cap || null,
          part: seed.part || 1,
          frozen: true,
          seed: true,
          readOk: false,
          legs: [],
        };
      }
      const list = state.order[key] || [];
      if (!list.includes(seed.code)) state.order[key] = [...list, seed.code].sort((a, b) => (state.codes[a].part || 1) - (state.codes[b].part || 1));
    }
  }

  function applyRead(row, read) {
    const previous = new Map((row.legs || []).map((leg) => [`${leg.eventId}|${leg.marketId}`, leg]));
    row.legs = read.sporty.legs.map((leg) => {
      const prior = previous.get(`${leg.eventId}|${leg.marketId}`);
      return { ...leg, gradeStatus: prior?.gradeStatus || '', ft: prior?.ft || '', mismatch: prior?.mismatch || false };
    });
    row.totalOdds = productOdds(row.legs);
    row.football = Boolean(read.football?.ok);
    row.footballCode = read.football?.code || '';
    row.readOk = true;
    row.readAt = new Date(now()).toISOString();
    row.fail = '';
    const kicks = row.legs.map((leg) => leg.kickMs).filter(Boolean);
    row.firstKick = kicks.length ? Math.min(...kicks) : 0;
    row.lastKick = kicks.length ? Math.max(...kicks) : 0;
  }

  async function readOne(row) {
    try {
      const read = await readCode(request, row.code);
      if (!read.sporty.ok) {
        row.readOk = false;
        row.readAt = new Date(now()).toISOString();
        row.fail = read.sporty.reason || 'readback failed';
        return;
      }
      const before = codeStatus(row.legs || []);
      applyRead(row, read);
      const after = codeStatus(row.legs);
      if ((after === 'lost' || after === 'won') && before !== after) rememberNotice(row, 'settled');
      else if ((after === 'lost' || after === 'won') && !state.sent[`code:${row.code}:settled`]) rememberNotice(row, 'settled');
    } catch (error) {
      row.readOk = false;
      row.fail = error instanceof Error ? error.message : 'readback failed';
    }
  }

  function faceOf(row) {
    const lost = (row.legs || []).find((leg) => (leg.gradeStatus || leg.bookResult) === 'lost');
    return lost || row.legs?.[0] || {};
  }

  function rememberNotice(row, kind) {
    const id = `code:${row.code}:${kind}`;
    if (state.sent[id]) return;
    state.sent[id] = new Date(now()).toISOString();
    const meta = strategyById(row.strategy);
    const name = (meta?.name || row.strategy).replace('Banker ', '');
    const face = faceOf(row);
    const when = row.slot === 'daily' && row.day ? `${shortDow(row.day)} ` : '';
    const { title, body } = codeNoticeCopy(row, kind, name, when);
    const alert = {
      id,
      strategy: row.strategy,
      kind,
      title,
      body,
      code: row.code,
      home: face.home || '',
      away: face.away || '',
      homeCrest: face.homeCrest || '',
      awayCrest: face.awayCrest || '',
    };
    state.notices = [alert, ...state.notices.filter((item) => item.id !== id)].slice(0, 30);
    state.pending.push(alert);
  }

  function shown(key) {
    return (state.order[key] || []).map((code) => state.codes[code]).filter((row) => row?.readOk);
  }

  function partOf(row) {
    const legs = row.legs || [];
    const reasons = [];
    if (row.slot === 'week') reasons.push('Week code');
    if (!(row.totalOdds >= HIGH_RISK_UNDER)) reasons.push('Under 25 total odds');
    const lost = legs.find((leg) => (leg.gradeStatus || leg.bookResult) === 'lost');
    return {
      code: row.code,
      cap: row.cap,
      legs: legs.map((leg) => publicLeg(leg, options.crestFor)),
      legCount: legs.length,
      totalOdds: row.totalOdds,
      highRisk: reasons.length > 0,
      highRiskWhy: reasons.join(' · '),
      link: sportyLink(row.code),
      football: Boolean(row.football),
      footballCode: row.football && row.footballCode && row.footballCode !== row.code ? row.footballCode : row.football ? row.code : '',
      footballLink: row.football ? footballLink(row.footballCode || row.code) : '',
      status: codeStatus(legs),
      settled: settledCount(legs),
      mix: mixOf(legs),
      marketIds: [...new Set(legs.map((leg) => leg.marketId))],
      openCount: legs.filter((leg) => leg.open).length,
      firstKick: row.firstKick ? new Date(row.firstKick).toISOString() : '',
      lastKick: row.lastKick ? new Date(row.lastKick).toISOString() : '',
      readAt: row.readAt || '',
      missed: lost ? `${lost.home} ${lost.score || lost.ft || ''} ${lost.away}`.replace(/\s+/g, ' ').trim() : '',
    };
  }

  function slotView(strategy, slot, id, clock) {
    const key = slotKey(strategy.id, slot, id);
    const parts = shown(key).map(partOf);
    if (parts.length) return { parts, empty: '' };
    if (strategy.id === 'ladder' && slot === 'week') return { parts: [], empty: 'Ladder has dailies only. There is no week code.' };
    if (state.empty[key]?.closest) return { parts: [], empty: `0 qualified. Closest miss: ${state.empty[key].closest.match}, ${state.empty[key].closest.reason}.` };
    if (slot === 'daily') return { parts: [], empty: dailyEmpty(id, clock) };
    return { parts: [], empty: 'No week code in the log.' };
  }

  function nextRead(clock) {
    const parts = gmtParts(clock);
    const hour = parts.hour;
    let next = clock;
    if (hour < READBACK_FROM_HOUR) next = Date.UTC(parts.year, parts.month, parts.date, READBACK_FROM_HOUR);
    else if (hour >= READBACK_TO_HOUR) next = Date.UTC(parts.year, parts.month, parts.date + 1, READBACK_FROM_HOUR);
    else next = Date.UTC(parts.year, parts.month, parts.date, hour + 1);
    return new Date(next).toISOString();
  }

  function view() {
    const clock = now();
    const monday = weekMonday(clock);
    const today = isoDay(clock);
    const days = weekDays(monday);
    const strategies = STRATEGIES.map((strategy) => ({
      id: strategy.id,
      code: strategy.code,
      name: strategy.name,
      rules: rulesFor(strategy.id),
      week: state.ready ? slotView(strategy, 'week', monday, clock) : { parts: [], empty: '' },
      today: state.ready ? slotView(strategy, 'daily', today, clock) : { parts: [], empty: '' },
    }));
    const dailies = {};
    for (const day of days) {
      dailies[day] = {};
      for (const strategy of STRATEGIES) dailies[day][strategy.id] = state.ready ? slotView(strategy, 'daily', day, clock) : { parts: [], empty: '' };
    }
    const record = { since: state.since, strategies: [] };
    for (const strategy of STRATEGIES) {
      const keys = [slotKey(strategy.id, 'week', monday), ...days.map((day) => slotKey(strategy.id, 'daily', day))];
      const legs = keys.flatMap((key) => shown(key)).flatMap((row) => row.legs || []);
      const graded = legs.filter((leg) => leg.gradeStatus === 'won' || leg.gradeStatus === 'lost' || leg.gradeStatus === 'void');
      record.strategies.push({
        id: strategy.id,
        won: graded.filter((leg) => leg.gradeStatus === 'won').length,
        lost: graded.filter((leg) => leg.gradeStatus === 'lost').length,
        void: graded.filter((leg) => leg.gradeStatus === 'void').length,
        open: legs.length - graded.length,
        mismatch: legs.filter((leg) => leg.mismatch).length,
      });
    }
    return {
      oddsLabel: ODDS_LABEL,
      warning: HIGH_RISK_WARNING,
      target: DAILY_ODDS_TARGET,
      reading: !state.ready,
      readAt: state.readAt,
      nextReadAt: nextRead(clock),
      week: { id: monday, from: monday, to: addDays(monday, 6), label: weekLabel(monday) },
      today,
      strategies,
      days,
      dailies,
      record,
      notices: state.notices.slice(0, 8),
    };
  }

  async function readAll() {
    ensureSeed();
    const rows = Object.values(state.codes).filter((row) => !row.superseded);
    await mapPool(rows, 3, (row) => readOne(row));
    state.readAt = new Date(now()).toISOString();
    state.ready = true;
    syncResults();
    save();
  }

  function syncResults() {
    const record = options.results;
    if (!record?.recordBanker) return;
    for (const row of Object.values(state.codes)) {
      if (!row.readOk || !row.legs?.length) continue;
      record.recordBanker({
        code: {
          id: `banker:${row.strategy}:${row.code}`,
          strategy: row.strategy,
          name: strategyById(row.strategy)?.name || row.strategy,
          code: row.code,
          link: sportyLink(row.code),
          totalOdds: row.totalOdds,
          firstKickoff: row.firstKick ? new Date(row.firstKick).toISOString() : '',
        },
        picks: row.legs.map((leg) => ({
          key: `banker:${row.code}:${leg.eventId}|${leg.grade || leg.marketId}`,
          eventId: leg.eventId,
          market: leg.grade || leg.marketId,
          strategy: row.strategy,
          odds: leg.odds,
          kickoff: leg.kickMs ? new Date(leg.kickMs).toISOString() : '',
          home: leg.home,
          away: leg.away,
          homeCrest: leg.homeCrest,
          awayCrest: leg.awayCrest,
          bookResult: leg.bookResult || '',
        })),
      });
    }
  }

  function pullGrades() {
    const record = options.results?.record;
    if (!record?.picks) return;
    for (const row of Object.values(state.codes)) {
      if (!row.legs) continue;
      const before = codeStatus(row.legs);
      for (const leg of row.legs) {
        const pick = record.picks[`banker:${row.code}:${leg.eventId}|${leg.grade || leg.marketId}`];
        if (!pick || pick.status === 'open') continue;
        leg.gradeStatus = pick.status;
        leg.ft = pick.ft || leg.score || '';
        leg.mismatch = Boolean(pick.mismatch);
        if (pick.ft) leg.score = pick.ft.replace('-', '-');
      }
      const after = codeStatus(row.legs);
      if ((after === 'lost' || after === 'won') && after !== before) rememberNotice(row, 'settled');
    }
  }

  function eventCounts(strategy, weekId, except = '') {
    const skip = except instanceof Set ? except : new Set(except ? [except] : []);
    const counts = new Map();
    const keys = [slotKey(strategy, 'week', weekId), ...weekDays(weekId).map((day) => slotKey(strategy, 'daily', day))];
    for (const key of keys) {
      for (const code of state.order[key] || []) {
        if (skip.has(code)) continue;
        const row = state.codes[code];
        if (!row?.readOk) continue;
        for (const leg of row.legs || []) counts.set(leg.eventId, (counts.get(leg.eventId) || 0) + 1);
      }
    }
    return counts;
  }

  async function bookSlot(strategy, slot, id, fromMs, toMs) {
    if (!bookEnabled || !request) return;
    if (strategy === 'ladder' && slot === 'week') return;
    const key = slotKey(strategy, slot, id);
    if (Object.prototype.hasOwnProperty.call(state.order, key)) return;
    const weekId = slot === 'week' ? id : weekMonday(parseDay(id));
    let candidates = [];
    try {
      candidates = isUnder45Strategy(strategy)
        ? await collectUnder45(request, fetchImpl, { fromMs, toMs })
        : await collectCandidates(request, fetchImpl, { fromMs, toMs, coverage: coverageSet });
    } catch (error) {
      log.error?.(`[codes] ${strategy} ${slot} ${id}: ${error instanceof Error ? error.message : error}`);
      return;
    }
    const built = assemble(strategy, candidates, { slot, counts: eventCounts(strategy, weekId) });
    if (!built.legs.length) {
      state.order[key] = [];
      state.empty[key] = { closest: built.closest, at: new Date(now()).toISOString() };
      save();
      return;
    }
    const size = isUnder45Strategy(strategy) ? U45_PART : built.legs.length;
    const groups = [];
    for (let index = 0; index < built.legs.length; index += size) groups.push(built.legs.slice(index, index + size));
    const placedAll = [];
    for (const group of groups) {
      const placed = await place(strategy, group, null);
      if (placed) placedAll.push(placed);
    }
    if (!placedAll.length) {
      state.empty[key] = { closest: { match: strategy, reason: 'the share readback did not match' }, at: new Date(now()).toISOString() };
      state.order[key] = [];
      save();
      return;
    }
    rememberPlaced(strategy, slot, id, weekId, placedAll);
    save();
  }

  async function place(strategy, legs, cap) {
    const sporty = await bookShare(request, SPORTY_SHARE, legs);
    if (!sporty.code) return null;
    let read = await readCode(request, sporty.code);
    let used = legs;
    const acceptable = (body, sent) => body.sporty.ok && sameSelections(sent, body.sporty.legs) && body.sporty.legs.every((leg) => leg.open && priceStillOk(strategy, leg, cap || 1.45));
    if (!acceptable(read, used)) {
      const openIds = new Set((read.sporty.legs || []).filter((leg) => leg.open && priceStillOk(strategy, leg, cap || 1.45)).map((leg) => `${leg.eventId}|${leg.marketId}`));
      const retryLegs = used.filter((leg) => openIds.has(`${leg.eventId}|${leg.marketId}`));
      if (!retryLegs.length) return null;
      const again = await bookShare(request, SPORTY_SHARE, retryLegs);
      if (!again.code) return null;
      read = await readCode(request, again.code);
      used = retryLegs;
      if (!acceptable(read, used)) return null;
    }
    let football = false;
    let footballCode = '';
    const other = await bookShare(request, FOOTBALL_SHARE, used);
    if (other.code) {
      const check = await readDesk(request, FOOTBALL_SHARE, other.code);
      if (check.ok && sameSelections(used, check.legs)) {
        football = true;
        footballCode = other.code;
      }
    }
    return { code: read.sporty.code, legs: withSentMeta(read.sporty.legs, used), football, footballCode };
  }

  function withSentMeta(readLegs, sent) {
    const byEvent = new Map((sent || []).map((leg) => [leg.eventId, leg]));
    return (readLegs || []).map((leg) => {
      const source = byEvent.get(leg.eventId);
      if (!source) return leg;
      return {
        ...leg,
        league: source.league || leg.league || '',
        tournamentId: source.tournamentId || leg.tournamentId || '',
        country: source.country || leg.country || '',
      };
    });
  }

  function rememberPlaced(strategy, slot, id, weekId, placedAll) {
    const key = slotKey(strategy, slot, id);
    state.order[key] = placedAll.map((row) => row.code);
    for (const [index, placed] of placedAll.entries()) {
      state.codes[placed.code] = {
        code: placed.code,
        strategy,
        slot,
        week: weekId,
        day: slot === 'daily' ? id : '',
        cap: strategy === 'capped' ? 1.45 : null,
        part: index + 1,
        frozen: false,
        seed: false,
        readOk: true,
        football: placed.football,
        footballCode: placed.footballCode,
        legs: placed.legs,
        totalOdds: productOdds(placed.legs),
        readAt: new Date(now()).toISOString(),
        firstKick: Math.min(...placed.legs.map((leg) => leg.kickMs).filter(Boolean)),
        lastKick: Math.max(...placed.legs.map((leg) => leg.kickMs).filter(Boolean)),
      };
      rememberNotice(state.codes[placed.code], 'booked');
    }
  }

  async function rebookDrifted() {
    if (!bookEnabled) return;
    const seen = new Set();
    for (const row of Object.values(state.codes)) {
      if (!row.readOk || row.frozen || row.seed || row.superseded) continue;
      if (row.firstKick && row.firstKick <= now()) {
        row.frozen = true;
        continue;
      }
      const bad = (row.legs || []).filter((leg) => !leg.open || !priceStillOk(row.strategy, leg, row.cap || 1.45));
      if (!bad.length) continue;
      const key = slotKey(row.strategy, row.slot, row.slot === 'week' ? row.week : row.day);
      if (seen.has(key)) continue;
      seen.add(key);
      const fromMs = row.slot === 'week' ? parseDay(row.week) : parseDay(row.day);
      const toMs = row.slot === 'week' ? parseDay(addDays(row.week, 7)) : parseDay(addDays(row.day, 1));
      const current = new Set(state.order[key] || []);
      let candidates = [];
      try {
        candidates = isUnder45Strategy(row.strategy)
          ? await collectUnder45(request, fetchImpl, { fromMs, toMs })
          : await collectCandidates(request, fetchImpl, { fromMs, toMs, coverage: coverageSet });
      } catch {
        continue;
      }
      const built = assemble(row.strategy, candidates, { slot: row.slot, cap: row.cap, counts: eventCounts(row.strategy, row.week, current) });
      if (!built.legs.length) continue;
      const size = isUnder45Strategy(row.strategy) ? U45_PART : built.legs.length;
      const groups = [];
      for (let index = 0; index < built.legs.length; index += size) groups.push(built.legs.slice(index, index + size));
      const placedAll = [];
      for (const group of groups) {
        const placed = await place(row.strategy, group, row.cap);
        if (placed) placedAll.push(placed);
      }
      if (!placedAll.length) {
        for (const code of current) {
          const old = state.codes[code];
          if (!old || old.superseded) continue;
          old.needsReview = true;
          old.readOk = false;
        }
        continue;
      }
      const replaced = row.code;
      for (const code of current) {
        const old = state.codes[code];
        if (!old) continue;
        old.superseded = true;
        old.readOk = false;
      }
      state.order[key] = placedAll.map((item) => item.code);
      for (const [index, placed] of placedAll.entries()) {
        state.codes[placed.code] = {
          ...row,
          code: placed.code,
          part: index + 1,
          superseded: false,
          needsReview: false,
          readOk: true,
          frozen: false,
          seed: false,
          replaced,
          legs: placed.legs,
          football: placed.football,
          footballCode: placed.footballCode,
          totalOdds: productOdds(placed.legs),
          readAt: new Date(now()).toISOString(),
          firstKick: Math.min(...placed.legs.map((leg) => leg.kickMs).filter(Boolean)),
          lastKick: Math.max(...placed.legs.map((leg) => leg.kickMs).filter(Boolean)),
        };
        rememberNotice(state.codes[placed.code], 'rebooked');
      }
    }
  }

  function readDue(clock) {
    const parts = gmtParts(clock);
    if (parts.hour < READBACK_FROM_HOUR || parts.hour > READBACK_TO_HOUR) {
      const soon = Object.values(state.codes).some((row) => row.readOk && row.firstKick && row.firstKick - clock <= READBACK_BEFORE_KO_MS && row.firstKick > clock);
      if (!soon) return false;
    }
    const last = Date.parse(state.readAt || '');
    if (!Number.isFinite(last)) return true;
    if (clock - last >= READBACK_EVERY_MS) return true;
    return Object.values(state.codes).some((row) => row.readOk && row.firstKick && row.firstKick - clock <= READBACK_BEFORE_KO_MS && row.firstKick > clock && clock - last >= 20 * 60 * 1000);
  }

  async function refresh() {
    if (busy) return view();
    // Read back is a public button. One read a minute is plenty and spares the bookmakers.
    const last = Date.parse(state.readAt || '');
    if (Number.isFinite(last) && now() - last < REFRESH_COOLDOWN_MS) return view();
    busy = true;
    try {
      await readAll();
      if (options.results?.settle) await options.results.settle();
      pullGrades();
      save();
    } finally {
      busy = false;
    }
    return view();
  }

  async function tick() {
    if (busy || !request) return view();
    busy = true;
    try {
      ensureSeed();
      if (typeof options.coverage === 'function') {
        try {
          coverageSet = coverageFromEvents(options.coverage() || []);
        } catch {
          coverageSet = new Set();
        }
      }
      const clock = now();
      if (!state.ready || readDue(clock)) await readAll();
      const week = dueWeek(clock);
      if (week) {
        const fromMs = parseDay(week);
        const toMs = parseDay(addDays(week, 7));
        for (const strategy of STRATEGIES) {
          if (!strategy.week) continue;
          await bookSlot(strategy.id, 'week', week, fromMs, toMs);
        }
      }
      const day = dueDaily(clock);
      if (day) {
        const fromMs = parseDay(day);
        const toMs = parseDay(addDays(day, 1));
        for (const strategy of STRATEGIES) await bookSlot(strategy.id, 'daily', day, fromMs, toMs);
      }
      const openMonday = weekMonday(clock);
      const openWeekEnd = parseDay(addDays(openMonday, 7));
      if (clock < openWeekEnd) {
        await bookSlot('under45', 'week', openMonday, clock, openWeekEnd);
        await bookSlot('under45plus', 'week', openMonday, clock, openWeekEnd);
      }
      await rebookDrifted();
      if (options.results?.settle) await options.results.settle();
      pullGrades();
      syncResults();
      save();
    } catch (error) {
      log.error?.(`[codes] ${error instanceof Error ? error.message : error}`);
    } finally {
      busy = false;
    }
    return view();
  }

  function drain() {
    const items = state.pending.splice(0);
    if (items.length) save();
    return items;
  }

  ensureSeed();
  save();
  return { view, refresh, tick, drain, file, get state() { return state; } };
}
