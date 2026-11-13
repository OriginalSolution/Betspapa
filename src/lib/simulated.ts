/**
 * Dummy and simulated fixtures are never shown.
 * A real club whose legal name ends in SRL (Società a Responsabilità Limitata)
 * stays. Simulated Reality sides are the short "Club SRL" tags, and the league
 * name or category says so.
 */

const DUMMY = /simulated|virtual|e-?soccer|esports|cyber/i;
const SRL_WORD = /\bsrl\b/i;

export function isSrlSide(name: string | null | undefined): boolean {
  const text = String(name || '').trim();
  if (!text) return false;
  const lower = text.toLowerCase();
  if (/societ[aà]|sportiva|s\.r\.l/.test(lower)) return false;
  return lower.endsWith(' srl');
}

export function isSimulatedFixture(input: {
  country?: string | null;
  tournament?: string | null;
  home?: string | null;
  away?: string | null;
}): boolean {
  const country = String(input.country || '');
  const tournament = String(input.tournament || '');
  const home = String(input.home || '');
  const away = String(input.away || '');
  if (DUMMY.test(`${country} ${tournament} ${home} ${away}`)) return true;
  if (SRL_WORD.test(`${country} ${tournament}`)) return true;
  return isSrlSide(home) && isSrlSide(away);
}
