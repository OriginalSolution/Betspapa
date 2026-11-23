/**
 * Starting XIs from Sportradar match_squads. A change is a starter who was
 * not in that team's previous match. The previous block on the current match
 * is often empty, so the last finished match squad is used instead.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const SQUADS = (id) => `https://stats.fn.sportradar.com/common/en/Europe:Berlin/gismo/match_squads/${id}`;
const LAST = (uid) => `https://stats.fn.sportradar.com/common/en/Europe:Berlin/gismo/stats_team_lastx/${uid}/5`;
const WINDOW_BEFORE_MS = 20 * 60 * 1000;
const WINDOW_AFTER_MS = 80 * 60 * 1000;
const MAX_LOOKUPS = 12;

export function matchNumber(eventId) {
  const found = String(eventId || '').match(/(\d+)$/);
  return found ? found[1] : '';
}

export function playerName(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  const split = text.match(/^([^,]+),\s*(.+)$/);
  return split ? `${split[2]} ${split[1]}`.trim() : text;
}

export function readPlayers(list) {
  return (Array.isArray(list) ? list : [])
    .map((player) => ({
      id: Number(player?.playerid),
      name: playerName(player?.playername),
      pos: String(player?.pos || '').slice(0, 2),
      order: Number(player?.order) || 0,
    }))
    .filter((player) => Number.isFinite(player.id) && player.name)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

/** New starters since the previous XI, and the players who dropped out. */
export function compareXi(current, previous) {
  const before = new Set((previous || []).map((player) => player.id));
  const now = new Set((current || []).map((player) => player.id));
  const incoming = (current || []).filter((player) => !before.has(player.id));
  const dropped = (previous || []).filter((player) => !now.has(player.id));
  return { changes: previous?.length ? incoming.length : null, incoming, dropped };
}

function sidePlayers(data, uid) {
  const homeUid = Number(data?.match?.teams?.home?.uid);
  const awayUid = Number(data?.match?.teams?.away?.uid);
  if (Number(uid) === homeUid) return readPlayers(data?.home?.startinglineup?.players);
  if (Number(uid) === awayUid) return readPlayers(data?.away?.startinglineup?.players);
  return [];
}

function emptyStore() {
  return { lineups: {}, previous: {} };
}

function readStore(file) {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    if (parsed && typeof parsed === 'object') return { lineups: parsed.lineups || {}, previous: parsed.previous || {} };
  } catch {
    /* first run */
  }
  return emptyStore();
}

function writeStore(file, store) {
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  writeFileSync(temp, JSON.stringify(store));
  renameSync(temp, file);
}

