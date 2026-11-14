export function getConfig(env = process.env) {
  const key = String(env.FOOTBALL_DATA_API_KEY || '').trim();
  const mode = String(env.DATA_MODE || '').trim().toLowerCase();
  const live = mode !== 'demo';
  return {
    mode: live ? 'live' : 'demo',
    provider: live ? 'SportyBet' : 'Simulated matchday',
    pollMs: live ? 20_000 : 8_000,
    reason: live ? null : 'DATA_MODE=demo is forcing simulated scores.',
    footballData: key.length > 0,
    token: key,
  };
}
