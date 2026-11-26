/**
 * Results record. Every 80%+ pick the engine publishes is written to disk the
 * first time it is seen, then graded from the real full-time score
 * (Sportradar match_info). Losses stay. Nothing is removed after kick-off.
 * Booked codes are kept with the picks that were actually on that part.
 * No reconstruction: a day only shows what this engine published while this
 * record was running.
 */
import { readFileSync } from 'node:fs';
import { safeWriteFile } from './safeWrite.mjs';
import { join } from 'node:path';
import { priceInRange } from './oddsRange.mjs';
import { bankerNeedsTimeline, gradeBanker, mismatchNote, timelineEvents } from './bankerGrade.mjs';

const INFO_URL = (id) => `https://stats.fn.sportradar.com/common/en/Europe:Berlin/gismo/match_info/${id}`;
const TIMELINE_URL = (id) => `https://stats.fn.sportradar.com/common/en/Europe:Berlin/gismo/match_timeline/${id}`;
const DESKS = ['sportybet', 'footballcom', 'msport', 'betika', 'betpawa'];
/** 100 ended, 110 after extra time, 120 after penalties. The 90-minute score is periods.ft. */
const FINAL = new Set([100, 110, 120]);
/** Postponed, cancelled, abandoned, walkover. Interrupted matches are left open. */
const VOID_IDS = new Set([60, 61, 70, 90, 91, 95]);
const VOIDED = /postpon|cancel|abandon|walkover/i;
const LOOK_AFTER_MS = 2 * 60 * 1000;
const RECHECK_MS = 8 * 60 * 1000;
const STILL_PLAYING_MS = 3 * 60 * 60 * 1000;
const MAX_LOOKUPS = 160;
const KEEP_DAYS = 120;

export function matchNumber(eventId) {
  const found = String(eventId || '').match(/(\d+)$/);
  return found ? Number(found[1]) : null;
}

/** Day key in the matchday zone (Africa/Accra, UTC+0). */
export function dayKey(iso) {
  const time = Date.parse(iso || '');
  return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : '';
}

function unitRate(leg) {
  const rate = Number(leg?.rate);
  if (Number.isFinite(rate)) return rate > 1 ? rate / 100 : rate;
  const occurrence = Number(leg?.occurrence);
  if (Number.isFinite(occurrence)) return occurrence > 1 ? occurrence / 100 : occurrence;
  return null;
}

/** Published slips are already the 80%+ board. A leg that states a lower rate is left off. */
export function qualifies(leg) {
  const rate = unitRate(leg);
  if (rate == null) return true;
  return rate >= 0.8 - 1e-9;
}

/** won | lost | void | open, from the 90-minute score and the half-time score. */
export function gradePick(market, ft, ht) {
  if (!ft || !Number.isFinite(ft.home) || !Number.isFinite(ft.away)) return 'open';
  const h = ft.home;
  const a = ft.away;
  const g = h + a;
  const hasHt = ht && Number.isFinite(ht.home) && Number.isFinite(ht.away);
  const fh = hasHt ? ht.home + ht.away : null;
  const yes = (value) => (value ? 'won' : 'lost');
  switch (market) {
    case 'home': return yes(h > a);
    case 'away': return yes(a > h);
    case 'draw': return yes(h === a);
    case 'dc-1x': return yes(h >= a);
    case 'dc-x2': return yes(a >= h);
    case 'dc-12': return yes(h !== a);
    case 'dnb-home': return h === a ? 'void' : yes(h > a);
    case 'dnb-away': return h === a ? 'void' : yes(a > h);
    case 'over05': return yes(g >= 1);
    case 'over15': return yes(g >= 2);
    case 'over25': return yes(g >= 3);
    case 'over35': return yes(g >= 4);
    case 'under15': return yes(g <= 1);
    case 'under25': return yes(g <= 2);
    case 'under35': return yes(g <= 3);
    case 'btts': return yes(h > 0 && a > 0);
    case 'btts-no': return yes(h === 0 || a === 0);
    case 'home-score': return yes(h > 0);
    case 'away-score': return yes(a > 0);
    case 'home-over15': return yes(h >= 2);
    case 'away-over15': return yes(a >= 2);
    case 'home-over25': return yes(h >= 3);
    case 'away-over25': return yes(a >= 3);
    case 'home-under15': return yes(h <= 1);
    case 'away-under15': return yes(a <= 1);
    case 'home-clean': return yes(a === 0);
    case 'away-clean': return yes(h === 0);
    case 'fh-over05': return hasHt ? yes(fh >= 1) : 'open';
    case 'fh-over15': return hasHt ? yes(fh >= 2) : 'open';
    case 'fh-home': return hasHt ? yes(ht.home > ht.away) : 'open';
    case 'fh-away': return hasHt ? yes(ht.away > ht.home) : 'open';
    case 'fh-draw': return hasHt ? yes(ht.home === ht.away) : 'open';
    case 'sh-over05': return hasHt ? yes(g - fh >= 1) : 'open';
    default: return 'open';
  }
}

