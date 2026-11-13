/** Letters drawn in the colored circle when a team has no crest. */
export function crestLetters(abbr: string | null | undefined, name: string | null | undefined): string {
  const fromAbbr = (abbr || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase();
  if (fromAbbr) return fromAbbr;
  const parts = (name || '').replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  const word = (parts[0] || 'TM').slice(0, 3).toUpperCase();
  return word || 'TM';
}

/**
 * Font size in px so the letters sit inside the circle.
 * Three letters use a smaller ratio than one or two.
 */
export function crestFontSize(size: number, letters: string): number {
  const diameter = Number.isFinite(size) && size > 0 ? size : 22;
  const count = Math.min(3, Math.max(1, letters.length));
  const ratio = count >= 3 ? 0.3 : count === 2 ? 0.38 : 0.46;
  return Math.max(6, Math.round(diameter * ratio));
}
