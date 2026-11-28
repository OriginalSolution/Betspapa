/**
 * Double chance 12 is never picked, recommended, or booked.
 * Other qualifying tips for the same match stay, so the next one is chosen.
 * Strategy codes do not select this market. The last-10 table may still show the stat.
 */

export function isDc12(market) {
  const id = String(market || '');
  return id === 'dc-12' || id === 'dc12';
}

export function withoutDc12(items, read = (item) => item?.market ?? item?.id) {
  return (Array.isArray(items) ? items : []).filter((item) => item && !isDc12(read(item)));
}
