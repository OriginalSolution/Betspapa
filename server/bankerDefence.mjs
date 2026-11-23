/** Shield defence: venue goals conceded against the league average on the same split. */

function uidKey(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : String(value);
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
  walk(payload);
  return found;
}

function rowTeam(row) {
  const team = row?.team || {};
  return {
    uk: uidKey(team.uid),
    name: team.mediumname || team.name || '',
    pTot: Number(row?.total) || 0,
    pH: Number(row?.home) || 0,
    pA: Number(row?.away) || 0,
    gaTot: Number(row?.goalsAgainstTotal) || 0,
    gaH: Number(row?.goalsAgainstHome) || 0,
    gaA: Number(row?.goalsAgainstAway) || 0,
    pos: Number(row?.pos) || 0,
  };
}

function average(rows, ga, played) {
  const goals = rows.reduce((sum, row) => sum + ga(row), 0);
  const games = rows.reduce((sum, row) => sum + played(row), 0);
  return games ? goals / games : null;
}

/**
 * @param {object} options minVenueGames and gaRatio (0.8 means 80% of the league average).
 * Returns null when there is no payload, or { found:false } / { missing:true }.
 */
export function defenceFor(payload, uid, side, { minVenueGames = 6, gaRatio = 0.8 } = {}) {
  if (!payload || uid == null) return null;
  const want = uidKey(uid);
  const hits = [];
  for (const table of iterTables(payload)) {
    const rows = (table.tablerows || []).map(rowTeam);
    const fav = rows.find((row) => row.uk != null && row.uk === want);
    if (fav) hits.push({ table, rows, fav });
  }
  if (!hits.length) return { found: false };
  hits.sort((a, b) => {
    const name = (item) => `${item.table.name || ''} ${item.table.groupname || ''}`.toLowerCase();
    const score = (item) => {
      const label = name(item);
      const half = label.includes('half') ? 0 : 1;
      const cup = /cup|pokal|trophy/.test(label) ? 0 : 1;
      return half * 1000 + cup * 100 + item.rows.length;
    };
    return score(b) - score(a);
  });
  const { table, rows, fav } = hits[0];
  const leagueHome = average(rows, (row) => row.gaH, (row) => row.pH);
  const leagueAway = average(rows, (row) => row.gaA, (row) => row.pA);
  let split = '';
  let favPg = null;
  let league = null;
  let played = 0;
  if (side === 'H' && fav.pH >= minVenueGames && leagueHome != null) {
    split = 'home';
    favPg = fav.gaH / fav.pH;
    league = leagueHome;
    played = fav.pH;
  } else if (side === 'A' && fav.pA >= minVenueGames && leagueAway != null) {
    split = 'away';
    favPg = fav.gaA / fav.pA;
    league = leagueAway;
    played = fav.pA;
  }
  if (!split || favPg == null || league == null) {
    return { found: true, missing: true, name: fav.name, played: side === 'H' ? fav.pH : fav.pA };
  }
  return {
    found: true,
    missing: false,
    name: fav.name,
    split,
    played,
    favGaPg: favPg,
    leagueGaPg: league,
    good: favPg <= league * gaRatio + 1e-12,
    nTeams: rows.length,
    tableName: `${table.name || ''}${table.groupname ? ` / ${table.groupname}` : ''}`,
  };
}

/** Overall positions for both teams, from the largest non-half table that contains them. */
export function tablePositions(payload, homeUid, awayUid) {
  const home = uidKey(homeUid);
  const away = uidKey(awayUid);
  let best = null;
  for (const table of iterTables(payload)) {
    const label = `${table.name || ''} ${table.groupname || ''}`.toLowerCase();
    if (label.includes('half')) continue;
    const rows = (table.tablerows || []).map(rowTeam);
    const h = rows.find((row) => row.uk != null && row.uk === home);
    const a = rows.find((row) => row.uk != null && row.uk === away);
    if (!h || !a) continue;
    if (!best || rows.length > best.n) best = { hpos: h.pos, apos: a.pos, n: rows.length };
  }
  return best;
}
