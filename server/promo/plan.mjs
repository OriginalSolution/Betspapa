import { labelFor } from '../occurrence.mjs';

/** Decide which real creatives exist. Never invents a code or a price under 1.20. */

const CODE = /^[A-Za-z0-9]{4,16}$/;
const MIN = 1.2;
const DESKS = [
  ['sportybet', 'SportyBet'],
  ['footballcom', 'Football.com'],
  ['msport', 'MSport'],
  ['betika', 'Betika'],
  ['betpawa', 'BetPawa'],
];

export function realCode(value) {
  return typeof value === 'string' && CODE.test(value.trim()) ? value.trim() : '';
}

export function priced(odds) {
  const value = Number(odds);
  return Number.isFinite(value) && value >= MIN ? Math.round(value * 100) / 100 : null;
}

export function hitPercent(leg) {
  const sample = String(leg?.sample || '').match(/^(\d+)\s*\/\s*(\d+)$/);
  if (sample && Number(sample[2]) > 0) return Math.round((Number(sample[1]) / Number(sample[2])) * 100);
  const occurrence = Number(leg?.occurrence);
  if (!Number.isFinite(occurrence)) return null;
  return Math.round(occurrence > 1 ? occurrence : occurrence * 100);
}

function deskCodes(books) {
  const rows = [];
  for (const [id, name] of DESKS) {
    const parts = books?.[id]?.parts || [];
    const code = realCode(parts.find((part) => realCode(part?.code))?.code);
    if (!code) continue;
    const odds = priced(parts.find((part) => realCode(part?.code) === code)?.totalOdds);
    rows.push({ id, name, code, odds, legs: Number(parts.find((part) => realCode(part?.code) === code)?.legs) || 0 });
  }
  return rows;
}

function legsOf(slip) {
  return (slip?.legs || [])
    .map((leg) => {
      const odds = priced(leg.odds);
      const hit = hitPercent(leg);
      if (odds == null || hit == null || hit < 80) return null;
      return {
        eventId: String(leg.eventId || ''),
        market: labelFor(leg.market),
        match: String(leg.match || ''),
        kickoff: String(leg.kickoff || ''),
        odds,
        hit,
      };
    })
    .filter(Boolean);
}

/** A booked part small enough to read on a card: 4 to 8 legs, combined price at most 20. */
function cardParts(books) {
  const rows = [];
  for (const [id, name] of DESKS) {
    const candidates = (books?.[id]?.parts || [])
      .map((part) => {
        const code = realCode(part?.code);
        const odds = priced(part?.totalOdds);
        const legs = Number(part?.legs) || 0;
        if (!code || odds == null || legs < 4 || legs > 8 || odds > 20) return null;
        return { id, name, code, odds, legs, matches: Array.isArray(part.matches) ? part.matches.map(String) : [] };
      })
      .filter(Boolean)
      .sort((a, b) => b.legs - a.legs || a.odds - b.odds);
    if (candidates[0]) rows.push(candidates[0]);
  }
  return rows;
}

function masterSize(master) {
  const booked = Object.values(master?.books || {}).flatMap((book) => book?.parts || []).map((part) => Number(part?.legs) || 0);
  const largestBooked = Math.max(...booked, 0);
  return largestBooked || master?.legs?.length || 0;
}

export function shareCardFrom(state) {
  const pools = [state?.master, ...(state?.trends || [])].filter(Boolean);
  let chosen = null;
  for (const slip of pools) {
    const codes = cardParts(slip.books);
    if (!codes.length) continue;
    const lead = codes.slice().sort((a, b) => b.legs - a.legs || a.odds - b.odds)[0];
    const ids = new Set(lead.matches);
    let legs = legsOf(slip);
    if (ids.size) {
      const matched = legs.filter((leg) => ids.has(leg.eventId));
      if (matched.length) legs = matched;
    }
    legs = legs.slice(0, 8);
    if (!legs.length) continue;
    const score = legs.reduce((sum, leg) => sum + leg.hit, 0) / legs.length + lead.legs * 3;
    if (!chosen || score > chosen.score) chosen = { slip, codes, lead, legs, score };
  }
  if (!chosen) return null;
  const fullLegs = masterSize(state?.master);
  const sporty = chosen.codes.find((row) => row.id === 'sportybet');
  const featured = sporty || chosen.lead;
  const key = `${chosen.slip.bookedAt || state?.master?.bookedAt || ''}:${chosen.codes.map((row) => row.code).join(',')}`;
  return {
    kind: 'share',
    id: `share:${key}`,
    title: 'Master slip is booked',
    body: `${featured.code} · ${featured.legs} legs`,
    route: 'slips',
    matchId: '',
    code: featured.code,
    codes: chosen.codes,
    legs: chosen.legs,
    legCount: featured.legs,
    total: featured.odds,
    fullNote: fullLegs > featured.legs ? `Full ${fullLegs}-leg master in the app` : '',
    bookedAt: chosen.slip.bookedAt || state?.master?.bookedAt || null,
  };
}

