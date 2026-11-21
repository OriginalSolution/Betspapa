/** Unattended fixture, occurrence, book, and repair cycle. It does not call Predict2u. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bookAll } from './bookers.mjs';
import { loadHistories } from './history.mjs';
import { assertBookingRanges, boardDirty, projectBoard, serveBoard } from './oddsRange.mjs';
import { buildOccurrenceBoard, isOpenToday, isRealFixture, masterPick, teamUid } from './occurrence.mjs';
import { loadSettled, rememberSettled, saveSettled } from './research.mjs';
import { inspectBooks, repairSettlement } from './quality.mjs';
import { SLIP_CONCURRENCY, bookSlips, bookableLegs, bookingGroups, slipView, tierSlips, trendGroups } from './slips.mjs';
import { loadExtraPrices, loadUpcomingEvents, mergePrices } from './upcoming.mjs';
import { loadEngineSnapshot, publishEngineSnapshot } from './engineSnapshot.mjs';
import { collapsedLegs, shapeSample } from './guardianOps.mjs';

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
    tiers: [],
    slipCache: {},
    occurrenceByEvent: {},
    issues: [],
    settlement: 'open',
  };
}

function publicState(state, now = new Date()) {
  const view = serveBoard(state, now);
  return {
    updatedAt: view.updatedAt,
    feedAt: view.feedAt,
    feedError: view.feedError,
    eventCount: (view.events || state.events || []).length,
    legCount: view.master?.legCount ?? (view.legs || []).length,
    settlement: view.settlement,
    books: view.books,
    master: view.master,
    trends: view.trends || [],
    tiers: view.tiers || [],
    issues: view.issues,
    cycleNotes: Array.isArray(view.cycleNotes) ? view.cycleNotes : null,
    researchDrops: Array.isArray(view.researchDrops) ? view.researchDrops.slice(0, 40) : [],
  };
}

function slimLeg(leg) {
  return {
    eventId: leg.eventId,
    market: leg.market,
    match: leg.match,
    kickoff: leg.kickoff,
    odds: leg.odds,
    occurrence: leg.occurrence ?? null,
    sample: leg.sample ?? null,
    form: Array.isArray(leg.form) ? leg.form : null,
    opponentHeld: leg.opponentHeld === true ? true : null,
    opponentSample: leg.opponentSample || null,
    exception: leg.exception === true ? true : null,
    rate: Number.isFinite(Number(leg.rate)) ? Number(leg.rate) : null,
    teamsAgree: leg.teamsAgree === true ? true : null,
    homeSample: leg.homeSample || null,
    awaySample: leg.awaySample || null,
    leagueRisk: leg.leagueRisk === 'penalise' ? 'penalise' : null,
    agreement: leg.agreement || null,
    reasons: Array.isArray(leg.reasons) ? leg.reasons.slice(0, 8) : [],
  };
}

function slimBooks(books) {
  const next = {};
  for (const [desk, book] of Object.entries(books || {})) {
    if (!book || typeof book !== 'object') continue;
    next[desk] = {
      parts: (book.parts || []).filter((part) => part?.code).map((part) => ({
        code: part.code,
        link: part.link || '',
        totalOdds: part.totalOdds ?? null,
        legs: part.legs || 0,
        matches: Array.isArray(part.matches) ? part.matches : [],
      })),
      error: book.error || null,
      dropped: [],
    };
  }
  return next;
}

function slimSlip(slip, { cap = 0, includeLegs = true } = {}) {
  if (!slip) return null;
  const legs = Array.isArray(slip.legs) ? slip.legs : [];
  const shown = !includeLegs ? [] : cap > 0 ? legs.slice(0, cap) : legs;
  return {
    id: slip.id,
    name: slip.name || slip.label || slip.id,
    label: slip.label || slip.name || slip.id,
    market: slip.market || null,
    legCount: slip.legCount ?? legs.length,
    bookedAt: slip.bookedAt || null,
    books: slimBooks(slip.books),
    legs: shown.map(slimLeg),
  };
}

/** A small copy of a booked board. Enough codes and future kickoffs to restore, small enough to store. */
export function restartSnapshot(full, now = new Date()) {
  const clock = now instanceof Date ? now.getTime() : Number(now);
  const keep = (slip) => {
    if (!slip) return null;
    const future = (slip.legs || []).filter((leg) => Date.parse(leg.kickoff) >= clock).slice(0, 3);
    const slim = slimSlip(slip, { includeLegs: false });
    return slim ? { ...slim, legs: future.map(slimLeg) } : null;
  };
  const state = full || {};
  return {
    updatedAt: state.updatedAt || null,
    feedAt: state.feedAt || null,
    legCount: state.legCount ?? state.master?.legCount ?? 0,
    books: slimBooks(state.books),
    master: keep(state.master),
    trends: (state.trends || []).map(keep).filter(Boolean),
    tiers: (state.tiers || []).map(keep).filter(Boolean),
    issues: Array.isArray(state.issues) ? state.issues.slice(0, 4) : [],
  };
}

