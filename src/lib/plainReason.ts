/** Turn research debug lines into the wording shown on a pick. */
export function plainReason(line: string): string {
  const match = line.match(/(\d+)\s+finished matches,\s+under\s+\d+/i);
  if (!match) return line;
  const count = Number(match[1]);
  if (!Number.isFinite(count) || count <= 0) return 'League record: building, no settled games yet.';
  return `League record: building, ${count} settled ${count === 1 ? 'game' : 'games'} so far.`;
}

export function plainReasons(lines: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const line of lines) {
    const text = plainReason(line).trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    next.push(text);
  }
  return next;
}
