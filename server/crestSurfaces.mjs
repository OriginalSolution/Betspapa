/**
 * Crest coverage the way the app paints it. A URL counts only when the crest
 * store can serve that file. A missing file is a shield, not a hit.
 */

function pair(name, id, url) {
  return { name: String(name || ''), id: id || '', url: url || '' };
}

function tally(pairs, fileExists) {
  let real = 0;
  let shield = 0;
  let broken = 0;
  const missing = [];
  for (const row of pairs) {
    const hasFile = Boolean(row.url) && fileExists(row.url);
    if (hasFile) real += 1;
    else if (row.url) {
      broken += 1;
      missing.push(row.name);
    } else {
      shield += 1;
      if (row.name) missing.push(row.name);
    }
  }
  const total = pairs.length;
  return {
    total,
    real,
    shield,
    broken,
    pct: total ? Number(((100 * real) / total).toFixed(1)) : null,
    missing: [...new Set(missing)].sort(),
  };
}

function fixturePairs(events, crestFor) {
  const pairs = [];
  for (const event of events || []) {
    pairs.push(pair(event.home, event.homeId, crestFor(event.homeId, event.home)));
    pairs.push(pair(event.away, event.awayId, crestFor(event.awayId, event.away)));
  }
  return pairs;
}

function legPairs(slips, crestFor, eventsById) {
  const pairs = [];
  for (const slip of slips || []) {
    for (const leg of slip?.legs || []) {
      const event = eventsById.get(String(leg.eventId));
      const home = event?.home || '';
      const away = event?.away || '';
      pairs.push(pair(home, event?.homeId, crestFor(event?.homeId, home)));
      pairs.push(pair(away, event?.awayId, crestFor(event?.awayId, away)));
    }
  }
  return pairs;
}

function codePairs(codes, crestFor) {
  const pairs = [];
  const strategies = codes?.strategies || [];
  for (const strategy of strategies) {
    const parts = [...(strategy.week?.parts || [])];
    for (const day of codes?.days || []) parts.push(...(codes.dailies?.[day]?.[strategy.id]?.parts || []));
    for (const part of parts) {
      for (const leg of part.legs || []) {
        pairs.push(pair(leg.home, leg.homeId, crestFor(leg.homeId, leg.home)));
        pairs.push(pair(leg.away, leg.awayId, crestFor(leg.awayId, leg.away)));
      }
    }
  }
  return pairs;
}

/**
 * @param crestFor (id, name) => url | ''  The same function the board uses.
 * fileExists defaults to "the URL is non-empty", because crestFor already
 * returns a URL only when the file is on disk.
 */
export function crestSurfaces({ events = [], engine = null, codes = null, live = [], crestFor = () => '', fileExists = (url) => Boolean(url) } = {}) {
  const byId = new Map((events || []).map((event) => [String(event.eventId), event]));
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const todayEvents = (events || []).filter((event) => String(event.kickoff || '').slice(0, 10) === today);
  const slips = [engine?.master, ...(engine?.trends || [])].filter(Boolean);
  const rows = [
    ['today', fixturePairs(todayEvents.length ? todayEvents : events, crestFor)],
    ['live', fixturePairs(live, crestFor)],
    ['picks', legPairs(slips, crestFor, byId)],
    ['trends', legPairs(engine?.trends || [], crestFor, byId)],
    ['slips', legPairs(slips, crestFor, byId)],
    ['codes', codePairs(codes, crestFor)],
  ];
  return rows
    .filter(([, pairs]) => pairs.length)
    .map(([name, pairs]) => ({ name, ...tally(pairs, fileExists) }));
}
