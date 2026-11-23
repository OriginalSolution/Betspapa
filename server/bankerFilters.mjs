/**
 * Youth, reserve, women and SRL skips, with the false-positive fixes:
 * II in a league name is not a reserve side, and Willem II is a senior club.
 * The reserve pattern is never applied to the league.
 */

const NON_SENIOR_RE = /women|wfc|ladies|female|femen|feminin|frauen|damen|\bliga f\b|wsl|youth|juvenil|juniores|primavera|u-?1\d\b|u-?2[0-3]\b|reserve|academy|nachwuchs|\bclj\b|srl|simulated|esoccer|e-?football|virtual/i;
const RESERVE_TEAM_RE = /\bii\b|\biii\b| 2$| b$|\bjong\b|\bu-?1\d\b|\bu-?2[0-3]\b|\bw$|\breserves?\b/i;
const SENIOR_II_OK = /\bwillem ii\b/i;
const CUP_RE = /cup|copa|pokal|puchar|pohar|coupe|coppa|ta[cç]a|beker|trophy|champions(?!hip)|libertadores|sudamericana|conference|europa|knockout|play-?off|super cup|recopa|supercopa|community shield|carabao|efl cup|fa cup|dfb|knvb|taca|turkiye kupasi|afcon|nations league|club world|intercontinental/i;

export function canon(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function isCupLeague(league) {
  return CUP_RE.test(league || '');
}

function teamIsReserve(name) {
  const raw = String(name || '').trim();
  if (!raw || SENIOR_II_OK.test(raw)) return false;
  return RESERVE_TEAM_RE.test(raw);
}

export function dropReason(country, league, home, away) {
  const blob = `${country} | ${league} | ${home} | ${away}`;
  if (NON_SENIOR_RE.test(blob)) return 'youth / women / SRL / virtual / academy';
  if (teamIsReserve(home) || teamIsReserve(away)) return 'reserve / II / Jong / U-age side';
  return '';
}

export function isSenior(country, league, home, away) {
  return !dropReason(country, league, home, away);
}

/** Top-5 v top-5 or bottom-3 v bottom-3. The caller skips cup tables. */
export function tableClash(hpos, apos, n) {
  const home = Number(hpos);
  const away = Number(apos);
  const size = Number(n);
  if (!home || !away || !size) return '';
  if (home <= 5 && away <= 5) return 'top-5 v top-5';
  if (home > size - 3 && away > size - 3) return 'bottom-3 v bottom-3';
  return '';
}

/** 3+ wins and 3+ games scored in, from the last 5 finished away games. */
export function strongAway(form, { wins = 3, scored = 3, n = 5 } = {}) {
  return Number(form?.n) >= n && Number(form?.wins) >= wins && Number(form?.scored) >= scored;
}

export function leagueKey(country, league) {
  return `${canon(country)}|${canon(league)}`;
}
