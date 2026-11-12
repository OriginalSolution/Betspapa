/**
 * Resolve crests for today and the next three days.
 * Usage: node scripts/backfill-crests.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { coverage, loadCatalog, measureWikipedia, resolveTeams, teamsFromEvents } from '../server/crestResolve.mjs';

const root = process.cwd();
const memoryFile = join(root, 'data', 'crests', 'memory.json');
const feedUrl = 'https://api.betspapa.com/api/sportybet/upcoming';

function day(date) {
  return date.toISOString().slice(0, 10);
}

function loadMemory() {
  try {
    return JSON.parse(readFileSync(memoryFile, 'utf8'));
  } catch {
    return {};
  }
}

function saveMemory(memory) {
  mkdirSync(dirname(memoryFile), { recursive: true });
  writeFileSync(memoryFile, JSON.stringify(memory));
}

const now = new Date();
const fromDay = day(now);
const toDay = day(new Date(now.getTime() + 3 * 86_400_000));
console.log(`[crests] Window ${fromDay} to ${toDay}`);

const response = await fetch(feedUrl, { signal: AbortSignal.timeout(30_000) });
if (!response.ok) throw new Error(`Fixture feed returned ${response.status}`);
const body = await response.json();
const events = (body.events || []).filter((event) => {
  const kick = String(event.kickoff || '').slice(0, 10);
  return kick >= fromDay && kick <= toDay;
});
const teams = teamsFromEvents(events);
console.log(`[crests] ${events.length} fixtures, ${teams.length} team rows`);

const memory = loadMemory();
let logged = 0;
const started = Date.now();

const wikiPromise = measureWikipedia(teams, { memory, workers: 2 }).catch((error) => {
  console.error(`[crests] Wikipedia baseline failed: ${error.message}`);
  return {};
});

const resolved = await resolveTeams(teams, {
  root,
  memory,
  sportsGap: 1200,
  workers: 3,
  onTeam(team, result) {
    logged += 1;
    if (logged % 15 === 0 || logged === teams.length) {
      const seconds = Math.round((Date.now() - started) / 1000);
      console.log(`[crests] ${logged} looked up in ${seconds}s. Last ${team.name} -> ${result?.source || 'missing'}`);
      saveMemory(memory);
    }
  },
});

const wikiHits = await wikiPromise;
const catalog = resolved.catalog || loadCatalog(root);
const report = coverage(events, catalog, wikiHits);
report.from = fromDay;
report.to = toDay;
report.missing = resolved.missing.length;
report.generatedAt = new Date().toISOString();
writeFileSync(join(root, 'public', 'crests', 'coverage.json'), JSON.stringify(report, null, 2));
saveMemory(memory);
console.log(`[crests] Coverage ${JSON.stringify(report)}`);
