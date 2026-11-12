/** Unattended fixture, qualify, book, and repair cycle. It does not call Predict2u. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bookAll } from './bookers.mjs';
import { qualifyEvents } from './qualify.mjs';
import { inspectBooks, repairSettlement } from './quality.mjs';
import { selectionKey } from './selection.mjs';

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
    issues: [],
    settlement: 'open',
  };
}

function publicState(state) {
  return {
    updatedAt: state.updatedAt,
    feedAt: state.feedAt,
    feedError: state.feedError,
    eventCount: state.events.length,
    legCount: state.legs.length,
    settlement: state.settlement,
    books: state.books,
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

    const fresh = qualifyEvents(events, now).map((leg) => {
      const previous = (state.legs || []).find((item) => item.eventId === leg.eventId && item.market === leg.market);
      return previous ? { ...leg, status: previous.status || 'open', homeScore: previous.homeScore ?? null, awayScore: previous.awayScore ?? null, finished: Boolean(previous.finished) } : leg;
    });
    const settled = repairSettlement(fresh);
    if (settled.changed) {
      issues.push(...settled.issues);
      for (const issue of settled.issues) log('error', `Settlement repair: ${issue}`);
    }

    const legs = settled.legs.filter((leg) => new Date(leg.kickoff).getTime() >= now.getTime() && Number(leg.odds) >= 1.2);
    const key = selectionKey(legs);
    const sameSlip = state.slipKey === key;
    const checked = inspectBooks(sameSlip ? state.books : {});
    if (checked.issues.length) {
      issues.push(...checked.issues);
      for (const issue of checked.issues) log('error', issue);
    }

    let books = checked.books;
    if (!legs.length) {
      log('log', 'No open qualifying legs to book.');
    } else if (!sameSlip || checked.retry.length) {
      const desks = sameSlip ? checked.retry : null;
      try {
        const request = options.request || (await import('./curl-request.mjs')).requestJson;
        const booked = await bookAll(legs, request, undefined, desks);
        books = { ...books, ...booked };
        const again = inspectBooks(books);
        books = again.books;
        if (again.issues.length) {
          issues.push(...again.issues);
          for (const issue of again.issues) log('error', issue);
        }
        if (again.retry.length) log('error', `Still waiting on a real code from ${again.retry.join(', ')}.`);
        else log('log', `Booked ${legs.length} open legs.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Booking failed';
        issues.push(message);
        log('error', `Booking failed: ${message}`);
      }
    } else {
      log('log', 'Stored share codes still match the open slip.');
    }

    const next = {
      ...state,
      updatedAt: new Date().toISOString(),
      slipKey: key,
      legs: settled.legs,
      books,
      settlement: settled.status,
      issues: [...issues, ...(state.issues || [])].slice(0, 40),
    };
    save(next);
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

const engine = createEngine();

export function startEngine() {
  engine.start();
}

export function getEngineState() {
  return engine.getState();
}

export function getCachedEvents() {
  return engine.getEvents();
}

export function runEngineCycle() {
  return engine.run();
}

export { INTERVAL_MS };
