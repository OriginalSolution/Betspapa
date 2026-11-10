/** Wakes the Betspapa web service so the engine cycle runs there, where the codes are stored. */
const base = String(process.env.BETSPAPA_URL || '').replace(/\/$/, '');
const token = process.env.ENGINE_RUN_TOKEN || '';

if (!base || !token) {
  console.error('[engine] BETSPAPA_URL and ENGINE_RUN_TOKEN are required. The scheduled trigger does not book on its own.');
  process.exit(1);
}

const response = await fetch(`${base}/api/engine/run`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  signal: AbortSignal.timeout(120_000),
});
const body = await response.text();
if (!response.ok) {
  console.error(`[engine] Trigger failed (${response.status}): ${body.slice(0, 400)}`);
  process.exit(1);
}
console.log(`[engine] Trigger ok: ${body.slice(0, 400)}`);
