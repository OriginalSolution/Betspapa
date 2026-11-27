/** Collapsed monitor row, including the gap under it, until the row is measured. */
export const SLIP_ROW_ESTIMATE = 76;

export type SlipSpan = { start: number; end: number; padTop: number; padBottom: number };

/** The rows that overlap the viewport, plus a few above and below. */
export function slipWindow(
  count: number,
  heights: Array<number | undefined>,
  viewStart: number,
  viewHeight: number,
  overscan = 4,
): SlipSpan {
  if (count <= 0) return { start: 0, end: 0, padTop: 0, padBottom: 0 };
  const size = (index: number) => {
    const value = heights[index];
    return value && value > 0 ? value : SLIP_ROW_ESTIMATE;
  };
  const tops: number[] = new Array(count);
  let total = 0;
  for (let index = 0; index < count; index += 1) {
    tops[index] = total;
    total += size(index);
  }
  const viewEnd = viewStart + Math.max(viewHeight, 0);
  let start = 0;
  while (start < count && tops[start] + size(start) <= viewStart) start += 1;
  start = Math.max(0, start - overscan);
  let end = start;
  while (end < count && tops[end] < viewEnd) end += 1;
  end = Math.min(count, end + overscan);
  const padTop = tops[start] ?? 0;
  const shownBottom = end > start ? tops[end - 1] + size(end - 1) : 0;
  return { start, end, padTop, padBottom: Math.max(0, total - shownBottom) };
}
