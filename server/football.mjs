const PALETTE = ['#e11d2e', '#3d7eff', '#f0c94a', '#21a366', '#a855f7', '#ff7a45', '#14b8a6', '#6366f1', '#84cc16', '#6cabdd'];

const STATUS = {
  SCHEDULED: 'scheduled',
  TIMED: 'scheduled',
  IN_PLAY: 'live',
  LIVE: 'live',
  PAUSED: 'halftime',
  EXTRA_TIME: 'live',
  EXTRA_TIME_PAUSED: 'halftime',
  PENALTY_SHOOTOUT: 'live',
  FINISHED: 'finished',
  AWARDED: 'finished',
  SUSPENDED: 'postponed',
  POSTPONED: 'postponed',
  CANCELLED: 'postponed',
};

export function colorFor(id) {
  let hash = 0;
  const text = String(id);
  for (let index = 0; index < text.length; index += 1) hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

function numberOrNull(value) {
  return typeof value === 'number' ? value : null;
}

function normalizeTeam(team) {
  const name = team?.name || 'Team';
  const shortName = team?.shortName || name;
  const id = String(team?.id ?? name);
  return {
    id,
    name,
    shortName,
    abbr: String(team?.tla || shortName).replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'TM',
    color: colorFor(id),
    crest: team?.crest || null,
  };
}

export function normalizeMatch(raw) {
  const home = normalizeTeam(raw.homeTeam);
  const away = normalizeTeam(raw.awayTeam);
  const events = [];
  for (const goal of raw.goals || []) {
    const teamId = goal.team?.id != null ? String(goal.team.id) : null;
    const player = goal.scorer?.name || null;
    const detail = goal.type === 'PENALTY' ? 'Penalty' : goal.type === 'OWN' || goal.type === 'OWN_GOAL' ? 'Own goal' : null;
    events.push({
      id: `${raw.id}:goal:${goal.minute ?? 'x'}:${teamId ?? 'x'}:${player ?? 'x'}`,
      type: 'goal',
      minute: numberOrNull(goal.minute),
      teamId,
      player,
      detail,
      homeScore: numberOrNull(goal.score?.home),
      awayScore: numberOrNull(goal.score?.away),
    });
  }
  for (const card of raw.bookings || []) {
    const type = card.card === 'RED_CARD' || card.card === 'YELLOW_RED_CARD' ? 'red' : card.card === 'YELLOW_CARD' ? 'yellow' : null;
    if (!type) continue;
    const teamId = card.team?.id != null ? String(card.team.id) : null;
    const player = card.player?.name || null;
    events.push({
      id: `${raw.id}:${type}:${card.minute ?? 'x'}:${teamId ?? 'x'}:${player ?? 'x'}`,
      type,
      minute: numberOrNull(card.minute),
      teamId,
      player,
      detail: null,
      homeScore: null,
      awayScore: null,
    });
  }
  events.sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0) || a.id.localeCompare(b.id));

  return {
    id: String(raw.id),
    competition: {
      id: String(raw.competition?.id ?? raw.competition?.code ?? 'competition'),
      name: raw.competition?.name || 'Competition',
      area: raw.area?.name || 'International',
      code: String(raw.area?.code || raw.competition?.code || 'INT').slice(0, 3).toUpperCase(),
      priority: 50,
    },
    utcDate: raw.utcDate,
    status: STATUS[raw.status] || 'scheduled',
    minute: numberOrNull(raw.minute),
    injuryTime: numberOrNull(raw.injuryTime),
    home,
    away,
    homeScore: numberOrNull(raw.score?.fullTime?.home),
    awayScore: numberOrNull(raw.score?.fullTime?.away),
    htHome: numberOrNull(raw.score?.halfTime?.home),
    htAway: numberOrNull(raw.score?.halfTime?.away),
    events,
    venue: raw.venue || null,
  };
}

export function providerDates(fromIso, toIso) {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  return { dateFrom: from.toISOString().slice(0, 10), dateTo: to.toISOString().slice(0, 10) };
}

export function filterByRange(matches, fromIso, toIso) {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  return matches.filter((match) => {
    const time = new Date(match.utcDate).getTime();
    return time >= from && time <= to;
  });
}

export function createClient({ token, fetchImpl = fetch }) {
  async function get(path) {
    const response = await fetchImpl(`https://api.football-data.org/v4${path}`, {
      headers: { 'X-Auth-Token': token },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 180);
      const error = new Error(`football-data.org returned ${response.status}${detail ? `: ${detail}` : ''}`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  return {
    async matches(dateFrom, dateTo) {
      const data = await get(`/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`);
      return (data.matches || []).map(normalizeMatch);
    },
    async match(id) {
      return normalizeMatch(await get(`/matches/${encodeURIComponent(id)}`));
    },
  };
}
