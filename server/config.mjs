export function getConfig(env = process.env) {
  const key = String(env.FOOTBALL_DATA_API_KEY || '').trim();
  const mode = String(env.DATA_MODE || '').trim().toLowerCase();
  const live = mode !== 'demo' && key.length > 0;
  let reason = null;
  if (!live && mode === 'demo' && key) reason = 'DATA_MODE=demo is forcing simulated scores.';
  else if (!live) reason = 'Add FOOTBALL_DATA_API_KEY to use football-data.org. Demo scores are active.';
  return {
    mode: live ? 'live' : 'demo',
    provider: live ? 'football-data.org' : 'Simulated matchday',
    pollMs: live ? 20_000 : 8_000,
    reason,
    token: live ? key : '',
  };
}
