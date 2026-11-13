/**
 * Resolve crests for today through the next four days.
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

const args = process.argv.slice(2);
const noWiki = args.includes('--no-wiki');
const dates = args.filter((arg) => /^\d{4}-\d{2}-\d{2}$/.test(arg));
const now = new Date();
const fromDay = dates[0] || day(now);
const toDay = dates[1] || day(new Date(now.getTime() + 4 * 86_400_000));
console.log(`[crests] Window ${fromDay} to ${toDay}`);

const response = await fetch(feedUrl, { signal: AbortSignal.timeout(30_000) });
if (!response.ok) throw new Error(`Fixture feed returned ${response.status}`);
const body = await response.json();
const events = (body.events || []).filter((event) => {
  const kick = String(event.kickoff || '').slice(0, 10);
  return kick >= fromDay && kick <= toDay;
});
const teams = teamsFromEvents(events);
const priorMissing = readJsonSafe(join(root, 'public', 'crests', 'missing.json'));
const seen = new Set(teams.map((team) => `${team.name}|${team.area || ''}`));
for (const team of priorMissing.teams || []) {
  const key = `${team.name}|${team.area || ''}`;
  if (!team?.name || seen.has(key)) continue;
  seen.add(key);
  teams.push({ id: team.id, name: team.name, area: team.area || '', competition: team.competition || '' });
}
console.log(`[crests] ${events.length} fixtures, ${teams.length} team rows`);

function readJsonSafe(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return { teams: [] };
  }
}

const memory = loadMemory();
let logged = 0;
const started = Date.now();
const before = coverage(events, loadCatalog(root));
console.log(`[crests] Before ${JSON.stringify(before)}`);

const wikiPromise = noWiki
  ? Promise.resolve(null)
  : measureWikipedia(teams, { memory, workers: 2 }).catch((error) => {
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
report.layeredBefore = before.after;
report.generatedAt = new Date().toISOString();
writeFileSync(join(root, 'public', 'crests', 'coverage.json'), JSON.stringify(report, null, 2));
saveMemory(memory);
console.log(`[crests] Coverage ${JSON.stringify(report)}`);