export function createLineups({ dir, fetchImpl = fetch, crestFor = () => '', now = () => Date.now(), log = console } = {}) {
  const file = join(dir || join(process.cwd(), 'data', 'engine'), 'lineups', 'announced.json');
  let store = readStore(file);
  let busy = false;

  function save() {
    try {
      writeStore(file, store);
    } catch (error) {
      log.error?.(`[lineups] Could not save: ${error instanceof Error ? error.message : error}`);
    }
  }

  async function getJson(url) {
    const response = await fetchImpl(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error(`squads ${response.status}`);
    return response.json();
  }

  async function previousXi(uid, matchId) {
    const key = String(uid || '');
    if (!key) return [];
    if (Array.isArray(store.previous[key])) return store.previous[key];
    const last = await getJson(LAST(key));
    const rows = last?.doc?.[0]?.data?.matches || [];
    const prior = rows.find((match) => String(match?._id) !== String(matchId) && match?.periods?.ft);
    if (!prior?._id) return [];
    const squads = await getJson(SQUADS(prior._id));
    const players = sidePlayers(squads?.doc?.[0]?.data, uid);
    if (players.length >= 8) store.previous[key] = players;
    return players;
  }

  function viewOf(row) {
    return {
      eventId: row.eventId,
      home: row.home,
      away: row.away,
      homeId: row.homeId,
      awayId: row.awayId,
      homeCrest: row.homeCrest,
      awayCrest: row.awayCrest,
      kickoff: row.kickoff,
      tournament: row.tournament || '',
      home: row.home,
      away: row.away,
      homeChanges: row.homeChanges,
      awayChanges: row.awayChanges,
      homeXi: row.homeXi,
      awayXi: row.awayXi,
      homeIn: row.homeIn,
      awayIn: row.awayIn,
      homeDropped: row.homeDropped,
      awayDropped: row.awayDropped,
      announcedAt: row.announcedAt,
    };
  }

  function list() {
    return Object.values(store.lineups).sort((a, b) => String(a.kickoff).localeCompare(String(b.kickoff)));
  }

  /**
   * Look up squads for matches kicking off soon. Returns the sides that
   * gained a starting XI on this pass, so each one can be alerted once.
   */
  async function scan(events) {
    if (busy) return [];
    busy = true;
    const fresh = [];
    try {
      const clock = now();
      const due = (Array.isArray(events) ? events : []).filter((event) => {
        const kick = Date.parse(event?.kickoff || '');
        return Number.isFinite(kick) && kick >= clock - WINDOW_BEFORE_MS && kick <= clock + WINDOW_AFTER_MS && matchNumber(event.eventId);
      }).slice(0, 80);
      let lookups = 0;
      for (const event of due) {
        if (lookups >= MAX_LOOKUPS) break;
        const id = String(event.eventId);
        const saved = store.lineups[id];
        if ((saved?.homeXi || []).length >= 8 && (saved?.awayXi || []).length >= 8) continue;
        lookups += 1;
        let data;
        try {
          const body = await getJson(SQUADS(matchNumber(id)));
          data = body?.doc?.[0]?.data;
        } catch (error) {
          log.error?.(`[lineups] ${id}: ${error instanceof Error ? error.message : error}`);
          continue;
        }
        if (!data) continue;
        const homeXi = readPlayers(data.home?.startinglineup?.players);
        const awayXi = readPlayers(data.away?.startinglineup?.players);
        if (homeXi.length < 8 && awayXi.length < 8) continue;
        const homeUid = Number(data.match?.teams?.home?.uid) || null;
        const awayUid = Number(data.match?.teams?.away?.uid) || null;
        let prevHome = readPlayers(data.previous?.home?.startinglineup?.players);
        let prevAway = readPlayers(data.previous?.away?.startinglineup?.players);
        if (prevHome.length < 8 && homeUid) prevHome = await previousXi(homeUid, matchNumber(id));
        if (prevAway.length < 8 && awayUid) prevAway = await previousXi(awayUid, matchNumber(id));
        const home = compareXi(homeXi, prevHome);
        const away = compareXi(awayXi, prevAway);
        const row = {
          eventId: id,
          home: event.home || data.match?.teams?.home?.name || '',
          away: event.away || data.match?.teams?.away?.name || '',
          homeId: event.homeId || (homeUid ? `sr:competitor:${homeUid}` : null),
          awayId: event.awayId || (awayUid ? `sr:competitor:${awayUid}` : null),
          homeCrest: event.homeCrest || crestFor(event.homeId, event.home) || '',
          awayCrest: event.awayCrest || crestFor(event.awayId, event.away) || '',
          kickoff: event.kickoff,
          tournament: event.tournament || '',
          homeXi,
          awayXi,
          homeChanges: home.changes,
          awayChanges: away.changes,
          homeIn: home.incoming.map((player) => player.name),
          awayIn: away.incoming.map((player) => player.name),
          homeDropped: home.dropped.map((player) => player.name),
          awayDropped: away.dropped.map((player) => player.name),
          announcedAt: new Date(clock).toISOString(),
        };
        const before = store.lineups[id];
        store.lineups[id] = row;
        if (homeXi.length >= 8 && (before?.homeXi || []).length < 8) fresh.push({ ...viewOf(row), side: 'home', changes: row.homeChanges, incoming: row.homeIn });
        if (awayXi.length >= 8 && (before?.awayXi || []).length < 8) fresh.push({ ...viewOf(row), side: 'away', changes: row.awayChanges, incoming: row.awayIn });
      }
      if (lookups) save();
    } finally {
      busy = false;
    }
    return fresh;
  }

  return { scan, list, file, get store() { return store; } };
}

export function lineupWanted(device, announcement) {
  if (!device || !announcement) return false;
  if (device.settings?.lineups === false) return false;
  const off = new Set(device.lineupOff || []);
  if (off.has(announcement.eventId)) return false;
  const teamId = announcement.side === 'home' ? announcement.homeId : announcement.awayId;
  if (teamId && off.has(teamId)) return false;
  const followsMatch = (device.follows?.matches || []).includes(announcement.eventId);
  const followsTeam = (device.follows?.teams || []).some((team) => team?.id === teamId || team?.id === announcement.homeId || team?.id === announcement.awayId);
  if (!followsMatch && !followsTeam) return false;
  if (device.settings?.lineupBig === true && !(Number(announcement.changes) >= 3)) return false;
  return true;
}

const PICK_LABELS = {
  'sh-over05': '2nd half over 0.5',
  'fh-over05': '1st half over 0.5',
  over15: 'Over 1.5',
  over25: 'Over 2.5',
  'dc-12': 'Double chance 12',
  'home-score': 'Home team to score',
};

export function lineupNote(announcement, device) {
  const team = announcement.side === 'home' ? announcement.home : announcement.away;
  const count = Number.isFinite(announcement.changes) ? announcement.changes : null;
  const changes = count == null ? 'name a lineup' : count === 1 ? 'make 1 change' : `make ${count} changes`;
  const starters = (announcement.incoming || []).slice(0, 3);
  const named = starters.length ? `${starters.join(', ')} start.` : 'The starting XI is in.';
  const trend = (device?.trends || []).find((id) => String(id).startsWith(`${announcement.eventId}:`));
  const market = trend ? String(trend).slice(announcement.eventId.length + 1) : '';
  const odds = (device?.bookings || []).find((row) => row.id === trend)?.odds;
  const pick = market && Number.isFinite(Number(odds)) ? `Your pick ${PICK_LABELS[market] || market} @ ${Number(odds).toFixed(2)}. ` : '';
  return {
    id: `lineup:${announcement.eventId}:${announcement.side}`,
    matchId: announcement.eventId,
    kind: 'lineup',
    title: `${announcement.home} v ${announcement.away}: ${team} ${changes}`,
    body: `${pick}${named}`,
    route: 'match',
    marketLabel: 'Lineups',
    fixture: `${announcement.home} v ${announcement.away}`,
    match: {
      id: announcement.eventId,
      home: announcement.home,
      away: announcement.away,
      homeCrest: announcement.homeCrest || '',
      awayCrest: announcement.awayCrest || '',
      competition: announcement.tournament || '',
      status: 'scheduled',
    },
  };
}
