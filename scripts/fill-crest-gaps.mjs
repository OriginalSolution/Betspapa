/** Second pass for teams the first resolve missed, then a Wikipedia-only before count. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { coverage, loadCatalog, measureWikipedia, resolveTeams, teamsFromEvents } from '../server/crestResolve.mjs';

const root = process.cwd();
const memoryFile = join(root, 'data', 'crests', 'memory.json');
const feedUrl = 'https://api.betspapa.com/api/sportybet/upcoming';

function day(date) {
  return date.toISOString().slice(0, 10);
}

let memory = {};
try {
  memory = JSON.parse(readFileSync(memoryFile, 'utf8'));
} catch {
  memory = {};
}

const now = new Date();
const fromDay = day(now);
const toDay = day(new Date(now.getTime() + 4 * 86_400_000));
const response = await fetch(feedUrl, { signal: AbortSignal.timeout(30_000) });
if (!response.ok) throw new Error(`Fixture feed returned ${response.status}`);
const body = await response.json();
const events = (body.events || []).filter((event) => {
  const kick = String(event.kickoff || '').slice(0, 10);
  return kick >= fromDay && kick <= toDay;
});
const teams = teamsFromEvents(events);
console.log(`[crests] Filling gaps for ${teams.length} team rows`);

const filled = await resolveTeams(teams, {
  root,
  memory,
  workers: 2,
  sportsGap: 1200,
  wikiGap: 350,
  onTeam(team, result) {
    console.log(`[crests] gap ${team.name} -> ${result?.source || 'missing'}`);
  },
});

mkdirSync(dirname(memoryFile), { recursive: true });
writeFileSync(memoryFile, JSON.stringify(memory));

console.log('[crests] Measuring the Wikipedia-only baseline');
const wikiHits = await measureWikipedia(teams, { memory, workers: 1, wikiGap: 350 });
const catalog = filled.catalog || loadCatalog(root);
const report = coverage(events, catalog, wikiHits);
report.from = fromDay;
report.to = toDay;
report.missing = filled.missing.length;
report.generatedAt = new Date().toISOString();
writeFileSync(join(root, 'public', 'crests', 'coverage.json'), JSON.stringify(report, null, 2));
console.log(`[crests] Coverage ${JSON.stringify(report)}`);
