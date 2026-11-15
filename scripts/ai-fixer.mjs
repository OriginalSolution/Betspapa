/**
 * Turns a guardian incident or a failed CI run into a small pull request.
 * Exits 0 when XAI_API_KEY is missing or the monthly cap is already spent.
 * It never creates a release, a tag, or a commit that touches secrets.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const MONTHLY_CAP_USD = 20;
export const INPUT_USD_PER_MILLION = 3;
export const OUTPUT_USD_PER_MILLION = 15;
const MODEL = process.env.XAI_MODEL || 'grok-4';

const BLOCKED = /(keystore|\.env|secret|credential|service-account|google-services|id_rsa|private_key)/i;

export function pathAllowed(file) {
  const path = String(file || '').replace(/\\/g, '/').replace(/^\.\//, '');
  if (!path || path.startsWith('/') || path.includes('..')) return false;
  if (BLOCKED.test(path)) return false;
  if (path === 'scripts/ai-fixer.mjs' || path === '.github/workflows/ai-fixer.yml') return false;
  if (path.startsWith('.git/')) return false;
  return true;
}

export function spendCost(usage) {
  const input = Number(usage?.prompt_tokens) || 0;
  const output = Number(usage?.completion_tokens) || 0;
  const usd = (input / 1_000_000) * INPUT_USD_PER_MILLION + (output / 1_000_000) * OUTPUT_USD_PER_MILLION;
  return { input, output, usd: Math.round(usd * 10_000) / 10_000 };
}

export function nextSpend(previous, cost, now = new Date()) {
  const month = (now instanceof Date ? now : new Date(now)).toISOString().slice(0, 7);
  const prior = previous?.month === month ? Number(previous.usd) || 0 : 0;
  return { month, usd: Math.round((prior + cost) * 10_000) / 10_000 };
}

export function overCap(record) {
  return (Number(record?.usd) || 0) >= MONTHLY_CAP_USD;
}

/** True only for the monitor bug that blames a status which already matched. */
export function monitorPatchAllowed(log) {
  return /answered\s+(\d+)\s+\(expected\s+\1\)/.test(String(log || ''));
}

/** A monitor repair may change the checker, not the server and not checks.json. */
export function limitMonitorProposal(proposal) {
  const files = (proposal?.files || []).filter((file) => {
    const path = String(file?.path || '').replace(/\\/g, '/').replace(/^\.\//, '');
    return path.startsWith('.github/monitor/') && path.endsWith('.py') && pathAllowed(path);
  });
  return { summary: String(proposal?.summary || 'Monitor repair').slice(0, 240), files };
}

export function instructions(incident) {
  const base = 'You repair the Betspapa Node server. Reply with JSON only: {"summary":"...","files":[{"path":"server/file.mjs","content":"full file"}]}. Change as little as possible. Never include secrets, keystores, release tags, or workflow files that disable the spend cap.';
  if (incident?.source !== 'monitor') return base;
  return `${base} This incident is from the GitHub Actions monitor (.github/monitor/monitor.py and monitor_lib.py). Patch those Python files only when the log says "answered N (expected N)" for the same N: that blames a status which already matched, so name the condition that actually failed. Do not delete or relax expect, contains, or json_ok_field. If the log already names a real remote condition, return an empty files array.`;
}

export function parseProposal(text) {
  const raw = String(text || '').trim();
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw;
  const parsed = JSON.parse(body);
  const files = Array.isArray(parsed?.files) ? parsed.files : [];
  return {
    summary: String(parsed?.summary || 'Guardian repair').slice(0, 240),
    files: files
      .filter((file) => file && pathAllowed(file.path) && typeof file.content === 'string')
      .map((file) => ({ path: String(file.path).replace(/^\.\//, ''), content: file.content })),
  };
}

function readSpend(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return { month: '', usd: 0 };
  }
}

export async function propose(incident, fetchImpl, env = process.env) {
  const key = String(env.XAI_API_KEY || '').trim();
  if (!key) return { skipped: true, reason: 'XAI_API_KEY is not set.' };
  const response = await fetchImpl('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: instructions(incident),
        },
        { role: 'user', content: JSON.stringify(incident).slice(0, 12_000) },
      ],
    }),
  });
  if (!response.ok) throw new Error(`xAI returned ${response.status}`);
  const body = await response.json();
  const text = body?.choices?.[0]?.message?.content || '';
  return { skipped: false, proposal: parseProposal(text), usage: body?.usage || {} };
}

export async function main(env = process.env, fetchImpl = fetch) {
  if (!String(env.XAI_API_KEY || '').trim()) {
    console.log('XAI_API_KEY is not set. Leaving the incident for the next run.');
    return 0;
  }
  const spendFile = env.SPEND_FILE || 'spend.json';
  const current = readSpend(existsSync(spendFile) ? spendFile : '');
  if (overCap(nextSpend(current, 0))) {
    console.log(`AI fixer spend for ${current.month} is already $${current.usd}. Stopping.`);
    return 0;
  }
  let incident = { source: env.INCIDENT_SOURCE || 'manual' };
  if (env.INCIDENT_FILE && existsSync(env.INCIDENT_FILE)) incident = JSON.parse(readFileSync(env.INCIDENT_FILE, 'utf8'));
  else if (env.INCIDENT_JSON) incident = JSON.parse(env.INCIDENT_JSON);
  if (incident.source === 'monitor' && !monitorPatchAllowed(incident.log)) {
    console.log('Monitor failure names a real condition. Leaving it for the next pass.');
    return 0;
  }
  const result = await propose(incident, fetchImpl, env);
  if (result.skipped) return 0;
  if (incident.source === 'monitor') result.proposal = limitMonitorProposal(result.proposal);
  const cost = spendCost(result.usage);
  const spend = nextSpend(current, cost.usd);
  writeFileSync(spendFile, JSON.stringify(spend));
  if (!result.proposal.files.length) {
    console.log('The model did not return a safe file change.');
    return 0;
  }
  if (env.APPLY === '1') {
    for (const file of result.proposal.files) writeFileSync(file.path, file.content);
    console.log(result.proposal.summary);
  }
  if (overCap(spend)) console.log(`This run reached the $${MONTHLY_CAP_USD} monthly cap.`);
  return 0;
}

export function writeIncident(env = process.env) {
  let record = { source: 'manual' };
  if (env.EVENT_NAME === 'workflow_run') {
    let log = '';
    const file = env.CI_LOG || '';
    if (file && existsSync(file)) log = readFileSync(file, 'utf8').slice(-8000);
    const name = env.WORKFLOW_NAME || '';
    record = { source: name === 'Monitor (self-healing)' ? 'monitor' : 'ci', runId: env.RUN_ID || '', name, log };
  } else if (env.EVENT_NAME === 'repository_dispatch') {
    let payload = {};
    try {
      payload = JSON.parse(env.CLIENT_PAYLOAD || '{}');
    } catch {
      payload = { raw: String(env.CLIENT_PAYLOAD || '').slice(0, 2000) };
    }
    record = { source: 'guardian-attention', payload };
  }
  writeFileSync(env.INCIDENT_FILE || 'incident.json', JSON.stringify(record));
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) {
  const action = process.argv.includes('--write-incident')
    ? Promise.resolve(writeIncident()).then(() => 0)
    : main();
  action.then((code) => process.exit(code)).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
