/** Head-to-head, last 10, league table, and live stats from the Sportradar feeds already used for grading. */

const GISMO = 'https://stats.fn.sportradar.com/common/en/Europe:Berlin/gismo';
const TTL_MS = 60_000;

const MARKETS = [
  { id: 'over15', label: 'Over 1.5', hit: (scored, conceded) => scored + conceded >= 2 },
  { id: 'over25', label: 'Over 2.5', hit: (scored, conceded) => scored + conceded >= 3 },
  { id: 'over35', label: 'Over 3.5', hit: (scored, conceded) => scored + conceded >= 4 },
  { id: 'btts', label: 'Both teams to score', hit: (scored, conceded) => scored >= 1 && conceded >= 1 },
  { id: 'scored', label: 'Scored', hit: (scored) => scored >= 1 },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function emptyInsight() {
  return { h2h: null, last10: null, table: null, stats: null };
}

function numericId(value) {
  const found = String(value || '').match(/(\d+)$/);
  return found ? found[1] : '';
}

function uidKey(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function teamName(team) {
  return String(team?.mediumname || team?.name || '').trim();
}

function finitePair(value) {
  if (value?.home == null || value?.away == null || value.home === '' || value.away === '') return null;
  const home = Number(value.home);
  const away = Number(value.away);
  if (!Number.isFinite(home) || !Number.isFinite(away)) return null;
  return { home, away };
}

export function dayLabel(uts) {
  const seconds = Number(uts);
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  const date = new Date(seconds * 1000);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

export function parseH2H(payload, currentId) {
  const matches = payload?.doc?.[0]?.data?.matches;
  if (!Array.isArray(matches)) return null;
  const current = numericId(currentId);
  const rows = [];
  for (const match of matches) {
    if (current && String(match?._id) === current) continue;
    if (match?.canceled || match?.postponed || match?.walkover) continue;
    const score = finitePair(match?.result) || finitePair(match?.periods?.ft);
    if (!score) continue;
    const home = teamName(match?.teams?.home);
    const away = teamName(match?.teams?.away);
    if (!home || !away) continue;
    rows.push({
      id: String(match._id),
      uts: Number(match?.time?.uts) || 0,
      date: dayLabel(match?.time?.uts),
      home,
      away,
      homeScore: score.home,
      awayScore: score.away,
    });
  }
  rows.sort((a, b) => b.uts - a.uts || b.id.localeCompare(a.id));
  return rows.length ? rows.slice(0, 5) : null;
}

export function finishedRows(payload, teamUid) {
  const want = uidKey(teamUid);
  const matches = payload?.doc?.[0]?.data?.matches;
  if (!Array.isArray(matches) || want == null) return [];
  const rows = [];
  for (const match of matches) {
    if (match?.canceled || match?.postponed || match?.walkover || match?.retired) continue;
    const home = match?.teams?.home;
    const away = match?.teams?.away;
    if (!home || !away || home.virtual || away.virtual) continue;
    const homeUid = uidKey(home.uid);
    const awayUid = uidKey(away.uid);
    const teamIsHome = homeUid === want;
    if (!teamIsHome && awayUid !== want) continue;
    const score = finitePair(match?.result) || finitePair(match?.periods?.ft);
    if (!score) continue;
    rows.push({
      uts: Number(match?.time?.uts) || 0,
      scored: teamIsHome ? score.home : score.away,
      conceded: teamIsHome ? score.away : score.home,
    });
  }
  rows.sort((a, b) => b.uts - a.uts);
  return rows.slice(0, 10);
}

export function last10Side(payload, teamUid, fallbackName) {
  const rows = finishedRows(payload, teamUid);
  if (!rows.length) return null;
  const named = teamName(payload?.doc?.[0]?.data?.team) || String(fallbackName || '').trim();
  return {
    name: named,
    n: rows.length,
    markets: MARKETS.map((market) => ({
      id: market.id,
      label: market.label,
      hit: rows.filter((row) => market.hit(row.scored, row.conceded)).length,
    })),
  };
}

function iterTables(payload) {
  const found = [];
  const seen = new Set();
  const walk = (obj) => {
    if (!obj || typeof obj !== 'object' || seen.has(obj)) return;
    seen.add(obj);
    if (!Array.isArray(obj) && Array.isArray(obj.tablerows)) found.push(obj);
    for (const value of Object.values(obj)) {
      if (value && typeof value === 'object') walk(value);
    }
  };
  walk(payload?.doc?.[0]?.data ?? payload);
  return found;
}

export function parseTable(payload, homeUid, awayUid) {
  const home = uidKey(homeUid);
  const away = uidKey(awayUid);
  if (home == null && away == null) return null;
  let best = null;
  for (const table of iterTables(payload)) {
    const label = `${table.name || ''} ${table.groupname || ''}`.toLowerCase();
    if (label.includes('half')) continue;
    const rows = [];
    let hasHome = false;
    let hasAway = false;
    for (const row of table.tablerows || []) {
      const uid = uidKey(row?.team?.uid);
      const name = teamName(row?.team);
      if (!name || uid == null) continue;
      const side = uid === home ? 'home' : uid === away ? 'away' : null;
      if (side === 'home') hasHome = true;
      if (side === 'away') hasAway = true;
      const gd = Number(row.goalDiffTotal);
      rows.push({
        pos: Number(row.pos) || rows.length + 1,
        name,
        played: Number(row.total) || 0,
        gd: Number.isFinite(gd) ? gd : 0,
        points: Number(row.pointsTotal) || 0,
        side,
      });
    }
    if (!rows.length || (!hasHome && !hasAway)) continue;
    const rank = (hasHome && hasAway ? 1000 : 0) + rows.length;
    if (!best || rank > best.rank) {
      const group = String(table.groupname || '').trim();
      const name = String(table.name || '').trim();
      const titled = group && name && !name.toLowerCase().includes(group.toLowerCase()) ? `${name} · ${group}` : name || group;
      best = { rank, name: titled, rows };
    }
  }
  if (!best) return null;
  return { name: best.name, rows: best.rows };
}

function statsOpen(status) {
  const name = String(status?.name || '').toLowerCase();
  if (!name) return false;
  if (name === 'not started' || name.includes('postpon') || name.includes('cancel') || name.includes('abandon')) return false;
  return true;
}

export function parseLiveStats(payload, status) {
  if (!statsOpen(status)) return null;
  const values = payload?.doc?.[0]?.data?.values;
  if (!values || typeof values !== 'object') return null;
  const possession = finitePair(values['110']?.value);
  const on = finitePair(values['125']?.value);
  const off = finitePair(values['126']?.value);
  const blocked = finitePair(values['171']?.value);
  const shots = on && off && blocked ? { home: on.home + off.home + blocked.home, away: on.away + off.away + blocked.away } : null;
  if (!possession && !shots && !on) return null;
  return {
    possession,
    shots,
    shotsOn: on,
  };
}

async function gismo(path, fetchImpl) {
  try {
    const response = await fetchImpl(`${GISMO}/${path}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export async function loadMatchInsight(matchId, fetchImpl = fetch) {
  const id = numericId(matchId);
  if (!id) return emptyInsight();
  const info = await gismo(`match_info/${id}`, fetchImpl);
  const match = info?.doc?.[0]?.data?.match;
  if (!match) return emptyInsight();
  const homeUid = match.teams?.home?.uid;
  const awayUid = match.teams?.away?.uid;
  const season = match._seasonid;
  const [h2h, homeLast, awayLast, table, stats] = await Promise.all([
    homeUid != null && awayUid != null ? gismo(`stats_team_versus/${homeUid}/${awayUid}`, fetchImpl) : null,
    homeUid != null ? gismo(`stats_team_lastx/${homeUid}/10`, fetchImpl) : null,
    awayUid != null ? gismo(`stats_team_lastx/${awayUid}/10`, fetchImpl) : null,
    season ? gismo(`stats_season_tables/${season}`, fetchImpl) : null,
    gismo(`match_detailsextended/${id}`, fetchImpl),
  ]);
  const home = last10Side(homeLast, homeUid, teamName(match.teams?.home));
  const away = last10Side(awayLast, awayUid, teamName(match.teams?.away));
  return {
    h2h: parseH2H(h2h, id),
    last10: home || away ? { home, away } : null,
    table: parseTable(table, homeUid, awayUid),
    stats: parseLiveStats(stats, match.status),
  };
}

const cache = new Map();

export async function cachedMatchInsight(matchId, fetchImpl = fetch, now = Date.now()) {
  const key = numericId(matchId);
  if (!key) return emptyInsight();
  const hit = cache.get(key);
  if (hit && now - hit.at < TTL_MS) return hit.body;
  const body = await loadMatchInsight(key, fetchImpl);
  cache.set(key, { at: now, body });
  return body;
}

export function clearInsightCache() {
  cache.clear();
}
