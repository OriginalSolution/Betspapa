/** Unattended fixture, occurrence, book, and repair cycle. It does not call Predict2u. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bookAll } from './bookers.mjs';
import { loadHistories } from './history.mjs';
import { buildOccurrenceBoard, isOpenToday, isRealFixture, masterPick, teamUid } from './occurrence.mjs';
import { inspectBooks, repairSettlement } from './quality.mjs';
import { bookSlips, bookableLegs, slipView, trendGroups } from './slips.mjs';
import { loadExtraPrices, loadUpcomingEvents, mergePrices } from './upcoming.mjs';

const FEED = 'https://api.betspapa.com/api/sportybet/upcoming';
const INTERVAL_MS = 15 * 60 * 1000;

function emptyState() {
  return {
    updatedAt: null,
    feedAt: null,
    feedError: null,
    events: [],
    slipKey: '',
    legs: [],
    books: {},
    master: null,
    trends: [],
    slipCache: {},
    occurrenceByEvent: {},
    issues: [],
    settlement: 'open',
  };
}

function scrubShort(slip) {
  if (!slip || !Array.isArray(slip.legs)) return slip || null;
  const legs = slip.legs.filter((leg) => Number(leg.odds) >= 1.2);
  return { ...slip, legs, legCount: legs.length };
}

function publicState(state) {
  return {
    updatedAt: state.updatedAt,
    feedAt: state.feedAt,
    feedError: state.feedError,
    eventCount: state.events.length,
    legCount: state.master?.legCount ?? state.legs.length,
    settlement: state.settlement,
    books: state.books,
    master: scrubShort(state.master),
    trends: (state.trends || []).map(scrubShort),
    issues: state.issues,
  };
}

async function pause(ms) {
  if (!ms) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function createEngine(options = {}) {
  const dir = options.dir || process.env.ENGINE_DATA_DIR || join(process.cwd(), 'data', 'engine');
  const file = join(dir, 'engine-state.json');
  const log = options.log || ((level, message) => {
    const line = `[engine] ${message}`;
    if (level === 'error') console.error(line);
    else console.log(line);
  });
  let state = load();
  let running = null;
  let timer = null;
  let kick = null;
  const historyCache = { teams: new Map(), stats: new Map() };

  function teamIds(events, now) {
    const ids = [];
    for (const event of events) {
      if (!isRealFixture(event) || !isOpenToday(event, now)) continue;
      const home = teamUid(event.homeId);
      const away = teamUid(event.awayId);
      if (home != null) ids.push(home);
      if (away != null) ids.push(away);
    }
    return ids;
  }

  function load() {
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8'));
      return { ...emptyState(), ...parsed, events: Array.isArray(parsed.events) ? parsed.events : [], legs: Array.isArray(parsed.legs) ? parsed.legs : [] };
    } catch {
      return emptyState();
    }
  }

  function save(next) {
    state = next;
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(file, JSON.stringify(next));
    } catch (error) {
      log('error', `Could not store engine state: ${error.message}`);
    }
  }

  async function fetchFeed() {
    if (options.loadEvents) return options.loadEvents();
    const fetchImpl = options.fetchImpl || fetch;
    const retryMs = options.retryMs ?? 2000;
    let last = new Error('Fixture feed failed');
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const response = await fetchImpl(FEED, { signal: AbortSignal.timeout(25_000) });
        if (!response.ok) throw new Error(`Betspapa fixtures returned ${response.status}`);
        const body = await response.json();
        if (!Array.isArray(body.events)) throw new Error('Fixture feed failed');
        return body.events;
      } catch (error) {
        last = error instanceof Error ? error : new Error(String(error));
        log('error', `Fixture attempt ${attempt} failed: ${last.message}`);
        if (attempt < 3) await pause(retryMs * attempt);
      }
    }
    throw last;
  }

  async function cycle() {
    const issues = [];
    const now = options.now ? options.now() : new Date();
    let events = state.events;
    try {
      events = await fetchFeed();
      state = { ...state, events, feedAt: new Date().toISOString(), feedError: null };
      log('log', `Fixture feed ok (${events.length} events).`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Fixture feed failed';
      issues.push(`Fixture feed failed: ${message}`);
      state = { ...state, feedError: message };
      log('error', `Fixture feed failed: ${message}. Keeping ${events.length} cached events.`);
    }

    if (options.loadExtraPrices) {
      try {
        events = mergePrices(events, await options.loadExtraPrices());
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Corner prices failed';
        issues.push(`Corner and card prices failed: ${message}`);
        log('error', message);
      }
    }

    const ids = teamIds(events, now);
    let loaded;
    try {
      loaded = options.loadHistories
        ? { histories: await options.loadHistories(events), teamErrors: 0, statsMissing: 0, statsDeferred: 0, teams: 0 }
        : await loadHistories(ids, { cache: historyCache, log, now: now.getTime() });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Team history failed';
      issues.push(`Team history failed: ${message}. Keeping the previous slips.`);
      log('error', message);
      const kept = { ...state, events, updatedAt: new Date().toISOString(), issues: [...issues, ...(state.issues || [])].slice(0, 40) };
      save(kept);
      return publicState(kept);
    }
    if (!options.loadHistories && loaded.teams > 0 && loaded.teamErrors === loaded.teams) {
      issues.push('Team history failed for every side. Keeping the previous slips.');
      log('error', issues[issues.length - 1]);
      const kept = { ...state, events, updatedAt: new Date().toISOString(), issues: [...issues, ...(state.issues || [])].slice(0, 40) };
      save(kept);
      return publicState(kept);
    }

    const board = buildOccurrenceBoard(events, loaded.histories, now);
    if (loaded.statsMissing) board.notes.push(`No corner or card count for ${loaded.statsMissing} recent matches, so those lines were skipped where the sample fell under 8.`);
    if (loaded.statsDeferred) board.notes.push(`Corner and card counts for ${loaded.statsDeferred} recent matches wait for the next cycle.`);
    const fresh = board.legs.map((leg) => {
      const previous = (state.legs || []).find((item) => item.eventId === leg.eventId && item.market === leg.market);
      return previous ? { ...leg, status: previous.status || 'open', homeScore: previous.homeScore ?? null, awayScore: previous.awayScore ?? null, finished: Boolean(previous.finished) } : leg;
    });
    const settled = repairSettlement(fresh);
    if (settled.changed) {
      issues.push(...settled.issues);
      for (const issue of settled.issues) log('error', `Settlement repair: ${issue}`);
    }

    const legs = bookableLegs(settled.legs, now);
    const chosen = masterPick(legs);
    const master = { id: 'master', name: '80%+ Master Slip', label: '80%+ Master Slip', legs: chosen };
    const trends = trendGroups(legs).map((trend) => ({ ...trend, name: trend.label }));
    issues.push(`80%+ occurrence: ${legs.length} picks across ${trends.length} markets, ${chosen.length} on the master slip.`);
    issues.push(...board.notes);
    if (!legs.length) log('log', 'No open 80%+ legs to book.');
    else log('log', issues.find((line) => line.startsWith('80%+ occurrence')) || '');
    const request = legs.length ? options.request || (await import('./curl-request.mjs')).requestJson : null;
    const booking = await bookSlips({
      slips: [master, ...trends],
      cache: state.slipCache && Object.keys(state.slipCache).length ? state.slipCache : state.slipKey ? { [state.slipKey]: { books: state.books || {}, attempts: {}, lastAttemptAt: 0, bookedAt: state.updatedAt } } : {},
      book: (slipLegs, desks) => bookAll(slipLegs, request, undefined, desks),
      now: now.getTime(),
      gapMs: options.slipGapMs ?? 4000,
      pause,
      log,
    });
    issues.push(...booking.issues);
    const [masterResult, ...trendResults] = booking.results;
    const key = masterResult.key;
    const books = inspectBooks(masterResult.books).books;
    const masterView = slipView(masterResult, key);
    const trendViews = trendResults.map((trend) => slipView(trend, key));

    const next = {
      ...state,
      updatedAt: new Date().toISOString(),
      slipKey: key,
      legs: settled.legs,
      books,
      master: masterView,
      trends: trendViews,
      slipCache: booking.cache,
      occurrenceByEvent: board.byEvent,
      settlement: settled.status,
      issues: [...issues, ...(state.issues || [])].slice(0, 40),
    };
    save(next);
    if (options.crests !== false && !options.fetchImpl) {
      const fromDay = now.toISOString().slice(0, 10);
      const toDay = new Date(now.getTime() + 3 * 86_400_000).toISOString().slice(0, 10);
      import('./crestResolve.mjs')
        .then(({ syncFixtureCrests }) => syncFixtureCrests(events, { fromDay, toDay, limit: 24 }))
        .catch((error) => log('error', `Crest resolve failed: ${error instanceof Error ? error.message : 'crest resolve failed'}`));
    }
    return publicState(next);
  }

  function run() {
    if (!running) {
      running = cycle().finally(() => {
        running = null;
      });
    }
    return running;
  }

  return {
    getState: () => publicState(state),
    getEvents: () => state.events,
    getOccurrence: () => state.occurrenceByEvent || {},
    run,
    start() {
      if (timer) return;
      kick = setTimeout(() => void run(), 20_000);
      timer = setInterval(() => void run(), INTERVAL_MS);
      kick.unref?.();
      timer.unref?.();
    },
  };
}

// In production the engine reads the catalogue directly instead of calling its own public URL.
const engine = createEngine({
  loadEvents: () => loadUpcomingEvents({ force: true }),
  loadExtraPrices: () => loadExtraPrices(),
});

export function startEngine() {
  engine.start();
}

export function getEngineState() {
  return engine.getState();
}

export function getCachedEvents() {
  return engine.getEvents();
}

export function getEventOccurrence() {
  return engine.getOccurrence();
}

export function runEngineCycle() {
  return engine.run();
}

export { INTERVAL_MS };