/** The two bands on the record: 1.25 and under, and 1.26 up. */
export function bandOf(odds) {
  return Number(odds) <= 1.25 + 1e-9 ? 'low' : 'high';
}

function pair(node) {
  const home = Number(node?.home);
  const away = Number(node?.away);
  if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0 || home > 40 || away > 40) return null;
  return { home, away };
}

/** 90-minute score, and only when Sportradar says the match is over. */
export function finalScore(match) {
  const statusId = Number(match?.status?._id);
  if (!FINAL.has(statusId)) return null;
  return pair(match?.periods?.ft);
}

export function halfScore(match) {
  return pair(match?.periods?.p1);
}

/** Empty when the match is not a void. A live or interrupted match is not a void. */
export function voidReason(match) {
  if (!match || finalScore(match)) return '';
  if (match.walkover === true) return 'Walkover';
  if (match.canceled === true || match.cancelled === true) return 'Cancelled';
  if (match.postponed === true) return 'Postponed';
  const statusId = Number(match?.status?._id);
  const name = String(match?.status?.name || '');
  if (!VOIDED.test(name) && !VOID_IDS.has(statusId)) return '';
  if (/walkover/i.test(name) || statusId === 91 || statusId === 95) return 'Walkover';
  if (/abandon/i.test(name) || statusId === 90) return 'Abandoned';
  if (/cancel/i.test(name) || statusId === 70) return 'Cancelled';
  if (/postpon/i.test(name) || statusId === 60 || statusId === 61) return 'Postponed';
  return 'Void';
}

function emptyRecord(now) {
  return { since: new Date(now).toISOString(), picks: {}, codes: {} };
}

function readRecord(file, now) {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    if (parsed && typeof parsed === 'object' && parsed.picks && parsed.since) {
      return { since: parsed.since, picks: parsed.picks, codes: parsed.codes || {} };
    }
  } catch {
    /* first run */
  }
  return emptyRecord(now);
}

function writeRecord(file, record) {
  safeWriteFile(file, JSON.stringify(record));
}

/** Legs the app showed: the 80%+ tiers, every trend, and the master slip. */
export function publishedLegs(state) {
  const slips = [...(state?.tiers || []), ...(state?.trends || []), state?.master].filter(Boolean);
  const byKey = new Map();
  for (const slip of slips) {
    const slipId = String(slip.id || '');
    for (const leg of slip.legs || []) {
      if (!leg?.eventId || !leg?.market) continue;
      if (!qualifies(leg)) continue;
      const key = `${leg.eventId}|${leg.market}`;
      const prior = byKey.get(key);
      if (prior) {
        if (slipId && !prior.slipIds.includes(slipId)) prior.slipIds.push(slipId);
        prior.leg = { ...prior.leg, ...leg };
      } else {
        byKey.set(key, { leg, slipIds: slipId ? [slipId] : [] });
      }
    }
  }
  return [...byKey.values()];
}

