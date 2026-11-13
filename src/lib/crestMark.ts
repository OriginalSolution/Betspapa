/** Why a stored image is not shown. Sharp crests stay; everything else uses the initials badge. */
export type CrestFlag = 'sharp' | 'low-res' | 'tiny' | 'aspect' | 'crop' | 'flat';

export type CrestBitmap = {
  width: number;
  height: number;
  rgba: ArrayLike<number>;
};

/**
 * A crest is sharp when it is large enough, roughly square, fills its frame,
 * and is not a blank or single-color wash. Blurry, pixelated, tiny, stretched,
 * and badly cropped files fail so the initials badge is used instead.
 */
export function judgeCrest(bitmap: CrestBitmap): CrestFlag {
  const width = bitmap.width;
  const height = bitmap.height;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 48 || height < 48) return 'low-res';
  const frame = width / height;
  if (frame > 2.1 || frame < 1 / 2.1) return 'aspect';
  const rgba = bitmap.rgba;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let opaque = 0;
  const buckets = new Map<number, number>();
  const step = width > 80 ? 2 : 1;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const index = (y * width + x) * 4;
      if ((rgba[index + 3] ?? 0) <= 24) continue;
      opaque += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      const key = ((rgba[index] ?? 0) >> 5 << 10) | ((rgba[index + 1] ?? 0) >> 5 << 5) | ((rgba[index + 2] ?? 0) >> 5);
      buckets.set(key, (buckets.get(key) || 0) + 1);
    }
  }
  if (maxX < 0 || opaque < 8) return 'flat';
  const contentW = maxX - minX + 1;
  const contentH = maxY - minY + 1;
  if (contentW < 32 || contentH < 32) return 'tiny';
  const contentRatio = contentW / contentH;
  if (contentRatio > 2.15 || contentRatio < 1 / 2.15) return 'aspect';
  const fill = (contentW * contentH) / (width * height);
  if (fill < 0.22) return 'crop';
  let dominant = 0;
  for (const count of buckets.values()) if (count > dominant) dominant = count;
  if (dominant / opaque >= 0.92) return 'flat';
  return 'sharp';
}

/** Read a loaded image and decide if it can replace the initials badge. */
export function verdictFromImage(img: CanvasImageSource & { naturalWidth: number; naturalHeight: number }): CrestFlag {
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  if (width < 48 || height < 48) return 'low-res';
  if (width / height > 2.1 || height / width > 2.1) return 'aspect';
  if (typeof document === 'undefined') return 'sharp';
  const canvas = document.createElement('canvas');
  const limit = 72;
  const scale = Math.min(1, limit / Math.max(width, height));
  const sampleW = Math.max(1, Math.round(width * scale));
  const sampleH = Math.max(1, Math.round(height * scale));
  canvas.width = sampleW;
  canvas.height = sampleH;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return 'sharp';
  try {
    context.drawImage(img, 0, 0, sampleW, sampleH);
    const data = context.getImageData(0, 0, sampleW, sampleH).data;
    const verdict = judgeCrest({ width: sampleW, height: sampleH, rgba: data });
    // The sample is already at least 48px on the long side when the source is.
    // A source under 48px was rejected above, so a downsampled sharp file must not be called low-res.
    return verdict === 'low-res' ? 'sharp' : verdict;
  } catch {
    return 'sharp';
  }
}

/** Letters drawn in the colored circle when a team has no sharp crest. */
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
