const SIMULATED = new Set(['demo', 'simulated', 'simulation']);

export function isSimulatedMode(env = process.env) {
  return SIMULATED.has(String(env.DATA_MODE || '').trim().toLowerCase());
}

/** Production never stays on demo or simulated data. */
export function forceLiveMode(env = process.env) {
  if (!isSimulatedMode(env)) return false;
  env.DATA_MODE = 'live';
  return true;
}

export function getConfig(env = process.env) {
  const key = String(env.FOOTBALL_DATA_API_KEY || '').trim();
  const live = !isSimulatedMode(env);
  return {
    mode: live ? 'live' : 'demo',
    provider: live ? 'SportyBet' : 'Simulated matchday',
    pollMs: live ? 20_000 : 8_000,
    reason: live ? null : 'DATA_MODE is forcing simulated scores.',
    footballData: key.length > 0,
    token: key,
  };
}
