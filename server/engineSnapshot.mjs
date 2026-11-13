/**
 * Last booked board, stored on the public engine-data branch so a restart
 * can restore it without a paid disk. A token is only needed to publish.
 */

const REPO = process.env.ENGINE_SNAPSHOT_REPO || 'OriginalSolution/Betspapa';
const BRANCH = 'engine-data';
const FILE = 'engine-state.json';
export const ENGINE_SNAPSHOT_URL = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${FILE}`;

function token() {
  return process.env.ENGINE_SNAPSHOT_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
}

export async function loadEngineSnapshot(fetchImpl = fetch) {
  const attempts = [
    {
      url: `https://api.github.com/repos/${REPO}/contents/${FILE}?ref=${encodeURIComponent(BRANCH)}`,
      headers: { Accept: 'application/vnd.github.raw', 'User-Agent': 'betspapa-engine' },
    },
    { url: ENGINE_SNAPSHOT_URL, headers: { Accept: 'application/json', 'User-Agent': 'betspapa-engine' } },
  ];
  for (const attempt of attempts) {
    try {
      const response = await fetchImpl(attempt.url, { headers: attempt.headers, signal: AbortSignal.timeout(8_000) });
      if (!response.ok) continue;
      const body = await response.json();
      if (body && typeof body === 'object' && !Array.isArray(body)) return body;
    } catch {
      /* the next copy of the snapshot can still load */
    }
  }
  return null;
}

export async function publishEngineSnapshot(state, fetchImpl = fetch) {
  const key = token();
  if (!key || !state) return false;
  const path = `https://api.github.com/repos/${REPO}/contents/${FILE}`;
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${key}`,
    'User-Agent': 'betspapa-engine',
    'Content-Type': 'application/json',
  };
  try {
    let sha = '';
    const current = await fetchImpl(`${path}?ref=${encodeURIComponent(BRANCH)}`, { headers, signal: AbortSignal.timeout(8_000) });
    if (current.ok) {
      const meta = await current.json();
      sha = meta.sha || '';
    } else if (current.status !== 404) {
      return false;
    }
    const body = {
      message: 'Update the last booked engine board',
      content: Buffer.from(JSON.stringify(state)).toString('base64'),
      branch: BRANCH,
    };
    if (sha) body.sha = sha;
    const saved = await fetchImpl(path, { method: 'PUT', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(12_000) });
    return saved.ok;
  } catch {
    return false;
  }
}