export function contextOf(event) {
  const text = `${event?.tournament || ''} ${event?.country || ''}`.toLowerCase();
  if (text.includes('champions league')) return 'champions';
  if (/international|nations|afcon|world cup|euro|qualifier|friendly/.test(text)) return 'international';
  return 'club';
}

const KICKERS = {
  club: 'CLUB MATCH DAY',
  international: 'INTERNATIONAL BREAK',
  champions: 'CHAMPIONS LEAGUE NIGHT',
};

export function isBigFixture(event) {
  const text = `${event?.tournament || ''} ${event?.country || ''}`.toLowerCase();
  if (contextOf(event) !== 'club') return true;
  return /premier league|la liga|serie a|bundesliga|ligue 1|champions league|eredivisie|primeira/.test(text);
}

export function posterCard(event, state) {
  if (!event?.eventId) return null;
  const legs = [];
  for (const slip of [state?.master, ...(state?.trends || [])]) {
    for (const leg of legsOf(slip)) {
      if (leg.eventId === String(event.eventId)) legs.push({ ...leg, codes: deskCodes(slip?.books) });
    }
  }
  legs.sort((a, b) => b.hit - a.hit || a.odds - b.odds);
  const pick = legs.find((leg) => leg.codes.length);
  if (!pick) return null;
  const [home, away] = String(event.home && event.away ? `${event.home} vs ${event.away}` : pick.match).split(/\s+vs\s+/i);
  return {
    kind: 'poster',
    id: `poster:${event.eventId}:${String(pick.market).replace(/[^a-z0-9]+/gi, '-')}`,
    title: `${home || 'Home'} vs ${away || 'Away'}`,
    body: `${pick.market} · ${pick.odds.toFixed(2)} · ${pick.hit}%`,
    route: 'match',
    matchId: String(event.eventId),
    code: pick.codes[0].code,
    context: contextOf(event),
    kicker: KICKERS[contextOf(event)],
    home: home || 'Home',
    away: away || 'Away',
    tournament: event.tournament || '',
    kickoff: event.kickoff,
    market: pick.market,
    odds: pick.odds,
    hit: pick.hit,
    codes: pick.codes,
  };
}

export function posterFrom(event, state, now = new Date()) {
  if (!event?.eventId || !isBigFixture(event)) return null;
  const kick = new Date(event.kickoff).getTime();
  const delta = kick - now.getTime();
  if (!Number.isFinite(delta) || delta < 2.75 * 3600_000 || delta > 3.25 * 3600_000) return null;
  return posterCard(event, state);
}

export function bankersBetween(state, start, end) {
  const rows = [];
  for (const slip of state?.trends || []) {
    const codes = deskCodes(slip.books);
    for (const leg of legsOf(slip)) {
      const kick = new Date(leg.kickoff).getTime();
      if (kick < start || kick >= end) continue;
      rows.push({ ...leg, codes, label: slip.label || leg.market });
    }
  }
  rows.sort((a, b) => b.hit - a.hit || a.odds - b.odds);
  const seen = new Set();
  const picks = [];
  for (const row of rows) {
    const key = `${row.eventId}:${row.market}`;
    if (seen.has(key)) continue;
    seen.add(key);
    picks.push(row);
    if (picks.length === 3) break;
  }
  const master = deskCodes(state?.master?.books);
  const code = picks.find((row) => row.codes.length)?.codes[0]?.code || master[0]?.code || '';
  if (!picks.length || !code) return null;
  return {
    kind: 'weekend',
    title: 'Weekend Bankers are out',
    body: picks.map((row) => row.match).join(' · '),
    route: 'picks',
    matchId: picks[0].eventId,
    code,
    picks,
    codes: master.length ? master : picks[0].codes,
  };
}

export function weekendBankers(state, now = new Date()) {
  const accra = new Date(now.getTime());
  if (accra.getUTCDay() !== 6 || accra.getUTCHours() !== 6) return null;
  const start = Date.UTC(accra.getUTCFullYear(), accra.getUTCMonth(), accra.getUTCDate());
  const card = bankersBetween(state, start, start + 2 * 86400_000);
  if (!card) return null;
  return { ...card, id: `weekend:${new Date(start).toISOString().slice(0, 10)}` };
}