/** The phone board. Tier slips keep their codes and drop the duplicated leg lists. */
export function appEngineState(full) {
  const state = full || {};
  return {
    updatedAt: state.updatedAt || null,
    legCount: state.legCount ?? state.master?.legCount ?? 0,
    master: slimSlip(state.master, { cap: 18 }),
    trends: (state.trends || []).map((slip) => slimSlip(slip)),
    tiers: (state.tiers || []).map((slip) => slimSlip(slip, { includeLegs: false })),
    issues: Array.isArray(state.issues) ? state.issues.slice(0, 6) : [],
  };
}

function slipHasCode(slip) {
  const books = slip?.books || {};
  return Object.values(books).some((book) => (book?.parts || []).some((part) => part?.code));
}

export function boardHasCodes(state) {
  if (!state) return false;
  return slipHasCode({ books: state.books }) || slipHasCode(state.master) || (state.trends || []).some(slipHasCode) || (state.tiers || []).some(slipHasCode);
}

function stillOpen(slip, now) {
  if (!slip) return slip;
  const legs = (slip.legs || []).filter((leg) => {
    const kick = new Date(leg.kickoff).getTime();
    return Number.isFinite(kick) && kick >= now.getTime();
  });
  return { ...slip, legs, legCount: legs.length };
}

function keptBoard(previous, next, now, note) {
  const master = stillOpen(previous.master, now);
  const trends = (previous.trends || []).map((trend) => stillOpen(trend, now)).filter((trend) => (trend?.legs || []).length || slipHasCode(trend));
  const tierRows = (previous.tiers || []).map((tier) => stillOpen(tier, now)).filter((tier) => (tier?.legs || []).length || slipHasCode(tier));
  const legs = (previous.legs || []).filter((leg) => {
    const kick = new Date(leg.kickoff).getTime();
    return Number.isFinite(kick) && kick >= now.getTime();
  });
  const openLegs = (master?.legs || []).length || trends.some((trend) => (trend.legs || []).length) || tierRows.some((tier) => (tier.legs || []).length);
  if (!openLegs) return next;
  return {
    ...next,
    books: previous.books,
    master,
    trends,
    tiers: tierRows.length ? tierRows : previous.tiers || [],
    legs,
    slipKey: previous.slipKey,
    slipCache: previous.slipCache,
    issues: [note, ...(next.issues || [])].slice(0, 40),
  };
}

/**
 * A progress save must not replace a coded master with an empty one.
 * The master slip is booked last, so mid-cycle reads keep the previous codes.
 */
export function holdMasterCodes(previous, next, now = new Date()) {
  if (!next || slipHasCode(next.master) || !slipHasCode(previous?.master)) return next;
  const master = stillOpen(previous.master, now);
  if (!slipHasCode(master)) return next;
  const note = 'Keeping the last master codes until this cycle books the master slip.';
  return {
    ...next,
    master,
    books: slipHasCode({ books: previous.books }) ? previous.books : next.books,
    issues: [note, ...(next.issues || []).filter((line) => line !== note)].slice(0, 40),
  };
}

