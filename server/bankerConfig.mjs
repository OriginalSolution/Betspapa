/**
 * Banker Codes defaults. Riddim Boss can still change these; nothing else
 * should hard-code the same numbers. Times are GMT, which is Africa/Accra
 * all year.
 */

/** Week codes are built Sunday evening for the coming Monday–Sunday. */
export const WEEK_BOOK_WEEKDAY = 0;
export const WEEK_BOOK_HOUR = 21;
export const WEEK_BOOK_MINUTE = 0;

/** A daily is built at this time on the day before it. */
export const DAILY_BOOK_HOUR = 21;
export const DAILY_BOOK_MINUTE = 0;

/** Open codes are read back through this window, and again before kick-off. */
export const READBACK_FROM_HOUR = 6;
export const READBACK_TO_HOUR = 23;
export const READBACK_EVERY_MS = 60 * 60 * 1000;
export const READBACK_BEFORE_KO_MS = 30 * 60 * 1000;

/** The refresh button only reads codes back. It never books. */
export const MANUAL_REFRESH = 'readback';

export const AH_MAX_INCL = 2;
export const AH_1UP_FROM = 1.8;
export const FAV_1X2_SKIP_UNDER = 1.3;
export const MIN_LEG = 1.2;
export const WEEK_MAX_LEGS = 50;
export const DAILY_MAX_LEGS = 25;
export const DAILY_ODDS_TARGET = 25;
export const HIGH_RISK_UNDER = 25;
/** A match may sit on the week code and one daily of the same strategy. */
export const MAX_CODES_PER_MATCH = 2;

export const GOLD_O25_UNDER = 1.4;
export const CAPPED_CAP = 1.45;
export const CAPPED_AH_O25_UNDER = 1.6;

/** Shield: current-season league games, at least this many at the venue. */
export const SHIELD_MIN_VENUE_GAMES = 6;
/** 1 means at or below the league average. A lower number is a tighter cut. */
export const SHIELD_GA_RATIO = 1;
export const SHIELD_O25_MAX_EXCL = 1.6;

/** Ladder: how often the weaker side has scored in its last 10. */
export const LADDER_WEAK_RARE_MAX = 3;
export const LADDER_WEAK_OFTEN = 6;
export const LADDER_FAV_TWO_PLUS = 6;
export const LADDER_LAST_N = 10;
export const LADDER_O25_MIN = 1.2;
export const LADDER_O25_MAX_EXCL = 1.6;

/** Away favourites: last 5 competitive away games, cups included, no friendlies. */
export const AWAY_LAST_N = 5;
export const AWAY_WINS_MIN = 3;
export const AWAY_SCORED_GAMES_MIN = 3;
export const AWAY_INCLUDES_CUPS = true;

/** Busy days keep leagues Betspapa can grade from Sportradar, not a hand-written list. */
export const BUSY_FIXTURE_THRESHOLD = 300;
export const BUSY_LEAGUE_SOURCE = 'sportradar-coverage';

export const ODDS_LABEL = 'Banker rules - own odds limits';
export const HIGH_RISK_WARNING = 'High risk: a week code, or under 25 total odds. One losing leg loses the code.';

export const SPORTY_SHARE = 'https://www.sportybet.com/api/gh/orders/share';
export const FOOTBALL_SHARE = 'https://www.football.com/api/gh/orders/share';
export const BOOK_MARKETS = new Set(['16', '18', '19', '20', '60100', '60200']);

/**
 * Codes already booked for 23–29 Nov 2026. They are shown after a live
 * readback and never rebooked. Ladder has no week code.
 */
export const SEED_CODES = [
  { strategy: 'classic', slot: 'week', week: '2026-11-23', code: '9JFZPW' },
  { strategy: 'gold', slot: 'week', week: '2026-11-23', code: 'FTY1VD' },
  { strategy: 'shield', slot: 'week', week: '2026-11-23', code: 'APWHWQ' },
  { strategy: 'capped', slot: 'week', week: '2026-11-23', code: 'AAA8MR', cap: 1.45, part: 1 },
  { strategy: 'capped', slot: 'week', week: '2026-11-23', code: 'B11KYD', cap: 1.4, part: 2 },
  { strategy: 'ladder', slot: 'daily', day: '2026-11-23', code: '9B4CVQ' },
  { strategy: 'ladder', slot: 'daily', day: '2026-11-24', code: 'A3H3TU' },
  { strategy: 'ladder', slot: 'daily', day: '2026-11-25', code: '8K0WSL' },
  { strategy: 'ladder', slot: 'daily', day: '2026-11-26', code: 'BGTUGF' },
  { strategy: 'ladder', slot: 'daily', day: '2026-11-27', code: 'A4VBHK' },
  { strategy: 'ladder', slot: 'daily', day: '2026-11-28', code: 'BG03EA' },
  { strategy: 'ladder', slot: 'daily', day: '2026-11-29', code: 'E968A3' },
];