function slipList(state) {
  return [state?.master, ...(state?.tiers || []), ...(state?.trends || [])].filter(Boolean);
}

export function createResults({ dir, fetchImpl = fetch, crestFor = () => null, now = () => Date.now(), log = console } = {}) {
  const file = join(dir || join(process.cwd(), 'data', 'engine'), 'results', 'record.json');
  let record = readRecord(file, now());
  let busy = false;

  function save() {
    try {
      writeRecord(file, record);
    } catch (error) {
      log.error?.(`[results] Could not save the record: ${error instanceof Error ? error.message : error}`);
    }
  }

  function keysForPart(part, slipId) {
    const kept = Array.isArray(part?.kept) ? part.kept : [];
    if (kept.length) {
      return [...new Set(kept.map((row) => `${row.eventId}|${row.market}`).filter((key) => record.picks[key]))];
    }
    const ids = new Set((Array.isArray(part?.matches) ? part.matches : []).map((id) => String(id)));
    if (!ids.size) return [];
    return Object.values(record.picks)
      .filter((pick) => ids.has(String(pick.eventId)) && (pick.slips || []).includes(slipId))
      .map((pick) => pick.key);
  }

  /** Remember every published pick and booked code. Prices update until kick-off. */
  function ingest(state) {
    if (!state) return 0;
    const clock = now();
    const events = new Map((state.events || []).map((event) => [String(event.eventId), event]));
    const full = new Map((state.legs || []).map((leg) => [`${leg.eventId}|${leg.market}`, leg]));
    let added = 0;
    let dirty = false;
    for (const shown of publishedLegs(state)) {
      const key = `${shown.leg.eventId}|${shown.leg.market}`;
      const leg = { ...(full.get(key) || {}), ...shown.leg };
      if (!priceInRange(leg.market, leg.odds, leg)) continue;
      const kick = Date.parse(leg.kickoff || '');
      if (!Number.isFinite(kick)) continue;
      const event = events.get(String(leg.eventId)) || {};
      const prior = record.picks[key];
      if (prior) {
        const slips = new Set([...(prior.slips || []), ...shown.slipIds]);
        if (slips.size !== (prior.slips || []).length) {
          prior.slips = [...slips];
          dirty = true;
        }
        if (kick > clock && prior.status === 'open') {
          const odds = Number(leg.odds);
          const rate = Number(leg.rate);
          if (Number.isFinite(odds) && odds !== prior.odds) {
            prior.odds = odds;
            dirty = true;
          }
          if (leg.sample && leg.sample !== prior.sample) {
            prior.sample = leg.sample;
            dirty = true;
          }
          if (Number.isFinite(rate) && rate !== prior.rate) {
            prior.rate = rate;
            dirty = true;
          }
        }
        continue;
      }
      const [home, away] = String(leg.match || '').split(' vs ');
      const homeName = event.home || home || '';
      const awayName = event.away || away || '';
      const homeCrest = event.homeCrest || crestFor(event.homeId, homeName) || null;
      const awayCrest = event.awayCrest || crestFor(event.awayId, awayName) || null;
      record.picks[key] = {
        key,
        eventId: String(leg.eventId),
        market: leg.market,
        odds: Number(leg.odds),
        rate: Number.isFinite(Number(leg.rate)) ? Number(leg.rate) : null,
        sample: leg.sample || null,
        slips: shown.slipIds,
        home: homeName,
        away: awayName,
        homeId: event.homeId || null,
        awayId: event.awayId || null,
        homeCrest: homeCrest || null,
        awayCrest: awayCrest || null,
        kickoff: new Date(kick).toISOString(),
        day: dayKey(leg.kickoff),
        tournament: leg.tournament || event.tournament || '',
        country: leg.country || event.country || '',
        firstSeen: new Date(clock).toISOString(),
        status: 'open',
        ft: null,
        ht: null,
        settledAt: null,
        note: null,
      };
      added += 1;
      dirty = true;
    }
    for (const slip of slipList(state)) {
      const slipId = String(slip.id || '');
      if (!slipId) continue;
      for (const desk of DESKS) {
        for (const part of slip.books?.[desk]?.parts || []) {
          if (!part?.code) continue;
          const legs = keysForPart(part, slipId);
          if (!legs.length) continue;
          const id = `${slipId}:${desk}:${part.code}`;
          const kicks = legs.map((key) => Date.parse(record.picks[key]?.kickoff || '')).filter(Number.isFinite);
          if (!kicks.length) continue;
          const prior = record.codes[id];
          if (prior) {
            if (prior.status === 'open') {
              const merged = [...new Set([...(prior.legs || []), ...legs])];
              if (merged.length !== (prior.legs || []).length) {
                prior.legs = merged;
                const nextKicks = merged.map((key) => Date.parse(record.picks[key]?.kickoff || '')).filter(Number.isFinite);
                prior.firstKickoff = new Date(Math.min(...nextKicks)).toISOString();
                prior.day = dayKey(prior.firstKickoff);
                dirty = true;
              }
            }
            continue;
          }
          const firstKickoff = new Date(Math.min(...kicks)).toISOString();
          record.codes[id] = {
            id,
            slipId,
            slip: slip.label || slip.name || slipId,
            desk,
            code: String(part.code),
            link: part.link || null,
            totalOdds: Number(part.totalOdds) || null,
            legs,
            firstKickoff,
            day: dayKey(firstKickoff),
            bookedAt: slip.bookedAt || new Date(clock).toISOString(),
            status: 'open',
          };
          dirty = true;
        }
      }
    }
    if (prune(clock)) dirty = true;
    if (dirty) {
      if (added) log.log?.(`[results] Recorded ${added} new pick(s).`);
      save();
    }
    return added;
  }

  function prune(clock) {
    const cutoff = new Date(clock - KEEP_DAYS * 86400000).toISOString().slice(0, 10);
    let removed = false;
    for (const [key, pick] of Object.entries(record.picks)) {
      if (pick.day < cutoff) {
        delete record.picks[key];
        removed = true;
      }
    }
    for (const [key, code] of Object.entries(record.codes)) {
      if (code.day < cutoff) {
        delete record.codes[key];
        removed = true;
      }
    }
    return removed;
  }

  async function lookup(matchId) {
    const response = await fetchImpl(INFO_URL(matchId), {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error(`match_info ${response.status}`);
    const body = await response.json();
    return body?.doc?.[0]?.data?.match || null;
  }

  async function lookupTimeline(matchId) {
    const response = await fetchImpl(TIMELINE_URL(matchId), {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return null;
    return timelineEvents(await response.json());
  }

  /**
   * Banker legs skip the 80%+ filter and the HARD odds cap. They use the
   * strategy's own prices and are graded with the same full-time score.
   */
  function recordBanker(batch) {
    if (!batch?.picks?.length) return 0;
    const clock = now();
    let dirty = false;
    const keys = [];
    for (const pick of batch.picks) {
      if (!pick?.key || !pick.eventId || !pick.market) continue;
      const kick = Date.parse(pick.kickoff || '');
      if (!Number.isFinite(kick)) continue;
      keys.push(pick.key);
      const prior = record.picks[pick.key];
      if (prior) {
        if (prior.status === 'open' && pick.bookResult && pick.bookResult !== prior.bookResult) {
          prior.bookResult = pick.bookResult;
          dirty = true;
        }
        continue;
      }
      record.picks[pick.key] = {
        key: pick.key,
        eventId: String(pick.eventId),
        market: pick.market,
        odds: Number(pick.odds) || 0,
        rate: null,
        sample: null,
        slips: [`banker:${pick.strategy || ''}`],
        home: pick.home || '',
        away: pick.away || '',
        homeId: null,
        awayId: null,
        homeCrest: pick.homeCrest || null,
        awayCrest: pick.awayCrest || null,
        kickoff: new Date(kick).toISOString(),
        day: dayKey(pick.kickoff),
        tournament: 'Banker',
        country: '',
        firstSeen: new Date(clock).toISOString(),
        status: 'open',
        ft: null,
        ht: null,
        settledAt: null,
        note: null,
        banker: true,
        bookResult: pick.bookResult || '',
      };
      dirty = true;
    }
    const code = batch.code;
    if (code?.id && keys.length) {
      const kicks = keys.map((key) => Date.parse(record.picks[key]?.kickoff || '')).filter(Number.isFinite);
      if (kicks.length) {
        const prior = record.codes[code.id];
        if (!prior) {
          const firstKickoff = new Date(Math.min(...kicks)).toISOString();
          record.codes[code.id] = {
            id: code.id,
            slipId: `banker:${code.strategy || ''}`,
            slip: code.name || 'Banker',
            desk: 'sportybet',
            code: String(code.code || ''),
            link: code.link || null,
            totalOdds: Number(code.totalOdds) || null,
            legs: keys,
            firstKickoff,
            day: dayKey(firstKickoff),
            bookedAt: new Date(clock).toISOString(),
            status: 'open',
            banker: true,
          };
          dirty = true;
        } else if (prior.status === 'open') {
          prior.legs = [...new Set([...(prior.legs || []), ...keys])];
          dirty = true;
        }
      }
    }
    if (dirty) save();
    return keys.length;
  }

  function settleCodes() {
    for (const code of Object.values(record.codes)) {
      if (code.status !== 'open') continue;
      const states = (code.legs || []).map((key) => record.picks[key]?.status || 'open');
      if (!states.length || states.includes('open')) continue;
      if (states.includes('lost')) code.status = 'lost';
      else if (states.every((state) => state === 'void')) code.status = 'void';
      else code.status = 'won';
    }
  }

  /**
   * Grade picks whose kickoff has passed. A live score is not a result:
   * won and lost require status 100/110/120 and periods.ft.
   */
  async function settle() {
    if (busy) return 0;
    busy = true;
    let graded = 0;
    try {
      const clock = now();
      const due = Object.values(record.picks).filter((pick) => pick.status === 'open' && Date.parse(pick.kickoff) + LOOK_AFTER_MS <= clock);
      const byMatch = new Map();
      for (const pick of due) {
        const id = matchNumber(pick.eventId);
        if (!id) continue;
        const recent = Date.parse(pick.checkedAt || '');
        const playing = clock < Date.parse(pick.kickoff) + STILL_PLAYING_MS;
        if (playing && Number.isFinite(recent) && clock - recent < RECHECK_MS) continue;
        byMatch.set(id, [...(byMatch.get(id) || []), pick]);
      }
      const queue = [...byMatch.entries()].sort((a, b) => Date.parse(a[1][0].kickoff) - Date.parse(b[1][0].kickoff)).slice(0, MAX_LOOKUPS);
      let dirty = false;
      for (const [id, picks] of queue) {
        let match;
        try {
          match = await lookup(id);
        } catch (error) {
          log.error?.(`[results] ${id}: ${error instanceof Error ? error.message : error}`);
          continue;
        }
        const reason = voidReason(match);
        const ft = finalScore(match);
        const ht = halfScore(match);
        let timeline = null;
        if (ft && picks.some((pick) => pick.banker && bankerNeedsTimeline(pick.market))) {
          try {
            timeline = await lookupTimeline(id);
          } catch {
            timeline = null;
          }
        }
        for (const pick of picks) {
          pick.checkedAt = new Date(clock).toISOString();
          dirty = true;
          if (reason) {
            pick.status = 'void';
            pick.note = reason;
            pick.settledAt = new Date(clock).toISOString();
            graded += 1;
            continue;
          }
          if (!ft) continue;
          const result = pick.banker ? gradeBanker(pick.market, ft, timeline) : gradePick(pick.market, ft, ht);
          if (result === 'open') continue;
          pick.status = result;
          pick.ft = `${ft.home}-${ft.away}`;
          pick.ht = ht ? `${ht.home}-${ht.away}` : null;
          pick.settledAt = new Date(clock).toISOString();
          const clash = pick.banker ? mismatchNote(result, pick.bookResult) : '';
          if (clash) {
            pick.mismatch = true;
            pick.note = clash;
          }
          graded += 1;
        }
      }
      settleCodes();
      if (dirty || graded) {
        if (graded) log.log?.(`[results] Graded ${graded} pick(s).`);
        save();
      }
    } finally {
      busy = false;
    }
    return graded;
  }

  function days() {
    const counts = new Map();
    for (const pick of Object.values(record.picks)) {
      const row = counts.get(pick.day) || { day: pick.day, picks: 0, won: 0, lost: 0, open: 0, void: 0 };
      row.picks += 1;
      if (pick.status === 'won') row.won += 1;
      if (pick.status === 'lost') row.lost += 1;
      if (pick.status === 'open') row.open += 1;
      if (pick.status === 'void') row.void += 1;
      counts.set(pick.day, row);
    }
    return [...counts.values()].sort((a, b) => a.day.localeCompare(b.day));
  }

  /** One day of the record, shaped for the Record screens. */
  function view(day) {
    const list = days();
    const requested = /^\d{4}-\d{2}-\d{2}$/.test(String(day || '')) ? String(day) : '';
    const chosen = requested || [...list].reverse().find((row) => row.won + row.lost > 0)?.day || list.at(-1)?.day || dayKey(new Date(now()).toISOString());
    const picks = Object.values(record.picks)
      .filter((pick) => pick.day === chosen)
      .sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.home.localeCompare(b.home) || a.market.localeCompare(b.market));
    const won = picks.filter((pick) => pick.status === 'won').length;
    const lost = picks.filter((pick) => pick.status === 'lost').length;
    const markets = new Map();
    for (const pick of picks) {
      if (pick.status !== 'won' && pick.status !== 'lost') continue;
      const row = markets.get(pick.market) || { market: pick.market, won: 0, graded: 0, low: { won: 0, graded: 0 }, high: { won: 0, graded: 0 } };
      const band = bandOf(pick.odds);
      row.graded += 1;
      row[band].graded += 1;
      if (pick.status === 'won') {
        row.won += 1;
        row[band].won += 1;
      }
      markets.set(pick.market, row);
    }
    const codes = Object.values(record.codes)
      .filter((code) => code.day === chosen)
      .sort((a, b) => String(a.slipId).localeCompare(String(b.slipId)) || a.bookedAt.localeCompare(b.bookedAt) || a.desk.localeCompare(b.desk))
      .map((code) => {
        const legs = (code.legs || []).map((key) => record.picks[key]).filter(Boolean);
        const lostLegs = legs.filter((leg) => leg.status === 'lost');
        return {
          ...code,
          legCount: (code.legs || []).length,
          settled: legs.filter((leg) => leg.status !== 'open').length,
          lostLegs: lostLegs.length,
          missedBy: lostLegs[0] ? `${lostLegs[0].home} ${lostLegs[0].ft || ''} ${lostLegs[0].away}`.replace(/\s+/g, ' ').trim() : null,
        };
      });
    return {
      since: record.since,
      day: chosen,
      days: list,
      summary: {
        picks: picks.length,
        graded: won + lost,
        won,
        lost,
        open: picks.filter((pick) => pick.status === 'open').length,
        void: picks.filter((pick) => pick.status === 'void').length,
        rate: won + lost ? won / (won + lost) : null,
      },
      markets: [...markets.values()].sort((a, b) => b.graded - a.graded || a.market.localeCompare(b.market)),
      picks,
      codes,
    };
  }

  return { ingest, settle, view, days, recordBanker, file, get record() { return record; } };
}