/** A cycle with no codes, or one that keeps less than 30% of the open legs, must not wipe the last booked board. */
export function preserveBoard(previous, next, now = new Date()) {
  if (collapsedLegs(previous, next, now)) {
    const kept = keptBoard(previous, next, now, 'Keeping the last booked board. This cycle kept less than 30% of the open legs.');
    if (kept !== next) return kept;
  }
  if (boardHasCodes(next)) return next;
  if (!boardHasCodes(previous)) return next;
  return keptBoard(previous, next, now, 'Keeping the last booked board. This cycle did not return codes.');
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
  let published = null;
  let servedView = null;
  let servedAt = 0;
  let activeGen = 0;
  let cycleStartedAt = null;
  const hangMs = options.hangMs ?? INTERVAL_MS * 2;
  let publishChain = Promise.resolve();
  let pendingSnapshot = null;
  let snapshotBusy = false;
  let timer = null;
  let kick = null;
  let nextRunAt = null;
  let diskOk = true;
  let diskError = '';
  let diskLogged = false;
  let lastDiskWrite = 0;
  let snapshotMode = 'disk';
  let snapshotError = '';
  let snapshotLogged = '';
  const historyCache = { teams: new Map(), stats: new Map() };
  const diskGapMs = options.diskGapMs ?? 20_000;

  function snapshotKey() {
    if (Object.prototype.hasOwnProperty.call(options, 'snapshotToken')) return String(options.snapshotToken || '');
    return process.env.ENGINE_SNAPSHOT_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
  }

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

  function save(next, gen = activeGen, force = true) {
    if (gen !== activeGen) return;
    state = next;
    if (!force && Date.now() - lastDiskWrite < diskGapMs) return;
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(file, JSON.stringify(next));
      lastDiskWrite = Date.now();
      diskOk = true;
      diskError = '';
      diskLogged = false;
    } catch (error) {
      diskOk = false;
      diskError = error instanceof Error ? error.message : 'disk write failed';
      if (!diskLogged) {
        diskLogged = true;
        log('error', `Could not store the booked board on the data disk: ${diskError}`);
      }
    }
  }

  function noteSnapshot(mode, error, message, level = 'log') {
    snapshotMode = mode;
    snapshotError = error || '';
    if (snapshotLogged === `${mode}:${error || ''}`) return;
    snapshotLogged = `${mode}:${error || ''}`;
    if (message) log(level, message);
  }

  function queueSnapshot(next, now) {
    const publish = options.publishSnapshot || publishEngineSnapshot;
    const custom = Boolean(options.publishSnapshot);
    if (!custom && !snapshotKey()) {
      noteSnapshot('no-token', 'no snapshot token', 'Booked board is on the data disk. No snapshot token, so the GitHub copy is skipped.');
      return;
    }
    pendingSnapshot = restartSnapshot(publicState(next, now), now);
    if (snapshotBusy) return;
    snapshotBusy = true;
    publishChain = publishChain.then(async () => {
      while (pendingSnapshot) {
        const body = pendingSnapshot;
        pendingSnapshot = null;
        try {
          const result = await publish(body);
          if (!result || result.ok === false) {
            const error = result?.error || 'refused';
            noteSnapshot('failed', error, `Could not store the booked board: ${error}`, 'error');
          } else {
            snapshotLogged = '';
            snapshotMode = 'published';
            snapshotError = '';
            log('log', 'Stored the booked board for the next restart.');
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'snapshot failed';
          noteSnapshot('failed', message, `Could not store the booked board: ${message}`, 'error');
        }
      }
      snapshotBusy = false;
    });
  }

  function remember(next, now = new Date(), gen = activeGen, { publish = false, force = false } = {}) {
    save(next, gen, force);
    if (gen !== activeGen || !publish || !boardHasCodes(next)) return;
    queueSnapshot(next, now);
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
        if (!Array.isArray(body?.events)) {
          log('error', `Fixture schema changed: ${shapeSample(body)}`);
          throw new Error('Fixture feed schema changed');
        }
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
    const gen = activeGen;
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
      const kept = projectBoard({ ...state, events, updatedAt: new Date().toISOString(), issues: [...issues, ...(state.issues || [])].slice(0, 40) }, now);
      save(kept, gen);
      return publicState(kept, now);
    }
    if (!options.loadHistories && loaded.teams > 0 && loaded.teamErrors === loaded.teams) {
      issues.push('Team history failed for every side. Keeping the previous slips.');
      log('error', issues[issues.length - 1]);
      const kept = projectBoard({ ...state, events, updatedAt: new Date().toISOString(), issues: [...issues, ...(state.issues || [])].slice(0, 40) }, now);
      save(kept, gen);
      return publicState(kept, now);
    }

    const settledFile = join(dir, 'research-settled.json');
    const settledRows = loadSettled(settledFile);
    const board = buildOccurrenceBoard(events, loaded.histories, now, { settled: settledRows });
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
    try {
      saveSettled(settledFile, rememberSettled(settledRows, settled.legs));
    } catch (error) {
      log('error', `Could not store league results: ${error instanceof Error ? error.message : error}`);
    }

    const legs = bookableLegs(settled.legs, now);
    const chosen = masterPick(legs);
    const master = { id: 'master', name: '80%+ Master Slip', label: '80%+ Master Slip', legs: chosen };
    const trends = trendGroups(legs).map((trend) => ({ ...trend, name: trend.label }));
    const tiers = tierSlips(legs);
    issues.push(`80%+ occurrence: ${legs.length} picks across ${trends.length} markets, ${chosen.length} on the master slip.`);
    issues.push(...board.notes);
    if (!legs.length) {
      issues.push('No open picks. Finished matches are not shown.');
      log('log', 'No open 80%+ legs to book.');
    } else log('log', issues.find((line) => line.startsWith('80%+ occurrence')) || '');
    const before = state;
    const beforeOpen = [before.master, ...(before.trends || []), ...(before.tiers || [])].some((slip) =>
      (slip?.legs || []).some((leg) => new Date(leg.kickoff).getTime() >= now.getTime()),
    );
    const preview = projectBoard({
      ...state,
      updatedAt: new Date().toISOString(),
      feedAt: state.feedAt,
      events,
      legs: settled.legs,
      master,
      trends,
      tiers,
      occurrenceByEvent: board.byEvent,
      researchDrops: board.researchDrops || [],
      settlement: settled.status,
      cycleNotes: issues,
      issues: issues.slice(0, 40),
    }, now);
    if ((legs.length || !beforeOpen) && !boardHasCodes(before)) save(preview, gen);
    const request = legs.length ? options.request || (await import('./curl-request.mjs')).requestJson : null;
    const bookNow = () => (options.now ? options.now() : new Date()).getTime();
    const priorCache = state.slipCache && Object.keys(state.slipCache).length ? state.slipCache : {};
    const headlines = tiers.filter((slip) => !slip.market);
    const markets = tiers.filter((slip) => slip.market);
    const queue = [...headlines, ...markets, ...trends, master];
    const payload = queue.flatMap((slip) => bookingGroups(slip, bookableLegs(slip.legs, now)).flat());
    let booking = { results: queue.map((slip) => ({ ...slip, books: {}, bookedAt: null })), cache: priorCache, issues: [] };
    try {
      assertBookingRanges(payload);
      if (request) {
        booking = await bookSlips({
          slips: queue,
          cache: priorCache,
          book: (slipLegs, desks) => bookAll(slipLegs, request, undefined, desks),
          now: bookNow,
          gapMs: 0,
          concurrency: options.slipConcurrency ?? SLIP_CONCURRENCY,
          pause,
          log,
      onProgress: (progress) => {
        const booked = new Map(progress.results.map((slip) => [slip.id, slip]));
        const key = booked.get('master')?.key || progress.results[0]?.key;
        const clock = options.now ? options.now() : new Date();
        const viewOf = (slip) => {
          const done = booked.get(slip.id);
          return done ? slipView(done, key, clock) : slip;
        };
        const partial = {
          ...state,
          updatedAt: new Date().toISOString(),
          feedAt: state.feedAt,
          events,
          slipKey: key,
          legs: settled.legs,
          books: inspectBooks(booked.get('master')?.books).books,
          master: master ? viewOf(master) : null,
          trends: trends.map(viewOf),
          tiers: tiers.map(viewOf),
          slipCache: progress.cache,
          occurrenceByEvent: board.byEvent,
      researchDrops: board.researchDrops || [],
          settlement: settled.status,
          cycleNotes: [...issues, ...progress.issues],
          issues: [...issues, ...progress.issues].slice(0, 40),
        };
        const nextBoard = projectBoard(holdMasterCodes(before, partial, clock), clock);
        if (boardHasCodes(nextBoard)) remember(nextBoard, clock, gen);
      },
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Range check blocked booking.';
      issues.push(message);
      log('error', message);
    }
    issues.push(...booking.issues);
    const bookedById = new Map(booking.results.filter(Boolean).map((slip) => [slip.id, slip]));
    const masterResult = bookedById.get('master');
    const key = masterResult?.key;
    const clock = options.now ? options.now() : new Date();
    const books = inspectBooks(masterResult?.books).books;
    const masterView = masterResult ? slipView(masterResult, key, clock) : null;
    const trendViews = trends.map((trend) => slipView(bookedById.get(trend.id) || trend, key, clock));
    const tierViews = tiers.map((trend) => slipView(bookedById.get(trend.id) || trend, key, clock));

    const next = {
      ...state,
      updatedAt: new Date().toISOString(),
      feedAt: state.feedAt,
      events,
      slipKey: key,
      legs: settled.legs,
      books,
      master: masterView,
      trends: trendViews,
      tiers: tierViews,
      slipCache: booking.cache,
      occurrenceByEvent: board.byEvent,
      researchDrops: board.researchDrops || [],
      settlement: settled.status,
      cycleNotes: issues,
      issues: issues.slice(0, 40),
    };
    const kept = projectBoard(preserveBoard(before, holdMasterCodes(before, next, now), now), now);
    if (gen !== activeGen) return publicState(state, now);
    remember(kept, now, gen, { publish: true, force: true });
    if (options.crests !== false && !options.fetchImpl) {
      const fromDay = now.toISOString().slice(0, 10);
      const toDay = new Date(now.getTime() + 3 * 86_400_000).toISOString().slice(0, 10);
      import('./crestResolve.mjs')
        .then(({ syncFixtureCrests }) => syncFixtureCrests(events, { fromDay, toDay, limit: 24 }))
        .catch((error) => log('error', `Crest resolve failed: ${error instanceof Error ? error.message : 'crest resolve failed'}`));
    }
    return publicState(kept, now);
  }

  function hung() {
    return Boolean(running) && cycleStartedAt && Date.now() - cycleStartedAt > hangMs;
  }

  function run() {
    if (hung()) {
      activeGen += 1;
      running = null;
      cycleStartedAt = null;
      log('error', 'The booking cycle hung past two intervals. Starting another.');
    }
    if (!running) {
      const gen = activeGen;
      cycleStartedAt = Date.now();
      running = cycle()
        .finally(() => {
          if (gen === activeGen) {
            running = null;
            cycleStartedAt = null;
          }
        })
        .then(async (result) => {
          if (options.onCycle) {
            try {
              await options.onCycle(result);
            } catch (error) {
              log('error', `Cycle watch failed: ${error instanceof Error ? error.message : error}`);
            }
          }
          return result;
        });
    }
    return running;
  }

  function viewed(now = options.now ? options.now() : new Date()) {
    if (running && servedView && Date.now() - servedAt < 15_000) return servedView;
    const view = publicState(state, now);
    const shown = running && published && boardHasCodes(published) && !boardHasCodes(view) ? published : view;
    if (boardHasCodes(view)) published = view;
    servedView = shown;
    servedAt = Date.now();
    return shown;
  }

  return {
    getState: () => viewed(),
    getRaw: () => state,
    getPersistence: () => ({ disk: diskOk, snapshot: snapshotMode, error: snapshotError || diskError }),
    needsRepair: () => boardDirty(state, options.now ? options.now() : new Date()),
    getEvents: () => state.events,
    getOccurrence: () => state.occurrenceByEvent || {},
    getSchedule: () => ({ intervalMs: INTERVAL_MS, nextRunAt, running: Boolean(running), startedAt: cycleStartedAt, hangMs }),
    restartIfHung() {
      if (!hung()) return false;
      void run();
      return true;
    },
    run,
    stop() {
      clearTimeout(kick);
      clearInterval(timer);
      kick = null;
      timer = null;
    },
    async restore() {
      if (boardHasCodes(state)) return false;
      const loadSnapshot = options.loadSnapshot || loadEngineSnapshot;
      const remote = await loadSnapshot();
      if (!remote || !boardHasCodes(remote)) return false;
      const open = [remote.master, ...(remote.trends || []), ...(remote.tiers || [])]
        .filter(Boolean)
        .some((slip) => (slip.legs || []).some((leg) => new Date(leg.kickoff).getTime() >= (options.now ? options.now() : new Date()).getTime()));
      if (!open) {
        log('log', 'Skipped a finished board. Finished matches are not shown.');
        return false;
      }
      state = {
        ...emptyState(),
        ...remote,
        events: Array.isArray(remote.events) ? remote.events : [],
        legs: Array.isArray(remote.legs) ? remote.legs : remote.master?.legs || [],
        books: remote.books || remote.master?.books || {},
        master: remote.master || null,
        trends: Array.isArray(remote.trends) ? remote.trends : [],
        tiers: Array.isArray(remote.tiers) ? remote.tiers : [],
      };
      save(state);
      log('log', 'Restored the last booked board.');
      return true;
    },
    start() {
      if (timer) return;
      nextRunAt = Date.now() + 20_000;
      void this.restore().finally(() => {
        void run();
      });
      timer = setInterval(() => {
        nextRunAt = Date.now() + INTERVAL_MS;
        void run();
      }, INTERVAL_MS);
      timer.unref?.();
    },
  };
}

// In production the engine reads the catalogue directly instead of calling its own public URL.
const engine = createEngine({
  loadEvents: () => loadUpcomingEvents({ force: true }),
  loadExtraPrices: () => loadExtraPrices(),
  onCycle: (result) => notifyEngineCycle(result),
});

async function notifyEngineCycle(result) {
  for (const fn of cycleListeners) {
    try {
      await fn(result);
    } catch (error) {
      console.error(`[engine] Cycle watch failed: ${error instanceof Error ? error.message : error}`);
    }
  }
  return result;
}

export function startEngine() {
  engine.start();
}

const cycleListeners = [];

export function onEngineCycle(fn) {
  cycleListeners.push(fn);
  return () => {
    const index = cycleListeners.indexOf(fn);
    if (index >= 0) cycleListeners.splice(index, 1);
  };
}

export function getEngineState() {
  return engine.getState();
}

export function enginePersistence() {
  return engine.getPersistence();
}

export function getEngineRaw() {
  return engine.getRaw();
}

export function engineNeedsRepair() {
  return engine.needsRepair();
}

export function getEngineSchedule() {
  return engine.getSchedule();
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

export function restartEngineIfHung() {
  return engine.restartIfHung();
}

export function restoreEngine() {
  return engine.restore();
}

export { INTERVAL_MS };