export const STRATEGIES = [
  { id: 'classic', code: 'S1', name: 'Banker Classic', week: true },
  { id: 'gold', code: 'S2', name: 'Banker Gold', week: true },
  { id: 'shield', code: 'S3', name: 'Banker Shield', week: true },
  { id: 'capped', code: 'S4', name: 'Banker Capped', week: true },
  { id: 'ladder', code: 'S5', name: 'Banker Ladder', week: false },
];

export function strategyById(id) {
  return STRATEGIES.find((row) => row.id === id) || null;
}

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function gmtParts(ms) {
  const date = new Date(ms);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth(),
    date: date.getUTCDate(),
    dow: date.getUTCDay(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
  };
}

export function isoDay(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function parseDay(iso) {
  const [year, month, day] = String(iso || '').split('-').map(Number);
  if (!year || !month || !day) return NaN;
  return Date.UTC(year, month - 1, day);
}

export function addDays(iso, days) {
  return isoDay(parseDay(iso) + days * 86400000);
}

export function shortDow(iso) {
  const ms = parseDay(iso);
  return Number.isFinite(ms) ? DAY[new Date(ms).getUTCDay()] : '';
}

/** Monday of the Monday–Sunday week that contains this moment. */
export function weekMonday(ms) {
  const parts = gmtParts(ms);
  const delta = parts.dow === 0 ? -6 : 1 - parts.dow;
  return isoDay(Date.UTC(parts.year, parts.month, parts.date + delta));
}

export function weekDays(monday) {
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

/** Sunday 21:00 books the week that starts the next morning. */
export function dueWeek(ms) {
  const parts = gmtParts(ms);
  if (parts.dow !== WEEK_BOOK_WEEKDAY) return '';
  const minutes = parts.hour * 60 + parts.minute;
  if (minutes < WEEK_BOOK_HOUR * 60 + WEEK_BOOK_MINUTE) return '';
  return isoDay(Date.UTC(parts.year, parts.month, parts.date + 1));
}

/** 21:00 books the next calendar day. */
export function dueDaily(ms) {
  const parts = gmtParts(ms);
  const minutes = parts.hour * 60 + parts.minute;
  if (minutes < DAILY_BOOK_HOUR * 60 + DAILY_BOOK_MINUTE) return '';
  return isoDay(Date.UTC(parts.year, parts.month, parts.date + 1));
}

export function slotKey(strategy, slot, id) {
  return `${strategy}:${slot}:${id}`;
}

export function rulesFor(id) {
  const pool = 'Favourite on AH −1 at 2.00 or under. Skip a favourite under 1.30 on 1X2, an away favourite without 3 wins in its last 5 away games, top-5 v top-5, bottom-3 v bottom-3 (cups skip the table), and youth, reserve, women and SRL.';
  const floor = 'Every leg is 1.20 or more. No padding. A match sits on at most this strategy’s week code and one of its dailies.';
  if (id === 'classic') {
    return [pool, 'AH −1 under 1.80: favourite 2UP. AH −1 from 1.80 to 2.00: favourite 1UP, or drop the game if 1UP is not offered.', 'No per-leg price cap. Up to 50 legs, lowest AH −1 first.', floor];
  }
  if (id === 'gold') {
    return [pool, 'Same legs as Classic, and only when match Over 2.5 is under 1.40. Over 2.5 is a filter, not the leg.', floor];
  }
  if (id === 'shield') {
    return [
      pool,
      `Good defence: at least ${SHIELD_MIN_VENUE_GAMES} games at that venue this season, and goals conceded per game ${SHIELD_GA_RATIO >= 1 - 1e-9 ? 'at or below the league average' : `at most ${Math.round(SHIELD_GA_RATIO * 100)}% of the league average`} on the same split. Then 2UP if AH −1 is under 1.80, or 1UP from 1.80 to 2.00.`,
      `Leaky defence: match Over 2.5 under ${SHIELD_O25_MAX_EXCL.toFixed(2)}. No usable defence table: drop the game.`,
      floor,
    ];
  }
  if (id === 'capped') {
    return [
      pool,
      `AH −1 under 1.60: match Over 2.5. From 1.60 to under 2.00: favourite 2UP. Every leg at or under ${CAPPED_CAP.toFixed(2)}.`,
      'If the main pick is over the cap, use the favourite’s team Over 1.5 when that is at or under the cap. Otherwise drop the game.',
      floor,
    ];
  }
  return [
    pool,
    `Weaker side scored in ${LADDER_WEAK_OFTEN} or more of its last ${LADDER_LAST_N}: match Over 2.5 from ${LADDER_O25_MIN.toFixed(2)} to under ${LADDER_O25_MAX_EXCL.toFixed(2)}. If Over 2.5 is ${LADDER_O25_MAX_EXCL.toFixed(2)} or more, fall through to 2UP when that qualifies, otherwise drop the game.`,
    `Weaker side scored in ${LADDER_WEAK_RARE_MAX} or fewer, and the favourite scored 2 or more in ${LADDER_FAV_TWO_PLUS} or more of its last ${LADDER_LAST_N}: favourite team Over 1.5. Otherwise favourite 2UP.`,
    'Dailies only, up to 25 legs. There is no week code.',
    floor,
  ];
}
